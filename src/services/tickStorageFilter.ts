/**
 * Adaptive tick storage filter.
 *
 * PROBLEM: sessionEngine.ts used to call insertTick() on every single
 * real BLE reading (~1/sec/member). That row goes three places: the
 * phone's SQLite `ticks` table, the sync-queue batch upload, and the
 * cloud's `sensor_readings` table. At 1 tick/sec that's ~3,600 rows
 * per member per hour-long session — almost all of it visually
 * redundant, since BPM barely moves second-to-second during a steady
 * warm-up or steady-state cardio block. That's the actual "storage
 * fills up fast" problem for the GRAPH data specifically (this is
 * separate from, and upstream of, the cloud's LTTB chartSeries +
 * sensor-readings-retention job, which compact/purge AFTER the fact —
 * see sessions.service.ts's rebuildChartSeries and
 * sensor-readings-retention.job.ts on the cloud-api-v2 side. This
 * filter cuts the volume at the source instead, before it ever touches
 * the phone's disk or the network).
 *
 * THE RULE ("adaptive min/max interval + change threshold"):
 * keep a real tick if EITHER
 *   (a) >= MAX_KEEP_INTERVAL_MS has passed since the last KEPT point
 *       for this member (safety cap — guarantees a floor sample rate
 *       even during a dead-flat steady state), OR
 *   (b) the BPM has moved by >= KEEP_BPM_DELTA since the last KEPT
 *       point (so a spike, a recovery drop, or the start/end of an
 *       interval is never smoothed away),
 * whichever comes first. Dense during spikes/recovery, sparse during
 * steady state, never misses a real move the way a flat interval can.
 *
 * CRITICAL — WHAT THIS DOES **NOT** TOUCH:
 * This filter only gates the STORAGE call (insertTick / what gets
 * synced). It must never be applied upstream of processTick(). Every
 * real BLE reading still runs through the formula engine every single
 * time (sessionEngine.ts's handleBleStatus calls processTick()
 * unconditionally, then asks this filter only when deciding whether to
 * ALSO write a `ticks` row). Zone-seconds, sweatPoints, calories, EPOC,
 * etc. are accumulated live off of every real reading and persisted
 * every tick via saveAccumulatorState() — that accuracy is completely
 * unaffected by how sparse the raw log ends up being. This filter is
 * purely about what gets kept for later GRAPH rendering / cloud
 * recompute, never about what gets counted.
 *
 * WATCHDOG (interpolated) TICKS ARE EXEMPT — see shouldKeep()'s second
 * argument. A gap-fill tick already only fires once/sec during a
 * confirmed dropout (sensorWatchdog.ts), which is already low-volume
 * and is the one thing a later cloud recompute needs at full density
 * to correctly detect "was this member actually connected right here"
 * (see session-recalc.util.ts's MAX_TICK_GAP_SECONDS, which was raised
 * from 5s to match this filter's MAX_KEEP_INTERVAL_MS — a large gap in
 * the stored log is now an expected, intentional artifact of this
 * filter rather than a sign the sensor dropped out, so the recompute's
 * time-weighting had to be told the new, larger "still connected"
 * ceiling). Thinning the already-sparse watchdog stream further would
 * just make dropouts harder to audit for near-zero storage benefit.
 *
 * The very first real tick after a gap (i.e. the first tick seen for a
 * member, or the first one after a watchdog fill) is always force-kept
 * too, so the stored log never opens with a guess about when the
 * member actually reconnected.
 */

export const MAX_KEEP_INTERVAL_MS = 15_000; // safety cap (b) — matches sensorWatchdog.ts's own 15s gap threshold
export const KEEP_BPM_DELTA = 4; // change threshold (a) — smallest move that always earns a stored point

interface KeptRef {
  ts: number;
  bpm: number;
  wasInterpolated: boolean;
}

/** One of these per active session; reset (or just discarded) at session end. */
export class TickStorageFilter {
  private lastKept = new Map<string, KeptRef>(); // memberId -> last stored point

  /**
   * Decide whether THIS reading should be written to the `ticks` table.
   * Call once per real (or watchdog-fill) reading, in order, per member.
   * Watchdog/interpolated ticks always return true (see file header) but
   * still update lastKept so the next REAL tick is measured against
   * where the fill left off, not against a stale pre-dropout point.
   */
  shouldKeep(memberId: string, ts: number, bpm: number, interpolated: boolean): boolean {
    const prev = this.lastKept.get(memberId);

    let keep: boolean;
    if (!prev) {
      keep = true; // first tick this member has ever produced this session
    } else if (interpolated || prev.wasInterpolated) {
      // Always keep watchdog fills themselves, AND always force-keep the
      // first real tick that lands right after one — that's the actual
      // reconnect moment and must anchor the next interval, not be
      // silently absorbed into a >15s-old reference point.
      keep = true;
    } else {
      const elapsed = ts - prev.ts;
      const delta = Math.abs(bpm - prev.bpm);
      keep = elapsed >= MAX_KEEP_INTERVAL_MS || delta >= KEEP_BPM_DELTA;
    }

    if (keep) this.lastKept.set(memberId, { ts, bpm, wasInterpolated: interpolated });
    return keep;
  }

  /** Drop a member's reference point — call on markAbsent/reassignment so a
   *  brand-new sensor stream doesn't get diffed against a stale bpm. */
  reset(memberId: string): void {
    this.lastKept.delete(memberId);
  }

  clear(): void {
    this.lastKept.clear();
  }
}
