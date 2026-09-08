# UV Active — Trainer App

> **Module 3/4 of the UV Active platform.** The mobile app for gym trainers — run live heart-rate sessions with BLE sensors, manage your sessions and members, and track athlete performance — all synced directly to the UV Active Cloud API.

| Branch | Purpose |
|--------|---------|
| `Trainer-app` | React Native (Expo) mobile app for gym trainers with BLE sensor support |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      UV ACTIVE PLATFORM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────┐                                    │
│  │   Trainer App           │  ← This repo (React Native)       │
│  │   (Mobile + BLE)        │      iOS + Android                │
│  │                          │                                    │
│  │  ┌───────────────────┐  │                                    │
│  │  │  BLE Sensor       │  │  ← Heart rate monitors            │
│  │  │  (Polar, etc.)    │  │                                    │
│  │  └────────┬──────────┘  │                                    │
│  │           │             │                                    │
│  │           ▼             │  RSSI ──────────────────────────→   │
│  │  ┌───────────────────┐  │                                    │
│  │  │  BLE Stack        │  │  (react-native-ble-plx)           │
│  │  │  (connection mgmt)│  │                                    │
│  │  └────────┬──────────┘  │                                    │
│  │           │             │                                    │
│  │           ▼             │                                    │
│  │  ┌───────────────────┐  │                                    │
│  │  │  Session Engine   │  │  ← THE core: BLE ticks → formula   │
│  │  │  (tick → calc →   │  │     engine → SQLite → sync queue   │
│  │  │   write → queue)  │  │                                    │
│  │  └────────┬──────────┘  │                                    │
│  │           │             │                                    │
│  │           ▼             │                                    │
│  │  ┌───────────────────┐  │                                    │
│  │  │  Local SQLite     │  │  ← expo-sqlite (WAL mode)          │
│  │  │  (offline queue)  │  │     sessions, members, readings,   │
│  │  │                   │  │     sync outbox                    │
│  │  └────────┬──────────┘  │                                    │
│  │           │             │                                    │
│  │           ▼             │                                    │
│  │  ┌───────────────────┐  │                                    │
│  │  │  Sync Queue       │  │  ← Background drain to cloud API   │
│  │  │  (outbox → cloud) │  │     whenever online                │
│  │  └───────────────────┘  │                                    │
│  └───────────┬─────────────┘                                    │
│              │ HTTPS                                            │
│              ▼                                                  │
│  ┌─────────────────────────┐                                    │
│  │   Cloud API (Backend)   │  ← uvactive-unified-backend        │
│  │   /api/v1/*             │      NestJS + Prisma + PostgreSQL   │
│  └─────────────────────────┘                                    │
│              │                                                   │
│              ▼                                                   │
│  ┌─────────────────────────┐                                    │
│  │   PostgreSQL DB          │  ← Shared with all UV Active       │
│  └─────────────────────────┘                                    │
│                                                                  │
│  Other Clients (same API):                                      │
│  ┌─────────────────────────┐  ┌─────────────────────────┐       │
│  │   Admin Panel           │  │   Branch Portal         │       │
│  │   (Web)                 │  │   (Web)                 │       │
│  └─────────────────────────┘  └─────────────────────────┘       │
│  ┌─────────────────────────┐                                    │
│  │   Member App            │  ← React Native (no BLE)           │
│  └─────────────────────────┘                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 What It Does

The Trainer App is the most complex client in the UV Active ecosystem:

| Feature | Description |
|---------|-------------|
| **💓 Live Session Control** | Start/end sessions, manage enrolled members, record attendance |
| **📡 BLE Heart Rate** | Connect to BLE HR sensors, stream real-time BPM to session |
| **📊 Athlete Monitoring** | View live HR, zones, calories for each enrolled member |
| **📅 Session Management** | Browse sessions, enroll members, cancel, view history |
| **👥 Member Roster** | View gym members, search, see member details |
| **🔔 Notifications** | Session reminders, system alerts |
| **⚙️ Settings** | Change PIN, manage account |
| **📶 Offline-First** | Session data stored locally, synced when online |

---

## 📁 Project Structure

```
uvactive-trainer-app/
├── 📄 App.tsx                          # Root — providers, error boundary, sync queue lifecycle
├── 📄 package.json                     # Dependencies (Expo, BLE, SQLite, etc.)
├── 📄 package-lock.json                # npm lockfile
├── 📄 tsconfig.json                    # TypeScript config
├── 📄 babel.config.js                  # Babel (module resolver)
├── 📄 eas.json                         # EAS build profiles (development, preview, production)
├── 📄 app.json                         # Expo app config
├── 📄 index.js                         # Entry point
├── 📄 README.md                        # This file
├── 📄 WINDOWS_BUILD_GUIDE.md           # Windows + Android build walkthrough
│
├── 📁 assets/                          # Static assets
│   ├── icon.png, adaptive-icon.png    # App icons
│   ├── splash.png                      # Splash screen
│   ├── favicon.png                     # Web favicon
│   ├── uvactive-logo.jpg              # UV Active logo
│   └── class-{boxing,cycling,hiit,yoga}.jpg  # Class images
│
├── 📁 src/
│   ├── 📄 config.ts                    # Environment config — API base URL, BLE limits
│   │
│   ├── 📁 components/
│   │   ├── Screen.tsx                  # Screen wrapper — safe area, background, status bar
│   │   ├── ErrorBoundary.tsx           # React error boundary (catches render errors)
│   │   ├── AthleteTile.tsx             # Member card during live session (HR, zones, status)
│   │   ├── BpmLineGraph.tsx            # Real-time BPM line chart
│   │   ├── ConnectionStatus.tsx        # BLE connection indicator
│   │   ├── EmptyState.tsx              # Empty list placeholder
│   │   ├── SessionControlBar.tsx       # Start/End/Cancel buttons during session
│   │   ├── CountdownOverlay.tsx        # Session countdown timer overlay
│   │   ├── ZoneDistribution.tsx        # HR zone distribution chart
│   │   └── withScreenBoundary.tsx      # HOC — wraps screen in ErrorBoundary
│   │
│   ├── 📁 screens/
│   │   ├── HomeScreen.tsx              # Dashboard — upcoming sessions, quick stats
│   │   ├── LoginScreen.tsx             # Staff login (email + password)
│   │   ├── MembersScreen.tsx           # Gym member roster (searchable)
│   │   ├── AthleteDetailScreen.tsx    # Member detail — history, stats
│   │   ├── SessionsScreen.tsx          # Session list — upcoming, past
│   │   ├── SessionDetailsScreen.tsx    # Session detail — enrolled members, status
│   │   ├── LiveSessionScreen.tsx       # ACTIVE session — BLE, HR graphs, controls
│   │   ├── SessionAthleteDetailScreen.tsx  # Per-athlete session detail
│   │   ├── SessionSetupScreen.tsx      # Session setup — select members to enroll
│   │   ├── SessionSummaryScreen.tsx    # Post-session summary — stats, HR graph
│   │   ├── SensorsScreen.tsx           # BLE sensor scan + connection
│   │   ├── SettingsScreen.tsx          # Account settings, change PIN
│   │   └── {/* future screens */}
│   │
│   ├── 📁 navigation/
│   │   ├── RootNavigator.tsx           # Stack navigator (auth + main flow)
│   │   └── MainTabs.tsx                # Bottom tabs (Home, Sessions, Members, Settings)
│   │
│   ├── 📁 services/
│   │   ├── 📄 api.ts                    # Cloud API HTTP client — auth, envelope, refresh
│   │   ├── 📄 sessionsApi.ts            # Typed session/member/sensor API calls
│   │   ├── 📄 ble.ts                    # BLE sensor connectivity (react-native-ble-plx)
│   │   │                                   # Connection slots, reconnect backoff,
│   │   │                                   # exclusive device claims
│   │   ├── 📄 bleScanMediator.ts        # Coordinator for BLE scan + connection limits
│   │   ├── 📄 sessionEngine.ts          # ★ CORE: BLE ticks → formula engine →
│   │   │                                   # SQLite write-through → sync queue
│   │   ├── 📄 syncQueue.ts              # Drains SQLite outbox to cloud API
│   │   │                                   # Runs independently of session state
│   │   ├── 📄 networkStatus.ts          # Connectivity polling (lightweight)
│   │   ├── 📄 pushNotifications.ts      # Expo push notification setup
│   │   ├── 📄 sensorRegistry.ts         # Sensor ↔ session association logic
│   │   ├── 📄 telemetryReporter.ts      # Raw telemetry reporting (if needed)
│   │   ├── 📄 tickStorageFilter.ts      # Filters/stores BLE ticks in SQLite
│   │   └── 📄 sessionEngine.ts          # Session state machine
│   │
│   ├── 📁 db/
│   │   └── 📄 database.ts               # SQLite schema + queries (expo-sqlite, WAL mode)
│   │                                     # Tables: sessions, session_members, ticks,
│   │                                     #         accumulator_state, sync_outbox
│   │
│   ├── 📁 hooks/
│   │   └── 📄 useAuth.tsx               # Staff auth state, token management, login/logout
│   │
│   ├── 📁 lib/
│   │   └── 📁 formula-engine/           # ★ Vendored HR/calorie/zone/score calculations
│   │       ├── index.ts                  # Entry point + re-exports
│   │       ├── types.ts                  # Calculation types/interfaces
│   │       ├── zones.ts                  # HR zone classification
│   │       ├── calories.ts               # Calorie estimation
│   │       ├── epoc.ts                   # EPOC (afterburn) calculation
│   │       ├── mhr.ts                    # Max heart rate estimation
│   │       ├── points.ts                 # Workout quality score
│   │       ├── fitnessTrajectory.ts      # Fitness trend analysis
│   │       ├── recovery.ts               # Recovery time estimation
│   │       ├── session.ts                # Session summary aggregation
│   │       └── alerts.ts                 # HR threshold alerts
│   │
│   ├── 📁 theme/
│   │   └── 📄 tokens.ts                 # Design tokens — colors, fonts, spacing
│   │                                     # Shared with web products
│   │
│   ├── 📁 types/
│   │   └── {/* TypeScript types */}
│
├── 📁 plugins/
│   ├── with-abi-filters.js              # Expo config plugin — APK ABI filtering
│   └── with-foreground-service.js       # Expo config plugin — Android foreground service
│                                          # Keeps BLE alive against Doze mode
│
├── 📁 src/services/__tests__/           # Unit tests
│   ├── sensorWatchdog.e2e.test.ts      # Sensor watchdog integration test
│   └── tickStorageFilter.test.ts        # Tick storage filter unit test
│
├── 📁 WINDOWS_BUILD_GUIDE.md           # Full Windows + Android build guide
├── 📄 .env.example                      # Env var template
├── 📄 .gitignore                        # Git ignore rules
└── 📄 README.md                         # This file
```

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React Native + Expo SDK 53 |
| Language | TypeScript 5.8 |
| Navigation | React Navigation 7 (Stack + Bottom Tabs) |
| BLE | `react-native-ble-plx` (v3) |
| Local DB | `expo-sqlite` (WAL mode) — real SQLite, not AsyncStorage |
| HTTP | Native fetch (no axios) |
| Token Storage | `expo-secure-store` (encrypted) |
| Notifications | `expo-notifications` |
| Background | Android foreground service (via config plugin) |
| Fonts | Space Grotesk + Inter (via expo-google-fonts) |
| Icons | lucide-react-native |
| Charts | Custom BpmLineGraph, ZoneDistribution components |
| Build | EAS Build (cloud) or local Gradle |
| Testing | Jest + jest-expo |
| Platforms | Android 10+ (iOS support planned) |

---

## 🔑 Key Architecture Decisions

### 1. No Hub, No Local WiFi Discovery

The previous app version used a local hub device for sensor aggregation. This has been **removed entirely**:

```
OLD (hub-based):
┌─────────────┐     BLE      ┌─────────────┐     WiFi     ┌─────────────┐
│  HR Sensors │─────────────→│  Local Hub  │─────────────→│  Trainer App │
└─────────────┘               └─────────────┘              └─────────────┘
                                                        (WebSocket bridge)

NEW (cloud-direct):
┌─────────────┐     BLE      ┌─────────────┐     HTTPS    ┌──────────────────┐
│  HR Sensors │─────────────→│  Trainer    │─────────────→│  Cloud API       │
└─────────────┘               │  App        │              │  (single source  │
                              └─────────────┘              │   of truth)      │
                                                             └──────────────────┘
```

**Why:** Simpler architecture, no hub hardware to provision/manage, session data goes straight to the cloud API.

### 2. Offline-First with SQLite

```
┌─────────────────────────────────────────────────────────────┐
│  Live Session Data Flow                                     │
│                                                             │
│  BLE Sensor                                                 │
│     │  (BPM ticks @ ~1Hz)                                  │
│     ▼                                                      │
│  ble.ts (connection + platelet)                            │
│     │                                                      │
│     ▼                                                      │
│  sessionEngine.ts                                          │
│     │  1. Receive tick                                     │
│     │  2. Run through formula engine (zones, calories)    │
│     │  3. Write to SQLite (WAL mode)                      │
│     │  4. Queue for cloud sync                            │
│     ▼                                                      │
│  expo-sqlite (local DB)                                    │
│     │  Tables: sessions, session_members, ticks,           │
│     │          accumulator_state, sync_outbox              │
│     ▼                                                      │
│  syncQueue.ts (background)                                 │
│     │  Drain outbox → POST /trainer/sessions/:id/readings │
│     │  Runs whenever online, independent of session state │
│     ▼                                                      │
│  Cloud API ←───────────────────────────────────────────────│
└─────────────────────────────────────────────────────────────┘
```

**Why:** A session must never lose data to a dropped connection. SQLite provides durable local storage; the sync queue handles eventual consistency.

### 3. BLE Connection Slot Management

```
┌─────────────────────────────────────────────────────────────┐
│  BLE Connection Limits                                      │
│                                                             │
│  Max concurrent connections: 3 (configurable in config.ts) │
│                                                             │
│  Connection Queue:                                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                    │
│  │ Slot 1  │  │ Slot 2  │  │ Slot 3  │                    │
│  │ Sensor A│  │ Sensor B│  │ Sensor C│                    │
│  └─────────┘  └─────────┘  └─────────┘                    │
│       │            │            │                          │
│       ▼            ▼            ▼                          │
│  ble.ts manages slots, queues excess requests,             │
│  reconnects with exponential backoff on drop               │
└─────────────────────────────────────────────────────────────┘
```

**Why:** BLE stacks have connection limits. The slot system prevents OverGen errors and manages reconnection gracefully.

### 4. Android Foreground Service

```
┌─────────────────────────────────────────────────────────────┐
│  Android Doze Mode Problem                                  │
│                                                             │
│  Android puts apps to sleep after ~15 min in background    │
│  BLE connections drop → session data lost                  │
│                                                             │
│  Solution: Foreground Service                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  with-foreground-service.js (Expo config plugin)   │   │
│  │  └→ Patches AndroidManifest.xml at prebuild time   │   │
│  │      <service android:foregroundServiceType="dataSync"> │
│  │      Ongoing notification keeps app alive          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Why:** Long sessions (60-90 min) must survive Android's battery optimization without dropping BLE.

---

## 💓 Live Session Flow

### Starting a Session

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  HomeScreen      │────→│  SessionsScreen  │────→│  SessionDetails  │
│  (upcoming list) │     │  (browse)        │     │  Screen          │
└──────────────────┘     └──────────────────┘     └────────┬─────────┘
                                                              │
                                                              ▼
                                                     ┌──────────────────┐
                                                     │  SessionSetup    │
                                                     │  Screen          │
                                                     │  (select members)│
                                                     └────────┬─────────┘
                                                              │
                                                              ▼
                                                     ┌──────────────────┐
                                                     │  POST            │
                                                     │  /trainer/       │
                                                     │  sessions/:id/   │
                                                     │  start           │
                                                     └────────┬─────────┘
                                                              │
                                                              ▼
                                                     ┌──────────────────┐
                                                     │  LiveSession     │
                                                     │  Screen          │
                                                     │  (BLE + HR +     │
                                                     │   controls)      │
                                                     └──────────────────┘
```

### During a Live Session

```
┌─────────────────────────────────────────────────────────────────┐
│                    Live Session State Machine                    │
│                                                                   │
│  ┌──────────┐    start     ┌─────────────────┐    end    ┌───────────┐
│  │scheduled │─────────────→│  in_progress    │─────────→│ completed │
│  └──────────┘              └─────────────────┘          └───────────┘
│         │                       │  │  │                       │
│         │                       │  │  │ attendances recorded  │
│         │                       │  │  │ HR readings streamed   │
│         │                       │  │  │ zones calculated       │
│         │                       │  │  │ calories computed      │
│         │                       │  │  │                         │
│         │                       ▼  ▼  ▼                         │
│         │              ┌─────────────────────────────────┐      │
│         └─────────────→│  sessionEngine.ts               │      │
│                        │  (BLE ticks → formula → SQLite) │      │
│                        └─────────────────────────────────┘      │
│                                                                   │
│  cancel (any time)                                                │
│  └→ session status = 'cancelled'                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### BLE Sensor Connection During Session

```
┌─────────────────────────────────────────────────────────────────┐
│  Sensor Connection Flow                                          │
│                                                                 │
│  Trainer taps "Connect Sensor"                                   │
│     │                                                           │
│     ▼                                                           │
│  sensorsScreen.ts                                               │
│     │  1. Scan for peripherals (react-native-ble-plx)          │
│     │  2. Filter by service UUID (HR monitor)                   │
│     │  3. Display available sensors                             │
│     │  4. User selects sensor                                   │
│     ▼                                                           │
│  ble.ts                                                         │
│     │  1. Request connection (slot management)                  │
│     │  2. Discover services + characteristics                   │
│     │  3. Subscribe to HR characteristic                        │
│     │  4. Start platelet (background scanning)                 │
│     ▼                                                           │
│  sessionEngine.ts                                               │
│     │  1. Receive HR ticks from ble.ts                          │
│     │  2. Associate with session member                         │
│     │  3. Run through formula engine                            │
│     │  4. Write to SQLite                                       │
│     │  5. Update UI (AthleteTile, BpmLineGraph)                │
│     ▼                                                           │
│  AthleteTile (UI)                                               │
│     │  Real-time: current BPM, zone, calories, time            │
└─────────────────────────────────────────────────────────────────┘
```

### Ending a Session

```
┌─────────────────────────────────────────────────────────────────┐
│  Session End Flow (Idempotent)                                  │
│                                                                 │
│  Trainer taps "End Session"                                     │
│     │                                                           │
│     ▼                                                           │
│  LiveSessionScreen.ts                                          │
│     │  1. POST /trainer/sessions/:id/end                        │
│     │     → Idempotent: same (session_id, member_id) upsert    │
│     │     → Rejects if member not enrolled or session not started│
│     │  2. Clear BLE connections                                 │
│     │  3. Navigate to SessionSummaryScreen                      │
│     ▼                                                           │
│  SessionSummaryScreen                                          │
│     │  Shows: duration, avg/max HR, calories, zones, score     │
│     │  BpmLineGraph of full session                             │
│     │  Per-athlete breakdown (AthleteTile summary)              │
└─────────────────────────────────────────────────────────────────┘
```

**Note:** `POST /trainer/sessions/:id/end` is idempotent — safe to retry if network fails.

---

## 📁 Core Service Deep-Dive

### sessionEngine.ts — The Heart of the App

```typescript
// sessionEngine.ts — THE core piece
// BLE ticks → formula engine → SQLite write-through → cloud sync queue
// No hub involved anywhere.

class SessionEngine {
  // 1. Accept BLE tick from ble.ts
  onTick(sensorId: string, bpm: number, timestamp: number) {
    // 2. Look up session member by sensorId
    const member = this.memberBySensorId(sensorId)

    // 3. Run through formula engine
    const zones = calculateZones(bpm, member.mhr)
    const calories = calculateCalories(bpm, timestamp, member.weight)
    const score = calculateScore(bpm, zones, timestamp)

    // 4. Write to SQLite (local durability)
    this.db.writeTick(sessionId, memberId, bpm, timestamp, zones, calories, score)

    // 5. Update accumulator state (for real-time UI)
    this.updateAccumulator(memberId, bpm, zones, calories)

    // 6. Queue for cloud sync (background)
    this.syncQueue.enqueue({
      sessionId,
      memberId,
      reading: { bpm, timestamp, zones, calories, score }
    })
  }

  // 7. Sync queue drains when online
  //    POST /trainer/sessions/:id/readings (additive only)
}
```

### ble.ts — BLE Connectivity

```typescript
// ble.ts — BLE sensor connectivity (react-native-ble-plx)
// Connection slot queuing, reconnect backoff, exclusive device claims.

class BLEManager {
  private slots: ConnectionSlot[]  // Max 3 concurrent
  private queue: ConnectionRequest[]  // Excess requests queued

  async connect(sensorId: string): Promise<void> {
    // 1. Find free slot or queue request
    const slot = this.findFreeSlot() ?? await this.queueRequest(sensorId)

    // 2. Connect with react-native-ble-plx
    await this.bleClient.connectToDevice(sensorId)

    // 3. Discover HR service + characteristic
    await this.discoverHRService()

    // 4. Subscribe to HR notifications
    await this.subscribeToHR()

    // 5. Start platelet for reconnection
    this.startPlatelet(sensorId)
  }

  // Reconnect with exponential backoff
  private startPlatelet(sensorId: string) {
    this.platelet.start(sensorId, {
      maxRetryCount: 5,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000)
    })
  }
}
```

### syncQueue.ts — Offline-to-Cloud Sync

```typescript
// syncQueue.ts — Drains local SQLite outbox to cloud API
// Runs independently of whether a session is live.

class SyncQueue {
  async drain(): Promise<void> {
    // 1. Check connectivity
    if (!(await networkStatus.isOnline())) return

    // 2. Fetch pending readings from outbox
    const pending = await this.db.getPendingReadings()

    // 3. Send in batches
    for (const batch of chunk(pending, 50)) {
      try {
        await api.post(`/trainer/sessions/${batch[0].sessionId}/readings`, batch)
        await this.db.markReadingsSynced(batch.map(r => r.id))
      } catch (e) {
        // 4. Retry later (exponential backoff)
        await this.scheduleRetry(batch)
      }
    }
  }
}
```

### database.ts — SQLite Schema

```typescript
// database.ts — Real SQLite (expo-sqlite, WAL mode)

// Tables:
// - sessions: id, gym_id, trainer_id, start_time, end_time, status
// - session_members: id, session_id, member_id, status, attendance,
//                     hr_readings (FK to ticks), zones summary
// - ticks: id, session_id, member_id, bpm, timestamp, zones,
//          calories, score, synced (boolean)
// - accumulator_state: id, session_id, member_id, current_bpm,
//                      total_calories, time_in_zones, last_updated
// - sync_outbox: id, reading_id, payload, created_at, retry_count
```

---

## 🎨 Design System

### Design Tokens (`src/theme/tokens.ts`)

```typescript
// Colors — UV Active brand (shared with web products)
export const colors = {
  primary: '#...'          // UV Active blue
  primaryLight: '#...'
  primaryDark: '#...'
  background: '#...'       // Screen background (dark mode default)
  surface: '#...'          // Card/panel background
  surfaceLight: '#...'
  error: '#...'            // Error/destructive
  success: '#...'          // Success/active
  warning: '#...'          // Warning/pending
  text: '#...'             // Primary text
  textSecondary: '#...'    // Secondary text
  textMuted: '#...'        // Muted/disabled

  // HR Zone colors (for graphs)
  zoneRest: '#...'         // Zone 1 (rest/recovery)
  zoneFatBurn: '#...'      // Zone 2 (fat burn)
  zoneCardio: '#...'       // Zone 3 (cardio)
  zonePeak: '#...'         // Zone 4 (peak)
  zoneMax: '#...'          // Zone 5 (maximum)
}

// Typography
export const fonts = {
  heading: 'Space Grotesk'
  body: 'Inter'
  mono: 'Space Mono'       // For HR numbers
  sizes: {
    xs: 10, sm: 12, md: 14, lg: 16, xl: 20, xxl: 24, xxxl: 32
  }
}

// Spacing
export const spacing = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48
}

// Borders
export const borders = {
  radius: { xs: 2, sm: 4, md: 8, lg: 12, xl: 16, full: 9999 }
}

// HR display
export const hrDisplay = {
  fontSize: 48,             // Current BPM size
  fontFamily: 'Space Mono', // Monospace for HR digits
  color: colors.text,       // High contrast
}
```

### Screen Layout Pattern

```
┌─────────────────────────────────────┐
│  Screen.tsx                         │
│  ┌─────────────────────────────────┐│
│  │  StatusBar (theme-aware)        ││
│  ├─────────────────────────────────┤│
│  │  Header (title + actions)       ││
│  ├─────────────────────────────────┤│
│  │  Content                        ││
│  │  ┌─────────────────────────────┐││
│  │  │  Scrollable area            │││
│  │  │  (SafeAreaView respected)   │││
│  │  └─────────────────────────────┘││
│  ├─────────────────────────────────┤│
│  │  Bottom tabs / actions          ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │  KeyboardAvoidingView (if need)││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

### Live Session UI

```
┌─────────────────────────────────────────────┐
│  LiveSessionScreen                          │
│  ┌─────────────────────────────────────────┐│
│  │  Header: Session title + time elapsed   ││
│  ├─────────────────────────────────────────┤│
│  │                                         ││
│  │  ┌───────────────────────────────────┐  ││
│  │  │  BpmLineGraph                    │  ││
│  │  │  (Real-time HR for selected       │  ││
│  │  │   athlete or aggregated)         │  ││
│  │  └───────────────────────────────────┘  ││
│  │                                         ││
│  │  ┌───────────────────────────────────┐  ││
│  │  │  AthleteTile × N                  │  ││
│  │  │  (Current HR, zone, calories,     │  ││
│  │  │   connection status)              │  ││
│  │  └───────────────────────────────────┘  ││
│  │                                         ││
│  ├─────────────────────────────────────────┤│
│  │  SessionControlBar                      ││
│  │  [End Session] [Cancel] [Add Member]    ││
│  └─────────────────────────────────────────┘│
│                                             │
│  CountdownOverlay (if session starting)    │
│  ┌─────────────────────────────────────────┐│
│  │  5                                       ││
│  │  (full-screen countdown)                 ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 20 LTS** (or 22)
- **Android device or emulator** — BLE doesn't work in most emulators, use a real phone for BLE testing
- **UV Active Cloud API** instance to point at

### Development

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Edit .env: EXPO_PUBLIC_API_BASE_URL=https://api.uvactive.in/api/v1

# 3. Build development client (one-time)
npx expo prebuild --platform android
npx expo run:android

# 4. Day-to-day development
npm start           # JS bundler — reload on device
```

### EAS Build (Alternative)

```bash
npm install -g eas-cli
eas login

# Development build
eas build --platform android --profile development
# Install APK on device, then: npm start

# Production build (.aab for Play Store)
eas build --platform android --profile production

# Preview build (installable APK)
eas build --platform android --profile preview
```

### Type Checking

```bash
npm run typecheck    # tsc --noEmit — safe to run anywhere, no native build needed
```

### Running Tests

```bash
npm test             # Jest unit tests
```

---

## 📡 API Endpoints Used

### Auth
```
POST   /auth/staff/login              → { accessToken, refreshToken }
POST   /auth/staff/forgot-password    → { message }
POST   /auth/staff/reset-password     → { message }
POST   /auth/refresh                  → { accessToken }
POST   /auth/logout                   → void
```

### Sessions
```
POST   /trainer/sessions              → Session (create)
GET    /trainer/sessions              → Session[] (trainer's sessions)
GET    /trainer/sessions/:id          → Session (detail)
POST   /trainer/sessions/:id/members  → SessionMember (enroll member)
DELETE /trainer/sessions/:id/members/:memberId → void (unenroll)
POST   /trainer/sessions/:id/attendance   → void (record attendance)
POST   /trainer/sessions/:id/start       → Session (start)
POST   /trainer/sessions/:id/end         → Session (end — idempotent)
POST   /trainer/sessions/:id/cancel      → Session (cancel)
POST   /trainer/sessions/:id/readings    → void (submit HR readings)
```

### Members
```
GET    /branch/members                 → Member[] (gym roster)
GET    /branch/members/search?code=    → Member
GET    /branch/members/:id             → Member (detail)
```

### Sensors
```
GET    /branch/sensors                 → Sensor[]
POST   /branch/sensors                 → Sensor (register)
```

### Push Tokens
```
POST   /member/push-tokens             → void (register device token)
```

---

## 📶 Offline & Sync Behavior

### What Works Offline

- View cached sessions/members (from SQLite)
- Schedule session start (queued)
- Record attendance (queued)
- BLE sensor data collection (stored locally)
- Session end (queued — idempotent on retry)

### What Requires Online

- Initial auth (login)
- Session creation
- Member enrollment
- Cloud sync of readings
- Push notification registration

### Sync Queue Behavior

```
┌─────────────────────────────────────────────────────────────┐
│  Sync Queue States                                          │
│                                                             │
│  ┌──────────┐    online     ┌──────────┐    drain    ┌──────────┐
│  │ pending  │──────────────→│ draining │───────────→│ synced   │
│  └──────────┘               └──────────┘            └──────────┘
│       ▲                          │                        │
│       │  retry (backoff)        │  failure                │
│       └─────────────────────────┘  └─────────────────────┘
│                                   (stay pending, retry later)
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_API_BASE_URL` | ✅ | Backend API base URL |

### Config File (`src/config.ts`)

```typescript
export const config = {
  // API
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.uvactive.in/api/v1',

  // BLE
  ble: {
    maxConnections: 3,              // Concurrent BLE connections
    scanTimeout: 10000,             // ms
    reconnectBackoff: [1000, 2000, 5000, 10000, 30000],
  },

  // Session
  session: {
    autoStartCountdown: 5,          // seconds before session starts
    readingBatchSize: 50,           // sync queue batch size
  },
}
```

### EAS Build Profiles (`eas.json`)

```json
{
  "cli": { "version": ">= 7.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  }
}
```

---

## 🔌 Plugins

### with-abi-filters.js

Filters APK ABIs to reduce APK size — only includes native libraries for target ABIs.

### with-foreground-service.js

Patches `AndroidManifest.xml` at prebuild time to add a foreground service — keeps BLE alive against Android Doze during long sessions.

**Do not edit `android/` directly if you plan to run prebuild again** — these plugins are the source of truth for manifest modifications.

---

## 🧪 Testing

### Unit Tests

```bash
npm test              # Run Jest tests
```

Current test coverage:
- `sensorWatchdog.e2e.test.ts` — Sensor watchdog integration
- `tickStorageFilter.test.ts` — Tick storage filter unit tests

### Manual Testing Checklist

Before shipping, verify on real hardware:

| Test | Status |
|------|--------|
| BLE sensor connects and streams HR | Needs verification |
| Session start → live HR graph | Needs verification |
| Session end (idempotent) | Needs verification |
| Offline → online sync | Needs verification |
| Background → foreground (Doze survival) | Needs verification |
| Push notifications | Needs verification |
| Auth → logout → auth | Needs verification |

See `WINDOWS_BUILD_GUIDE.md` for full checklist.

---

## 🌐 Deployment

### Play Store

```bash
eas build --platform android --profile production
# Upload .aab to Google Play Console
```

### Internal Testing (Track)

```bash
eas build --platform android --profile preview
# Install APK directly on test devices
```

---

## 🤖 For AI Assistants

### How to Navigate This Repo

1. **Entry point:** `index.js` → `App.tsx`
2. **App lifecycle:** `App.tsx` — providers, error boundary, sync queue start/stop
3. **Navigation:** `src/navigation/RootNavigator.tsx` + `MainTabs.tsx`
4. **API client:** `src/services/api.ts` — fetch wrapper, envelope, auth headers, refresh
5. **BLE layer:** `src/services/ble.ts` — react-native-ble-plx wrapper, connection management
6. **Session engine:** `src/services/sessionEngine.ts` — core: BLE → formula → SQLite → sync
7. **Sync queue:** `src/services/syncQueue.ts` — offline outbox → cloud
8. **SQLite:** `src/db/database.ts` — schema, queries, WAL mode
9. **Formula engine:** `src/lib/formula-engine/` — vendored HR/calorie/zone/score calculations
10. **Screens:** `src/screens/*.tsx` — one file per screen
11. **Components:** `src/components/*.tsx` — shared UI
12. **Config:** `src/config.ts` — env vars, BLE limits, session settings
13. **Theme:** `src/theme/tokens.ts` — design tokens

### Common Tasks

| Task | Where to Look |
|------|---------------|
| Add a new screen | Create `src/screens/NewScreen.tsx` + add to navigator |
| Add API endpoint usage | Add to `src/services/sessionsApi.ts` or create new service |
| Add BLE feature | Edit `src/services/ble.ts` or `src/services/bleScanMediator.ts` |
| Add HR calculation | Edit vendored file in `src/lib/formula-engine/` (re-vendor, don't patch) |
| Add sync behavior | Edit `src/services/syncQueue.ts` |
| Add local DB query | Edit `src/db/database.ts` |
| Change BLE limits | Edit `src/config.ts` |
| Fix auth flow | Check `src/services/api.ts` and `src/hooks/useAuth.tsx` |
| Add test | Create in `src/services/__tests__/` |

### Key Files to Read First

- `src/services/sessionEngine.ts` — THE core of the app
- `src/services/ble.ts` — BLE connectivity layer
- `src/services/api.ts` — API client
- `src/db/database.ts` — SQLite schema
- `src/lib/formula-engine/index.ts` — Formula engine entry point
- `src/config.ts` — App configuration
- `App.tsx` — App lifecycle and providers

### Architecture Notes for AI

1. **This app is offline-first.** Session data is written to SQLite immediately, synced to cloud asynchronously.
2. **BLE is the only native dependency.** Everything else is Expo/React Native standard.
3. **Formula engine is vendored.** Do not edit individual files — re-vendor the whole directory if formulas change.
4. **Sync queue is independent.** It runs whether or not a session is live — drains any pending readings.
5. **Android foreground service** is added via config plugin, not manual manifest editing.

---

## 🔗 Related Repos

| Repo | Branch | Purpose |
|------|--------|---------|
| `uvactive-unified-backend` | `backend` | Cloud API (this app's backend) |
| `uvactive-admin-panel-updated` | `admin` | Admin oversight panel (web) |
| `uvactive-branch-portal` | `branch` | Branch staff web console |
| `uvactive-member-app` | `member-app` | Member mobile app (React Native, no BLE) |

---

## 📄 License

UV Active — Proprietary. All rights reserved.

---

**Maintained by:** UV Active Engineering  
**Repo:** https://github.com/kiraninfocreon/UVActive-Phase-3  
**Branch:** `Trainer-app`
