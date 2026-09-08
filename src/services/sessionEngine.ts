/**
 * Session engine.
 *
 * This is what the hub used to do, minus the hub. It subscribes to
 * ble.ts's existing global listener mechanism (no changes needed to
 * ble.ts's public API — see the port notes in that file), and for
 * every genuinely-new HR reading:
 *
 *   1. Runs it through the formula engine's processTick() — pure,
 *      synchronous, in-memory.
 *   2. Writes the resulting tick AND the updated accumulator state to
 *      SQLite immediately (write-through, not batched) — see §4 of the
 *      build spec on why this ordering is non-negotiable.
 *   3. Queues the raw tick for cloud sync (via the ticks table's
 *      synced=0 rows — syncQueue.ts drains these independently).
 *   4. Publishes a LiveTick to this module's own listeners, which is
 *      what the Live Session screen actually renders from.
 *
 * A live session runs entirely on steps 1-2-4 with zero network
 * dependency. Step 3 is purely opportunistic.
 */
import { addGlobalBLEListener, type PolarDeviceStatus } from './ble';
import {
  createAccumulator, processTick, finalizeSummary, startTargetInterval, endTargetInterval,
} from '../lib/formula-engine';
import type {
  SessionAccumulatorState, LiveTick, MemberProfile, FinalSessionSummary, Zone,
} from '../lib/formula-engine';
import {
  insertTick, saveAccumulatorState, loadAccumulatorStates,
  upsertSession, upsertSessionMember, saveSessionMemberSummary,
  enqueueSync, getSession, type LocalSessionRow,
} from '../db/database';
import { sessionsApi, type RemoteMember } from './sessionsApi';
import { flushAll } from './syncQueue';
import { computeFillBpm, needsFill, WATCHDOG_TICK_MS } from './sensorWatchdog';
import { startTelemetryReporting, stopTelemetryReporting } from './telemetryReporter';
import { TickStorageFilter } from './tickStorageFilter';

export interface SessionMemberSetup {
  memberId: string;
  memberName: string;
  sensorDeviceId: string; // the ble.ts targetId this athlete is assigned to
}

interface EngineMember extends SessionMemberSetup {
  state: SessionAccumulatorState;
}

type LiveListener = (ticks: Map<string, LiveTick>) => void;

class SessionEngine {
  private sessionId: string | null = null;
  private gymId: string | null = null;
  private trainerId: string | null = null;
  private sessionName = '';
  private startedAtMs = 0;

  private members = new Map<string, EngineMember>(); // keyed by memberId
  private deviceToMember = new Map<string, string>(); // sensorDeviceId -> memberId
  private lastProcessedHeardMs = new Map<string, number>(); // sensorDeviceId -> last lastHeardMs we turned into a tick
  private lastRealTickMs = new Map<string, number>(); // memberId -> wall-clock time of last REAL (non-interpolated) tick
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;

  // Gates which ticks actually get an insertTick() row (SQLite + cloud
  // sync + graphs) — every real tick still runs through processTick()
  // regardless, so scoring accuracy is untouched. See tickStorageFilter.ts.
  private storageFilter = new TickStorageFilter();

  private liveTicks = new Map<string, LiveTick>();
  private liveListeners = new Set<LiveListener>();
  private rosterListeners = new Set<() => void>();
  private unsubscribeBle: (() => void) | null = null;
  private _paused = false;

  get isPaused() {
    return this._paused;
  }

  pause() {
    this._paused = true;
  }

  resume() {
    this._paused = false;
  }

  get isActive() {
    return this.sessionId !== null;
  }
  get currentSessionId() {
    return this.sessionId;
  }

  /**
   * The members configured into the currently active session, keyed by
   * memberId — used by the Live Session screen to render "waiting for
   * signal" tiles for everyone BEFORE their first tick arrives (rather
   * than only showing members who already have a live reading).
   */
  getMemberRoster(): SessionMemberSetup[] {
    return Array.from(this.members.values()).map((m) => ({
      memberId: m.memberId,
      memberName: m.memberName,
      sensorDeviceId: m.sensorDeviceId,
    }));
  }

  /** Lightweight session metadata for headers/status displays. */
  getSessionMeta(): { sessionId: string; sessionName: string; startedAtMs: number; paused: boolean } | null {
    if (!this.sessionId) return null;
    return {
      sessionId: this.sessionId,
      sessionName: this.sessionName,
      startedAtMs: this.startedAtMs,
      paused: this._paused,
    };
  }

  addLiveListener(fn: LiveListener): () => void {
    this.liveListeners.add(fn);
    return () => this.liveListeners.delete(fn);
  }

  /**
   * Fired whenever the ROSTER's composition changes — a sensor gets
   * assigned/reassigned, a late-joiner is added, or a member is marked
   * absent — as distinct from addLiveListener()'s tick-by-tick BPM
   * stream. The Live Session screen's "dead block" grid subscribes to
   * this to know when to re-read getMemberRoster().
   */
  addRosterListener(fn: () => void): () => void {
    this.rosterListeners.add(fn);
    return () => this.rosterListeners.delete(fn);
  }

  // Listener dispatch is firewalled per-listener: a throwing screen
  // subscription can't escape into the BLE callback stack that triggered
  // this publish (ble.ts guards its own side too) or starve the other
  // subscribers of the update.
  private publishRoster() {
    for (const fn of Array.from(this.rosterListeners)) {
      try { fn(); } catch (e) { console.warn('[sessionEngine] roster listener threw:', e); }
    }
  }

  private publish() {
    for (const fn of Array.from(this.liveListeners)) {
      try { fn(new Map(this.liveTicks)); } catch (e) { console.warn('[sessionEngine] live listener threw:', e); }
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  /**
   * Starts a NEW session: mints a local session id immediately (so the
   * app never blocks on the cloud API to start recording), queues the
   * cloud `create` call, and wires up BLE → formula-engine → SQLite.
   * Assign sensors to members via assignSensor() before or after this —
   * ticks for an unassigned sensor are held (not dropped) until assigned,
   * see the BLE handler below.
   */
  async startSession(params: {
    localSessionId: string; // caller mints this (e.g. a uuid) — becomes the cloud id once synced
    gymId: string;
    trainerId: string;
    sessionName: string;
    members: { member: RemoteMember; sensorDeviceId: string }[];
    scheduledAt?: string;
    scheduledEndAt?: string;
  }): Promise<void> {
    if (this.isActive) throw new Error('A session is already active — end it before starting another.');

    this.sessionId = params.localSessionId;
    this.gymId = params.gymId;
    this.trainerId = params.trainerId;
    this.sessionName = params.sessionName;
    this.startedAtMs = Date.now();
    this.members.clear();
    this.deviceToMember.clear();
    this.lastProcessedHeardMs.clear();
    this.lastRealTickMs.clear();
    this.liveTicks.clear();
    this.storageFilter.clear();

    const sessionRow: LocalSessionRow = {
      session_id: this.sessionId,
      section_id: null,
      session_name: params.sessionName,
      trainer_id: params.trainerId,
      gym_id: params.gymId,
      started_at: this.startedAtMs,
      ended_at: null,
      scheduled_at: params.scheduledAt ? new Date(params.scheduledAt).getTime() : null,
      scheduled_end_at: params.scheduledEndAt ? new Date(params.scheduledEndAt).getTime() : null,
      duration_seconds: null,
      status: 'in_progress',
      summary_json: null,
      created_at: this.startedAtMs,
      synced: 0,
    };
    await upsertSession(sessionRow);

    // Rehydrate any accumulator state already on disk for this session id
    // (covers the resume-after-crash path — startSession() with a
    // previously-used localSessionId picks up exactly where it left off).
    const existingStates = await loadAccumulatorStates(this.sessionId);

    for (const { member, sensorDeviceId } of params.members) {
      const profile = toMemberProfile(member);
      const state = existingStates.get(member.id) ?? createAccumulator(profile, member.id);
      this.members.set(member.id, { memberId: member.id, memberName: member.name, sensorDeviceId, state });
      // A member can enter a session with NO sensor yet (a "dead block" —
      // the trainer assigns it later, live, from the session grid). Only
      // wire the BLE device map for members that actually have one.
      if (sensorDeviceId) this.deviceToMember.set(sensorDeviceId, member.id);
      await upsertSessionMember(this.sessionId, member.id, member.name, sensorDeviceId);
    }

    // Queue the cloud-side create + enroll + start; the session is
    // already fully "live" locally regardless of whether/when this
    // succeeds. `id` here is what makes the local and cloud session
    // the SAME row from the start (see CreateSessionInput.id) — every
    // event queued below and every later reading/end call reuses this
    // exact id, valid immediately, no reconciliation step needed.
    //
    // Each member must be enrolled server-side (session_members row)
    // BEFORE readings/end are ingested — the cloud API rejects a
    // reading or a result for a member it doesn't know is in this
    // session. Queued here, ahead of session_start, so enrollment is
    // always applied before any tick has a chance to sync.
    await enqueueSync('session_create', this.sessionId, {
      id: this.sessionId,
      name: params.sessionName,
      scheduledAt: params.scheduledAt,
    });
    for (const { member } of params.members) {
      await enqueueSync('member_enroll', this.sessionId, { memberId: member.id });
    }
    await enqueueSync('session_start', this.sessionId, {});
    flushAll().catch(() => {});

    this.unsubscribeBle = addGlobalBLEListener((deviceId, status) => this.handleBleStatus(deviceId, status));
    this.startWatchdog();
    startTelemetryReporting(this.sessionId ?? undefined);
    this.publishRoster();
  }

  // ── Disconnect watchdog / gap-fill ──────────────────────────────
  //
  // Runs once per second while a session is active. For every member
  // who HAS an assigned sensor and has produced at least one real tick,
  // checks whether that sensor has gone quiet for >15s and, if so,
  // synthesizes exactly one filled tick for this second — see
  // sensorWatchdog.ts for why the fill is trend-based and bounded.
  // Members with no sensor assigned at all (dead blocks) are skipped
  // entirely; there's no "recent trend" to fill from and nothing to
  // watchdog until a sensor is actually assigned.
  private startWatchdog() {
    this.stopWatchdog();
    this.watchdogTimer = setInterval(() => this.runWatchdogTick(), WATCHDOG_TICK_MS);
  }

  private stopWatchdog() {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  private runWatchdogTick() {
    if (!this.sessionId || this._paused) return;
    const now = Date.now();

    for (const member of this.members.values()) {
      if (!member.sensorDeviceId) continue; // dead block — nothing to watchdog yet
      const lastReal = this.lastRealTickMs.get(member.memberId) ?? 0;
      if (lastReal === 0) continue; // never had a real tick this session — stays a plain "waiting" tile, not "reconnecting"
      if (!needsFill(lastReal, now)) continue;

      const gapSeconds = (now - lastReal) / 1000;
      const { bpm, cappedOut } = computeFillBpm(member.state, gapSeconds);

      try {
        if (!cappedOut) {
          const { state, liveTick } = processTick(member.state, { memberId: member.memberId, ts: now, bpm, interpolated: true }, member.memberName);
          member.state = state;
          this.liveTicks.set(member.memberId, liveTick);

          // Watchdog fills always get stored (see tickStorageFilter.ts's
          // file header on why interpolated ticks are exempt from
          // thinning) — this call also anchors the storage filter so the
          // next REAL tick after reconnect is force-kept too.
          this.storageFilter.shouldKeep(member.memberId, now, bpm, true);
          // Persisted with interpolated=1 (see database.ts) — internal
          // QA trail only, never read back into any member/trainer copy.
          insertTick(this.sessionId!, member.memberId, now, bpm, true).catch((e) => console.warn('[sessionEngine][watchdog] insertTick failed', e));
          saveAccumulatorState(this.sessionId!, member.memberId, state).catch((e) => console.warn('[sessionEngine][watchdog] saveAccumulatorState failed', e));
        } else {
          // Past the fill cap — freeze scoring, but keep the tile
          // showing "reconnecting" (not a dropped/blank tile) by
          // republishing the existing liveTick with the flag set.
          const existing = this.liveTicks.get(member.memberId);
          if (existing && !existing.isReconnecting) {
            this.liveTicks.set(member.memberId, { ...existing, isReconnecting: true });
          }
        }
      } catch (e) {
        console.warn('[sessionEngine][watchdog] fill tick error:', e);
      }
    }
    this.publish();
  }

  /** Reassign or add a sensor mid-session — this is the ONLY sensor-assignment
   *  path there is; there's no separate "assign sensor" screen. Works both
   *  for fixing a mis-paired sensor and for filling in a "dead block"
   *  (a member who started the session with no sensor at all).
   *  Returns the member who was bumped off this sensor, if any — a real
   *  device can appear in the nearby-scan list again while it's already
   *  assigned to someone else in this same session (still broadcasting,
   *  trainer taps it for a different member by mistake, or re-assigns it
   *  on purpose after member A dropped out). Before this fix,
   *  `deviceToMember` was correctly repointed to the new member but the
   *  bumped member's own `sensorDeviceId` field was never cleared — their
   *  tile kept showing "connected" to a sensor that was actually now
   *  routing ticks to someone else, silently, with no warning to the
   *  trainer. */
  assignSensor(memberId: string, sensorDeviceId: string): { bumpedMemberId: string; bumpedMemberName: string } | null {
    const m = this.members.get(memberId);
    if (!m) return null;

    let bumped: { bumpedMemberId: string; bumpedMemberName: string } | null = null;
    const previousOwnerId = this.deviceToMember.get(sensorDeviceId);
    if (previousOwnerId && previousOwnerId !== memberId) {
      const previousOwner = this.members.get(previousOwnerId);
      if (previousOwner) {
        previousOwner.sensorDeviceId = '';
        bumped = { bumpedMemberId: previousOwnerId, bumpedMemberName: previousOwner.memberName };
      }
    }

    if (m.sensorDeviceId) this.deviceToMember.delete(m.sensorDeviceId);
    m.sensorDeviceId = sensorDeviceId;
    this.deviceToMember.set(sensorDeviceId, memberId);
    this.storageFilter.reset(memberId); // new physical sensor — don't diff its first reading against the old one's stale bpm
    this.publishRoster();
    return bumped;
  }

  /**
   * Late join — a member who wasn't part of the original roster taps in
   * mid-session. They enter as a "dead block" (no sensor yet); the
   * trainer taps their tile immediately after to assign one, same as
   * any other unassigned block.
   */
  async addLateMember(member: RemoteMember): Promise<void> {
    if (!this.sessionId || this.members.has(member.id)) return;
    const profile = toMemberProfile(member);
    const state = createAccumulator(profile, member.id);
    this.members.set(member.id, { memberId: member.id, memberName: member.name, sensorDeviceId: '', state });
    await upsertSessionMember(this.sessionId, member.id, member.name, '');
    await enqueueSync('member_enroll', this.sessionId, { memberId: member.id });
    flushAll().catch(() => {});
    this.publishRoster();
  }

  /**
   * Marks a member absent for this session — removes their block from
   * the live grid entirely (rather than leaving a permanent dead block)
   * and records the no-show server-side.
   */
  async markAbsent(memberId: string): Promise<void> {
    if (!this.sessionId) return;
    const m = this.members.get(memberId);
    if (!m) return;
    if (m.sensorDeviceId) this.deviceToMember.delete(m.sensorDeviceId);
    this.members.delete(memberId);
    this.liveTicks.delete(memberId);
    this.lastRealTickMs.delete(memberId);
    this.storageFilter.reset(memberId);
    await enqueueSync('member_absent', this.sessionId, { memberId });
    flushAll().catch(() => {});
    this.publish();
    this.publishRoster();
  }

  startTargetInterval(zone: Zone) {
    for (const m of this.members.values()) m.state = startTargetInterval(m.state, zone);
  }

  endTargetInterval() {
    for (const m of this.members.values()) m.state = endTargetInterval(m.state);
  }

  /**
   * Ends the session: finalizes every member's summary, persists it
   * locally, queues the cloud submission, and tears down the BLE
   * subscription. Returns the summaries so the caller (post-workout
   * summary screen) can render a leaderboard immediately without
   * waiting on the network.
   */
  async endSession(onProgress?: (current: number, total: number, memberName: string) => void): Promise<FinalSessionSummary[]> {
    if (!this.sessionId) throw new Error('No active session.');
    const sessionId = this.sessionId;
    const endedAtMs = Date.now();
    const durationHours = Math.max(0, (endedAtMs - this.startedAtMs) / 3_600_000);

    const memberList = Array.from(this.members.values());
    const summaries: FinalSessionSummary[] = [];
    for (let i = 0; i < memberList.length; i++) {
      const m = memberList[i];
      onProgress?.(i + 1, memberList.length, m.memberName);
      // One member's corrupted accumulator state (e.g. a NaN that crept
      // in from a bad tick) must never be able to abort finalization for
      // the rest of the class — that would strand the whole session
      // half-ended: some members saved, everyone else lost, no leaderboard.
      // Skip just that member and keep going; they're logged so it's
      // visible, not silently dropped.
      try {
        const summary = finalizeSummary({ state: m.state, durationHours });
        summaries.push(summary);
        await saveSessionMemberSummary(sessionId, m.memberId, summary);
      } catch (e) {
        console.warn(`[sessionEngine] finalizeSummary failed for member ${m.memberId} — skipping:`, e);
      }
    }

    // Rank within this session, highest sweat score first — matches
    // the Admin Panel / Branch Portal leaderboard convention.
    const ranked = [...summaries].sort((a, b) => b.uvScore - a.uvScore);
    ranked.forEach((s, i) => { s.finalRank = i + 1; });

    const local = await getSession(sessionId);
    await upsertSession({
      session_id: sessionId,
      section_id: local?.section_id ?? null,
      session_name: this.sessionName,
      trainer_id: this.trainerId!,
      gym_id: this.gymId!,
      started_at: this.startedAtMs,
      ended_at: endedAtMs,
      scheduled_at: local?.scheduled_at ?? null,
      scheduled_end_at: local?.scheduled_end_at ?? null,
      duration_seconds: Math.round((endedAtMs - this.startedAtMs) / 1000),
      status: 'completed',
      summary_json: JSON.stringify(summaries),
      created_at: local?.created_at ?? this.startedAtMs,
      synced: 0,
    });

    await enqueueSync('session_end', sessionId, summaries);
    flushAll().catch(() => {});

    this.stopWatchdog();
    stopTelemetryReporting();
    this.unsubscribeBle?.();
    this.unsubscribeBle = null;
    this.sessionId = null;
    this.members.clear();
    this.deviceToMember.clear();
    this.lastRealTickMs.clear();
    this.liveTicks.clear();

    return ranked;
  }

  async cancelSession(reason: string): Promise<void> {
    if (!this.sessionId) return;
    const sessionId = this.sessionId;
    const local = await getSession(sessionId);
    if (local) await upsertSession({ ...local, status: 'cancelled', ended_at: Date.now(), synced: 0 });
    await enqueueSync('session_cancel', sessionId, { reason });
    flushAll().catch(() => {});

    this.stopWatchdog();
    stopTelemetryReporting();
    this.unsubscribeBle?.();
    this.unsubscribeBle = null;
    this.sessionId = null;
    this.members.clear();
    this.deviceToMember.clear();
    this.lastRealTickMs.clear();
    this.liveTicks.clear();
  }

  // ── BLE → formula engine → SQLite ───────────────────────────────

  private handleBleStatus(deviceId: string, status: PolarDeviceStatus) {
    if (!this.sessionId || this._paused) return;
    if (status.state !== 'connected') return;
    if (!status.hr || status.hr <= 0) return;

    // A single bad tick must never be able to take down the BLE listener
    // chain or the live UI — log and skip it instead.
    try {
      // _emit() (in ble.ts) fires on ANY status field changing — rssi
      // polls, battery reads, etc. — not just a fresh HR packet. Dedupe
      // on lastHeardMs so those don't get turned into duplicate ticks.
      const prevHeard = this.lastProcessedHeardMs.get(deviceId) ?? 0;
      if (status.lastHeardMs <= prevHeard) return;
      this.lastProcessedHeardMs.set(deviceId, status.lastHeardMs);

      const memberId = this.deviceToMember.get(deviceId);
      if (!memberId) return; // sensor connected but not assigned to anyone yet — held, not dropped (next assignSensor() call catches future ticks)
      const member = this.members.get(memberId);
      if (!member) return;

      const ts = status.lastHeardMs;
      this.lastRealTickMs.set(memberId, Date.now());
      const { state, liveTick } = processTick(member.state, { memberId, ts, bpm: status.hr }, member.memberName);
      member.state = state;
      this.liveTicks.set(memberId, liveTick);
      this.publish();

      // Write-through — both calls fire-and-forget from this synchronous
      // handler's perspective (SQLite writes are async, but nothing here
      // waits on them before the NEXT tick can be processed; expo-sqlite
      // serializes writes internally, so ordering is preserved regardless).
      //
      // insertTick() itself is gated by the adaptive storage filter —
      // processTick() above already ran on EVERY real reading (scoring
      // accuracy is unaffected), this only decides whether the raw
      // reading is ALSO worth a row in the ticks table / cloud sync /
      // graph log. See tickStorageFilter.ts.
      if (this.storageFilter.shouldKeep(memberId, ts, status.hr, false)) {
        insertTick(this.sessionId, memberId, ts, status.hr).catch((e) => console.warn('[sessionEngine] insertTick failed', e));
      }
      saveAccumulatorState(this.sessionId, memberId, state).catch((e) => console.warn('[sessionEngine] saveAccumulatorState failed', e));
    } catch (e) {
      console.warn('[sessionEngine] tick processing error:', e);
    }
  }
}

function toMemberProfile(member: RemoteMember): MemberProfile {
  return {
    age: member.ageYears ?? 30,
    sex: member.sex === 'female' ? 'female' : 'male', // formula engine's Sex type is binary — see types.ts; "other" falls back to the male MHR formula constant, a known simplification pending a formula-engine update
    weightKg: member.weightKg ?? 70,
    heightCm: member.heightCm ?? 170,
    restingHr: member.restingHr ?? 65,
    storedMhr: null,
    sessionCount: 0,
  };
}

export const sessionEngine = new SessionEngine();
