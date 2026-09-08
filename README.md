# UV Active — Member App

> **Module 4/4 of the UV Active platform.** The mobile app for gym members — book sessions, track workouts with real-time heart rate, view history, and manage your account.

| Branch | Purpose |
|--------|---------|
| `member-app` | React Native (Expo) mobile app for gym members |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      UV ACTIVE PLATFORM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────┐                                        │
│  │   Member App        │  ← This repo (React Native / Expo)    │
│  │   (Mobile App)      │      iOS + Android                     │
│  └──────────┬──────────┘                                        │
│             │ HTTPS                                             │
│             ▼                                                   │
│  ┌─────────────────────┐                                        │
│  │   Cloud API (Backend)│  ← uvactive-unified-backend          │
│  │   /api/v1/*         │      NestJS + Prisma + PostgreSQL     │
│  └─────────────────────┘                                        │
│             │                                                   │
│             ▼                                                   │
│  ┌─────────────────────┐                                        │
│  │   PostgreSQL DB      │  ← Shared with all UV Active clients │
│  └─────────────────────┘                                        │
│                                                                  │
│  Other Clients (same API):                                      │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │   Admin Panel       │  │   Branch Portal     │              │
│  │   (Web)             │  │   (Web)             │              │
│  └─────────────────────┘  └─────────────────────┘              │
│  ┌─────────────────────┐                                        │
│  │   Trainer App       │  ← React Native (BLE sensors)         │
│  └─────────────────────┘                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 What It Does

The Member App is the consumer-facing mobile experience:

| Feature | Description |
|---------|-------------|
| **📝 Login** | Member code + PIN authentication |
| **🏠 Home Dashboard** | Upcoming sessions, recent activity, quick stats |
| **📅 Session Booking** | Browse and book available sessions at your gym |
| **💓 Live Workout** | Real-time heart rate tracking during sessions (manual start) |
| **📊 Session History** | View past sessions with HR, calories, duration, score |
| **🔔 Notifications** | Session reminders, gym updates, transfer requests |
| **⚙️ Settings** | Change PIN, manage notification preferences |

---

## 📁 Project Structure

```
uvactive-member-app/
├── 📄 App.tsx                          # Root component — providers, navigation
├── 📄 app.json                         # Expo app config (name, slug, icons, SDK version)
├── 📄 package.json                     # Dependencies
├── 📄 package-lock.json                # npm lockfile
├── 📄 tsconfig.json                    # TypeScript config
├── 📄 babel.config.js                  # Babel config (module resolver)
├── 📄 eas.json                         # Expo EAS build profiles
├── 📄 index.js                         # Entry point — registerRootComponent
│
├── 📁 assets/                          # Static assets
│   ├── icon.png                        # App icon (all resolutions)
│   ├── adaptive-icon.png               # Android adaptive icon
│   ├── splash.png                      # Splash screen
│   ├── favicon.png                     # Web favicon
│   ├── uvactive-logo.jpg              # UV Active logo
│   └── class-{boxing,cycling,hiit,yoga}.jpg  # Class images
│
├── 📁 src/
│   ├── 📄 config.ts                    # Environment config (API base URL)
│   │
│   ├── 📁 components/
│   │   ├── Screen.tsx                  # Screen wrapper — safe area, background
│   │   ├── ErrorBoundary.tsx           # React error boundary
│   │   └── BpmLineGraph.tsx            # Heart rate line chart component
│   │
│   ├── 📁 screens/
│   │   ├── HomeScreen.tsx              # Dashboard — stats, upcoming sessions
│   │   ├── LoginScreen.tsx             # Member code + PIN login
│   │   ├── BookSessionScreen.tsx       # Browse + book available sessions
│   │   ├── SessionDetailScreen.tsx     # Session detail — enrolled members, status
│   │   ├── WorkoutScreen.tsx           # Live workout — HR display, controls
│   │   ├── NotificationsScreen.tsx     # Notification list
│   │   ├── SettingsScreen.tsx          # Account settings, change PIN
│   │   └── {/* future screens */}
│   │
│   ├── 📁 navigation/
│   │   ├── RootNavigator.tsx           # Top-level stack navigator
│   │   └── MainTabs.tsx                # Bottom tab navigator (Home, Sessions, etc.)
│   │
│   ├── 📁 services/
│   │   ├── api.ts                      # Fetch client — envelope, auth, retry
│   │   ├── membersApi.ts               # Member-specific API calls
│   │   ├── sessionsApi.ts              # Session booking/endpoints
│   │   ├── notificationsApi.ts         # Notification API calls
│   │   └── pushNotifications.ts        # Expo push notification setup
│   │
│   ├── 📁 hooks/
│   │   └── useAuth.tsx                 # Auth state, login, token management
│   │
│   ├── 📁 lib/
│   │   ├── formula-engine/             # Heart rate zone / calorie calculations
│   │   │   ├── index.ts                # Formula engine entry point
│   │   │   ├── types.ts                # Calculation types
│   │   │   ├── zones.ts                # HR zone classification
│   │   │   ├── calories.ts             # Calorie estimation
│   │   │   ├── epoc.ts                 # EPOC (afterburn) calculation
│   │   │   ├── mhr.ts                  # Max heart rate estimation
│   │   │   ├── points.ts               # Workout score calculation
│   │   │   ├── fitnessTrajectory.ts    # Fitness trend analysis
│   │   │   ├── recovery.ts             # Recovery time estimation
│   │   │   ├── session.ts              # Session summary calculation
│   │   │   └── alerts.ts               # HR alerts/thresholds
│   │   │
│   │   └── sessionStats.ts             # Session statistics helpers
│   │
│   ├── 📁 db/
│   │   └── cache.ts                    # Local caching utilities
│   │
│   ├── 📁 theme/
│   │   └── tokens.ts                   # Design tokens (colors, fonts, spacing)
│   │
│   └── 📄 navigation/
│       └── {/* navigators */}
│
├── 📁 plugins/
│   └── with-abi-filters.js             # Expo config plugin — APK ABI filtering
│
├── 📁 __tests__/                       # (if applicable)
├── 📄 .env.example                     # Env var template
├── 📄 .gitignore                       # Git ignore rules
└── 📄 README.md                        # This file
```

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React Native + Expo SDK 53 |
| Language | TypeScript 5.8 |
| Navigation | React Navigation 7 (Stack + Bottom Tabs) |
| HTTP | Native fetch (no axios) |
| Storage | expo-sqlite (offline cache), expo-secure-store (tokens) |
| Notifications | expo-notifications |
| Charts | Custom BpmLineGraph component |
| Fonts | Space Grotesk + Inter (via expo-google-fonts) |
| Icons | lucide-react-native |
| Build | EAS Build (cloud) or local prebuild |
| Platforms | iOS 14+, Android 10+ |

---

## 🔐 Authentication

### Login Flow

```
┌───────────────┐     ┌──────────────────┐     ┌─────────────┐
│  LoginScreen  │────→│ POST /auth/      │────→│  Tokens     │
│  (memberCode, │     │ member/login     │     │  (access +  │
│   pin)        │     │ {memberCode, pin}│     │  refresh)   │
└───────────────┘     └──────────────────┘     └──────┬──────┘
                                                       │
                                                       ▼
                                               ┌──────────────┐
                                               │  Store tokens│
                                               │  in Secure   │
                                               │  Store       │
                                               └──────────────┘
                                                       │
                                                       ▼
                                               ┌──────────────┐
                                               │  Navigate to │
                                               │  HomeScreen  │
                                               └──────────────┘
```

### Token Management

- **Access token:** Stored in memory + used for API calls
- **Refresh token:** Stored in `expo-secure-store` (encrypted)
- **401 handling:** Auto-refresh → retry original request
- **Logout:** Clear tokens, navigate to login

### Lockout Policy

- 5 failed PIN attempts → 15-minute lockout (keyed to memberCode)
- Lockout is server-enforced — app shows appropriate error

---

## 💓 Workout & Formula Engine

### Live Workout Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Workout     │────→│  Start session│────→│  POST /trainer/  │
│  Screen      │     │  (manual      │     │  sessions/:id/   │
│              │     │   start)      │     │  start           │
└──────────────┘     └──────────────┘     └──────────────────┘
       │
       │ User taps "Start Workout"
       │
       ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Display     │←────│  HR data     │←────│  BLE sensor      │
│  real-time   │     │  (if paired) │     │  (optional)      │
│  HR graph    │     │              │     │                  │
└──────────────┘     └──────────────┘     └──────────────────┘
       │
       │ Session ends
       ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Calculate   │────→│  Store in    │────→│  Sync to cloud   │
│  stats       │     │  local DB    │     │  (background)    │
│  (zones,     │     │              │     │                  │
│   calories,  │     │              │     │                  │
│   score)     │     │              │     │                  │
└──────────────┘     └──────────────┘     └──────────────────┘
```

### Formula Engine (`src/lib/formula-engine/`)

Pure TypeScript, zero dependencies — shared logic for HR analysis:

| Module | Purpose |
|--------|---------|
| `zones.ts` | HR zone classification (fat burn, cardio, peak, etc.) |
| `calories.ts` | Calorie expenditure estimation |
| `epoc.ts` | Excess Post-exercise Oxygen Consumption (afterburn) |
| `mhr.ts` | Max heart rate estimation (age-based formulas) |
| `points.ts` | Workout quality score calculation |
| `fitnessTrajectory.ts` | Fitness trend over time |
| `recovery.ts` | Recovery time estimation |
| `session.ts` | Session summary aggregation |
| `alerts.ts` | HR threshold alerts |

**Note:** This is vendored logic — do not hand-edit individual files. If formulas change, re-vendor the entire directory.

---

## 📡 API Endpoints Used

### Auth
```
POST   /auth/member/login              → { accessToken, refreshToken }
POST   /auth/member/pin/reset-request  → { message } (OTP sent)
POST   /auth/member/pin/reset-confirm  → { message }
POST   /auth/refresh                   → { accessToken }
POST   /auth/logout                    → void
```

### Member
```
GET    /member/me                      → Member (current user)
POST   /member/change-pin              → void
```

### Sessions
```
GET    /member/sessions                → Session[] (member's sessions)
POST   /member/sessions/:id/book       → void (enroll)
DELETE /member/sessions/:id/booking    → void (self-cancel, scheduled only)
```

### Notifications
```
GET    /member/notifications           → Notification[]
POST   /member/notifications/:id/read  → void
```

---

## 📊 Session Data Model

```
Session
├── id
├── gymId
├── trainerId
├── startTime
├── endTime (nullable)
├── status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
├── capacity
├── enrolledCount
└── sessionMembers: [
     ├── memberId
     ├── status: 'enrolled' | 'attended' | 'cancelled'
     ├── attendance: 'present' | 'absent' | 'late'
     ├── hrReadings: [...]
     ├── avgHR, maxHR, minHR
     ├── caloriesBurned
     ├── workoutScore
     └── zones: { fatBurn, cardio, peak, ... }
   ]
```

---

## 🎨 Design System

### Design Tokens (`src/theme/tokens.ts`)

```typescript
// Colors — UV Active brand
export const colors = {
  primary: '#...'        // UV Active blue
  primaryLight: '#...'
  primaryDark: '#...'
  background: '#...'     // Screen background
  surface: '#...'        // Card backgrounds
  error: '#...'          // Error states
  success: '#...'        // Success states
  text: '#...'           // Primary text
  textSecondary: '#...'  // Secondary/muted text
}

// Typography
export const fonts = {
  heading: 'Space Grotesk'
  body: 'Inter'
  sizes: {
    xs: 12
    sm: 14
    md: 16
    lg: 18
    xl: 20
    xxl: 24
  }
}

// Spacing
export const spacing = {
  xs: 4
  sm: 8
  md: 16
  lg: 24
  xl: 32
}

// Borders
export const borders = {
  radius: {
    sm: 4
    md: 8
    lg: 12
    xl: 16
  }
}
```

### Navigation Structure

```
RootNavigator (Stack)
├── LoginScreen (initial)
└── MainTabs (bottom tabs, after login)
    ├── Home (HomeScreen)
    ├── Sessions (SessionList → SessionDetail)
    ├── Book (BookSessionScreen)
    ├── Notifications (NotificationsScreen)
    └── Settings (SettingsScreen)

// Future: add WorkoutScreen as modal over MainTabs
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- For BLE testing: Android device (BLE doesn't work in most emulators)

### Development

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Edit .env: EXPO_PUBLIC_API_BASE_URL=https://api.uvactive.in/api/v1

# 3. Run (development build required — see below)
npx expo start
```

### Running on Device

**This app uses native modules (expo-sqlite, expo-secure-store) that don't work in Expo Go.** You need a development build:

```bash
# Option A: Development build via EAS (recommended)
eas build --platform android --profile development
# Install the APK on your device, then:
npx expo start

# Option B: Local prebuild + run
npx expo prebuild --platform android
npx expo run:android
```

### Type Checking

```bash
npm run typecheck     # tsc --noEmit — fast, no native build needed
```

### Building for Production

```bash
# Requires EAS CLI
npm install -g eas-cli
eas login

# Production build (.aab for Play Store)
eas build --platform android --profile production

# Preview build (installable APK)
eas build --platform android --profile preview
```

---

## 📱 Platform Notes

### Android

- Target SDK: 34+ (Android 14)
- Min SDK: 24 (Android 7.0)
- Uses `expo-sqlite` with WAL mode for offline cache
- Uses `expo-secure-store` for token storage (keystore-backed)

### iOS

- Target: iOS 14+
- Same architecture as Android
- Uses Keychain via `expo-secure-store`

---

## 🔔 Push Notifications

Uses `expo-notifications` for:

- Session reminders (start time approaching)
- Gym announcements
- Transfer request updates
- Password reset confirmations

```typescript
// Register for push tokens on login
import * as Notifications from 'expo-notifications'

const token = await Notifications.getExpoPushTokenAsync()
// Send token to backend: POST /member/push-tokens
```

---

## 🧪 Testing

```bash
npm run typecheck     # Catch type errors (fast, no device needed)

# For Jest tests (if added):
npm test
```

---

## 🌐 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_API_BASE_URL` | ✅ | Backend API base URL (e.g., `https://api.uvactive.in/api/v1`) |

**Note:** Expo environment variables must be prefixed with `EXPO_PUBLIC_` to be embedded at build time.

---

## 🔄 Offline Considerations

The Member App is designed to work with intermittent connectivity:

1. **Token storage:** `expo-secure-store` persists tokens across app restarts
2. **API calls:** Fail gracefully with user-friendly error messages
3. **Local cache:** `src/db/cache.ts` provides optional local caching
4. **Sync:** When online, pending actions sync to cloud

**Note:** This app does NOT have the offline queue complexity of the Trainer App (which needs to survive dropped BLE connections during live sessions).

---

## 🤖 For AI Assistants

### How to Navigate This Repo

1. **Entry point:** `index.js` → `App.tsx`
2. **Navigation:** `src/navigation/RootNavigator.tsx` + `MainTabs.tsx`
3. **API client:** `src/services/api.ts` — fetch wrapper, envelope, auth
4. **Auth:** `src/hooks/useAuth.tsx` — login, token storage, logout
5. **Screens:** `src/screens/*.tsx` — one file per screen
6. **Services:** `src/services/*.ts` — API calls per domain
7. **Formula engine:** `src/lib/formula-engine/` — HR/calorie/score calculations
8. **Theme:** `src/theme/tokens.ts` — design tokens

### Common Tasks

| Task | Where to Look |
|------|---------------|
| Add a new screen | Create `src/screens/NewScreen.tsx` + add to navigator |
| Add API call | Add to `src/services/*.ts` or create new service file |
| Add navigation route | Edit `src/navigation/RootNavigator.tsx` or `MainTabs.tsx` |
| Change styling | Edit `src/theme/tokens.ts` or screen component styles |
| Fix auth flow | Check `src/hooks/useAuth.tsx` and `src/services/api.ts` |
| Add HR calculation | Edit the relevant file in `src/lib/formula-engine/` |

### Key Files to Read First

- `src/services/api.ts` — Understand the API client
- `src/hooks/useAuth.tsx` — Auth state management
- `src/screens/HomeScreen.tsx` — Example screen with data loading
- `src/navigation/RootNavigator.tsx` — Navigation structure
- `src/theme/tokens.ts` — Design system values

---

## 🔗 Related Repos

| Repo | Branch | Purpose |
|------|--------|---------|
| `uvactive-unified-backend` | `backend` | Cloud API (this app's backend) |
| `uvactive-admin-panel-updated` | `admin` | Admin oversight panel (web) |
| `uvactive-branch-portal` | `branch` | Branch staff web console |
| `uvactive-trainer-app` | `Trainer-app` | Trainer mobile app (React Native + BLE) |

---

## 📄 License

UV Active — Proprietary. All rights reserved.

---

**Maintained by:** UV Active Engineering  
**Repo:** https://github.com/kiraninfocreon/UVActive-Phase-3  
**Branch:** `member-app`
