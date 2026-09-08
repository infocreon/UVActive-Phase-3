/**
 * UV Active — BLE Scan Mediator
 * ───────────────────────────────────────────────────────────────────────
 * ROOT CAUSE THIS FILE FIXES:
 *   react-native-ble-plx's BleManager only supports ONE active
 *   `startDeviceScan()` callback at a time per manager instance. Previously,
 *   every PolarDevice instance called `manager.startDeviceScan()` and
 *   `manager.stopDeviceScan()` independently. With 2+ sensors connecting or
 *   reconnecting concurrently, each call silently replaced the other's scan
 *   callback — so one sensor's "device found" events stopped arriving,
 *   it timed out, retried, and could in turn steal the scan back from a
 *   different sensor. This produced exactly the symptom reported: stable
 *   with one sensor, unstable / randomly disconnecting with several.
 *
 * FIX:
 *   A single shared scan loop is mediated through this module. Each
 *   PolarDevice "subscribes" with a matcher function instead of calling
 *   startDeviceScan itself. One native scan runs whenever ≥1 subscriber is
 *   waiting; every discovered device is dispatched to every matcher; the
 *   scan stops only when the last subscriber unsubscribes.
 *
 *   GATT connect() calls are also serialized through `connectSerialized()`
 *   with a small stagger — issuing several simultaneous connect() calls is
 *   a well-known source of GATT_ERROR/133 disconnects on Android when
 *   multiple BLE peripherals are involved.
 *
 * CONCURRENT-CONNECTION CAP (previous revision):
 *   Staggering start times is not the same thing as limiting how many
 *   sensors stay LIVE-CONNECTED at once. Android's BLE radio has a real,
 *   hardware/stack-level ceiling on simultaneous GATT links — commonly
 *   4–7 depending on chipset and OEM skin. MAX_CONCURRENT_CONNECTIONS
 *   below caps how many attempt a live GATT link at once; the rest queue
 *   for a slot instead of piling onto an already-saturated radio.
 *
 * EXCLUSIVE DEVICE CLAIMS (this revision) — THE PACKET-CROSSTALK FIX:
 *   With the shared scan, every discovered advertisement was checked
 *   against EVERY waiting subscriber's matcher, and ALL matching
 *   subscribers got notified (see the old dispatch loop). `_isTargetDevice()`
 *   in ble.ts matches partly by ID suffix and partly by substring-in-name
 *   — exactly the kind of matching that can accept the SAME physical
 *   sensor for TWO different target IDs when several sensors with
 *   similar serials are all advertising at once (far more likely with 3
 *   sensors scanning concurrently than with 1). When that happened, both
 *   PolarDevice instances independently called connect() on the same
 *   physical device — and each then tagged that ONE real sensor's HR
 *   packets with its OWN (different) device_id before it ever reached the
 *   session engine.
 *   Result: connect several sensors at once and one member's tile shows
 *   another real person's BPM, because two slots were quietly reading the
 *   same physical strap.
 *
 *   The fix has to live here, not in the matcher, because a matcher has
 *   no visibility into what other subscribers are doing — only the
 *   mediator sees every subscriber at once. Now: the moment any matcher
 *   accepts a discovered device, that device's native id is claimed
 *   exclusively (`_claimedBy`), and every other subscriber is skipped for
 *   that device — this discovery event and every future one — until the
 *   claim is released (connect failed/timed out, or the device fully
 *   disconnected). A second target physically cannot bind to an
 *   already-claimed sensor, regardless of how loose either matcher's
 *   string comparison is.
 */

import { BleManager, type Device } from 'react-native-ble-plx';

// ── GATT filter used for every native scan ──────────────────────────────
// Every Polar sensor (H10, H9, Verity Sense, OH1) advertises the standard
// Bluetooth SIG Heart Rate Service. Passing this UUID to startDeviceScan()
// tells the OS's BLE stack itself to drop every non-matching advertisement
// (phones, earbuds, watches, beacons, other people's gym equipment, etc.)
// before it ever reaches this app — instead of scanning for literally
// everything (`null`) and filtering in JS afterwards.
//
// This is the fix for two separate reported symptoms at once:
//  1. "Nearby scan shows every Bluetooth device in the surroundings" —
//     because the old `null` filter matched anything advertising, so a
//     crowded gym floor could surface dozens of irrelevant devices.
//  2. The flickering / constantly-rescanning list — each stray
//     advertisement was triggering a state update and a re-sort of the
//     nearby-devices list, so the UI never settled. Cutting the callback
//     volume down to "only Heart-Rate-Service devices" removes nearly all
//     of that churn.
const HR_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';

// Conservative default: comfortably under every mainstream Android chipset's
// real-world reliable ceiling (reports vary 4–7). Tunable per phone model if
// a gym standardises on hardware known to handle more — see
// setMaxConcurrentConnections() below, exposed from SensorBridgeScreen.
const DEFAULT_MAX_CONCURRENT_CONNECTIONS = 6;

// ── Shared BleManager singleton ─────────────────────────────────────────
let _manager: BleManager | null = null;
export function getSharedManager(): BleManager {
  if (!_manager) _manager = new BleManager();
  return _manager;
}
export function destroySharedManager() {
  try { _manager?.destroy(); } catch {}
  _manager = null;
}

// ── Scan mediation ───────────────────────────────────────────────────────
type Matcher  = (device: Device) => boolean;
type OnFound  = (device: Device) => void;

interface Subscriber {
  id:        string;
  matcher:   Matcher;
  onFound:   OnFound;
  exclusive: boolean;
}

const CONNECT_STAGGER_MS = 350; // min gap between successive connect() calls

class BleScanMediator {
  private _subs = new Map<string, Subscriber>();
  private _scanning = false;
  private _connectQueue: Array<() => void> = [];
  private _connectBusy = false;

  // ── Live connection-slot accounting ──────────────────────────────────
  private _maxConcurrent = DEFAULT_MAX_CONCURRENT_CONNECTIONS;
  private _activeSlots = new Set<string>();
  private _slotWaiters: Array<{ id: string; resolve: () => void }> = [];

  // ── Exclusive device-claim registry ───────────────────────────────────
  // Maps a physical BLE device id -> the targetId that claimed it. Once
  // claimed, no other subscriber's matcher is even consulted for that
  // device id until it's released. This is what makes cross-attribution
  // structurally impossible, independent of how fuzzy any one matcher's
  // own string comparison is. See file header — this is the fix for
  // "connect 3 sensors, one tile shows someone else's BPM".
  private _claimedBy = new Map<string, string>(); // deviceId -> targetId

  setMaxConcurrentConnections(n: number) {
    this._maxConcurrent = Math.max(1, Math.floor(n));
    this._drainSlotWaiters();
  }
  get maxConcurrentConnections() { return this._maxConcurrent; }
  get activeConnectionCount() { return this._activeSlots.size; }
  get queuedForSlotCount() { return this._slotWaiters.length; }

  /**
   * Resolves once a live-connection slot is free for `id` — blocks past the
   * cap instead of letting every PolarDevice race for the radio at once.
   * Call BEFORE connectSerialized() in the connect path.
   */
  waitForConnectionSlot(id: string): Promise<void> {
    if (this._activeSlots.has(id)) return Promise.resolve(); // already holds one (e.g. reconnect race)
    if (this._activeSlots.size < this._maxConcurrent) {
      this._activeSlots.add(id);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this._slotWaiters.push({ id, resolve: () => { this._activeSlots.add(id); resolve(); } });
    });
  }

  /** Give back a live-connection slot (device fully disconnected, or gave up mid-connect). */
  releaseConnectionSlot(id: string) {
    this._activeSlots.delete(id);
    // Also drop it from the wait queue in case it was cancelled before its turn.
    this._slotWaiters = this._slotWaiters.filter(w => w.id !== id);
    this._drainSlotWaiters();
  }

  private _drainSlotWaiters() {
    while (this._activeSlots.size < this._maxConcurrent && this._slotWaiters.length > 0) {
      const next = this._slotWaiters.shift()!;
      next.resolve();
    }
  }

  /**
   * Release a claimed physical device so it can be matched again — call
   * whenever a target gives up on a device (connect failed/timed out) or
   * fully disconnects from it. Only releases if `targetId` is actually the
   * one holding the claim, so a stale/late release from an old attempt
   * can't accidentally free a device someone else has since legitimately
   * claimed.
   */
  releaseDeviceClaim(deviceId: string | null | undefined, targetId: string) {
    if (!deviceId) return;
    if (this._claimedBy.get(deviceId) === targetId) {
      this._claimedBy.delete(deviceId);
    }
  }

  /**
   * Subscribe a target device ID. Starts the shared scan if it isn't running.
   *
   * `exclusive` (default true) controls whether this subscriber
   * participates in the device-claim registry:
   *   - exclusive=true  (per-sensor connect attempts, the normal case):
   *     wins sole rights to a matched device; skipped entirely for any
   *     device another exclusive subscriber already holds.
   *   - exclusive=false (the nearby-browse "Scan Nearby" list): sees
   *     EVERY matching advertisement regardless of claim state, and never
   *     claims a device itself. It's a passive observer, not a connector
   *     — it doesn't call connect() and needs repeated onFound calls per
   *     device for RSSI refresh, so it must never participate in
   *     exclusivity. Making it exclusive was a real bug: the first time
   *     a browse scan saw a sensor it would permanently "claim" that
   *     device and never release it (nothing about browsing ever calls
   *     releaseDeviceClaim), which silently blocked the REAL connect
   *     attempt's own scan from ever matching that sensor again the
   *     moment a trainer tapped it to connect — the tap would just hang
   *     forever with no error. That's the "nearby scan still not
   *     working" bug.
   */
  requestScan(id: string, matcher: Matcher, onFound: OnFound, exclusive: boolean = true) {
    this._subs.set(id, { id, matcher, onFound, exclusive });
    this._ensureScanning();
  }

  /** Unsubscribe. Stops the shared scan once nobody is left waiting. */
  cancelScan(id: string) {
    this._subs.delete(id);
    if (this._subs.size === 0) this._stopScanning();
  }

  /** True if this id currently has an active scan subscription. */
  isWaiting(id: string): boolean {
    return this._subs.has(id);
  }

  get activeSubscriberCount(): number {
    return this._subs.size;
  }

  private _ensureScanning() {
    if (this._scanning) return;
    this._scanning = true;
    try {
      // getSharedManager() constructs the native BleManager on first call,
      // which can throw (e.g. the BLE stack is unavailable right after
      // launch). Keeping it inside the try block means the failure resets
      // _scanning so the next subscriber can retry cleanly.
      const mgr = getSharedManager();
      mgr.startDeviceScan([HR_SERVICE_UUID], { allowDuplicates: false }, (err, device) => {
        if (err) {
          console.warn('[BleScanMediator] scan error:', err.message);
          return;
        }
        if (!device) return;

        // Observers (exclusive=false, e.g. the nearby-browse scan) see
        // EVERY matching device on EVERY advertisement, unconditionally —
        // they never hold or connect to anything, so claim state is
        // irrelevant to them. Run these first and unconditionally; see
        // requestScan()'s doc comment for why this split exists.
        for (const sub of this._subs.values()) {
          if (sub.exclusive) continue;
          try {
            if (sub.matcher(device)) sub.onFound(device);
          } catch (e) {
            console.warn('[BleScanMediator] observer matcher threw:', e);
          }
        }

        // Exclusive subscribers (real connect attempts): already claimed
        // by another exclusive claimant — skip entirely. This is the
        // guarantee that prevents two members' slots from ever binding to
        // the same physical sensor.
        //
        // IMPORTANT: this check must NOT look at whether the claimant is
        // still in `_subs` — cancelScan() is called on a match as the very
        // first step of onFound(), *before* connect() even starts, as a
        // normal "found it, stop scanning" step. If staleness were judged
        // by scan-subscription status, the claim would look "abandoned"
        // and get released on literally the next duplicate advertisement
        // while the original target is still mid-connect — reopening the
        // exact crosstalk race this registry exists to close. A claim is
        // only ever released by an explicit releaseDeviceClaim() call (see
        // ble.ts: connect timeout, connect error, HR-monitor error,
        // disconnect handler, and stop() all call it).
        if (this._claimedBy.has(device.id)) return;

        // First (and only) exclusive subscriber whose matcher accepts
        // this device wins the claim. `break` guarantees no second
        // subscriber can also match this same discovery event, even if
        // both of their matchers would have returned true for it.
        for (const sub of this._subs.values()) {
          if (!sub.exclusive) continue;
          try {
            if (sub.matcher(device)) {
              this._claimedBy.set(device.id, sub.id);
              sub.onFound(device);
              break;
            }
          } catch (e) {
            console.warn('[BleScanMediator] matcher threw:', e);
          }
        }
      });
    } catch (e: any) {
      this._scanning = false;
      console.warn('[BleScanMediator] failed to start scan:', e.message);
    }
  }

  private _stopScanning() {
    if (!this._scanning) return;
    this._scanning = false;
    try { getSharedManager().stopDeviceScan(); } catch {}
  }

  /**
   * Run `fn` once it's this caller's turn in the connect queue, staggered
   * by CONNECT_STAGGER_MS from the previous connect attempt. This prevents
   * several PolarDevice instances from calling device.connect() in the
   * same tick, which is unstable on Android with multiple peripherals.
   */
  connectSerialized<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = () => {
        this._connectBusy = true;
        fn()
          .then(resolve, reject)
          .finally(() => {
            setTimeout(() => {
              this._connectBusy = false;
              const next = this._connectQueue.shift();
              if (next) next();
            }, CONNECT_STAGGER_MS);
          });
      };
      if (this._connectBusy) this._connectQueue.push(run);
      else run();
    });
  }

  /** Force-stop everything (app teardown / dev reload). */
  reset() {
    this._subs.clear();
    this._connectQueue = [];
    this._connectBusy = false;
    this._activeSlots.clear();
    this._slotWaiters = [];
    this._claimedBy.clear();
    this._stopScanning();
  }
}

export const bleScanMediator = new BleScanMediator();
