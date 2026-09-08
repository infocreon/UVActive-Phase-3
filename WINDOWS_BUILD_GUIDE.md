# UV Active Trainer App — Building the Android App on Windows

I can't execute a Windows/Android build myself in this environment (no Windows machine, no Android SDK/emulator here), so I can't hand you a "verified working" build the way I could verify the TypeScript compiled cleanly. What I can give you is a precise, correct set of steps — read this as a careful guide, not a guarantee; run it and tell me what breaks if anything does.

There are two paths. **Use EAS Build (cloud) unless you have a specific reason not to** — it avoids needing a full local Android SDK install and handles release signing/keystores for you, which is the part most likely to go wrong on a fresh Windows setup.

---

## Path A — EAS Build (recommended)

### 1. Prerequisites
- Node.js 20 LTS (Node 22 also fine — check with `node -v`)
- An Expo account (free) — [expo.dev](https://expo.dev)
- Git (for version control, not strictly required to build)

You do **not** need Android Studio or the Android SDK installed locally for this path — EAS builds in the cloud.

### 2. Install the EAS CLI
```powershell
npm install -g eas-cli
eas login
```

### 3. From the project root
```powershell
cd uvactive-trainer-app
npm install
```

### 4. Set your real API URL
Open `eas.json` and replace the placeholder URLs under `build.preview.env` and `build.production.env` with your actual deployed cloud API domain. Also update `app.json`'s `extra.eas.projectId` — get a real one by running:
```powershell
eas init
```
This links the project to your Expo account and writes the real project ID for you.

### 5. First build — internal test APK
```powershell
eas build --platform android --profile preview
```
This produces a signed APK you can install directly on a test device (share the link EAS gives you, or scan the QR code). EAS auto-generates and stores a signing keystore for you on first build — **do not lose access to your Expo account**, that keystore is tied to it and losing it means you can't publish updates to the same app listing later.

### 6. Production build (Play Store — AAB format)
```powershell
eas build --platform android --profile production
```
This produces an `.aab` (Android App Bundle), which is what the Play Store requires for new submissions. Download it from the EAS dashboard link once the build finishes (cloud builds typically take 10–20 minutes).

### 7. Submit to Play Store (optional, once you have a Play Console account)
```powershell
eas submit --platform android --profile production
```

---

## Path B — Fully local build on Windows

Use this if you specifically need an offline/local build pipeline, or want full control over signing.

### 1. Prerequisites
- **Node.js 20 LTS**
- **JDK 17** (Temurin/Eclipse Adoptium build recommended) — set `JAVA_HOME` to point at it
- **Android Studio** (installs the Android SDK) — during setup, install:
  - Android SDK Platform 35 (or whatever `compileSdkVersion` Expo 53 targets — check `android/build.gradle` after prebuild, step 3, if unsure)
  - Android SDK Build-Tools
  - An emulator image, if you want to test without a physical device
- Set environment variables (System Properties → Environment Variables, or PowerShell profile):
  ```powershell
  setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
  setx JAVA_HOME "C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot"
  ```
  Restart your terminal after `setx` — it doesn't affect the current session.

### 2. Install dependencies
```powershell
cd uvactive-trainer-app
npm install
```

### 3. Generate the native Android project
```powershell
npx expo prebuild --clean --platform android
```
This reads `app.json` (including the two custom config plugins in `/plugins` — ABI filters and the foreground-service manifest patch) and generates a real `android/` folder with a Gradle project inside it. **Do not hand-edit anything under `android/` if you plan to run `prebuild` again** — it regenerates that folder from `app.json` each time; treat `app.json` and the plugins as the source of truth.

### 4. Generate a release keystore (first time only)
```powershell
cd android\app
keytool -genkeypair -v -storetype PKCS12 -keystore uvactive-release.keystore -alias uvactive -keyalg RSA -keysize 2048 -validity 10000
```
It'll prompt for a keystore password and some identity fields — **write the password down somewhere durable**. Losing this keystore means you can never publish an update to the same Play Store listing again; you'd have to ship as a new app.

Then in `android/gradle.properties`, add:
```properties
UVACTIVE_UPLOAD_STORE_FILE=uvactive-release.keystore
UVACTIVE_UPLOAD_KEY_ALIAS=uvactive
UVACTIVE_UPLOAD_STORE_PASSWORD=<your keystore password>
UVACTIVE_UPLOAD_KEY_PASSWORD=<your key password>
```
And wire it into `android/app/build.gradle`'s `signingConfigs` block (Expo's prebuild output includes a `release` signing config stub — point it at these properties; the generated file has comments showing exactly where).

**Never commit `gradle.properties` with real passwords in it to git** — add it to `.gitignore`, or better, pass these as environment variables in CI instead of a committed file.

### 5. Build
From the project root:
```powershell
cd android
.\gradlew.bat bundleRelease
```
Output: `android\app\build\outputs\bundle\release\app-release.aab` (Play Store format).

For a directly-installable APK instead:
```powershell
.\gradlew.bat assembleRelease
```
Output: `android\app\build\outputs\apk\release\app-release.apk`

### 6. Install on a connected device to test
```powershell
adb install android\app\build\outputs\apk\release\app-release.apk
```
(`adb` comes with the Android SDK Platform-Tools; make sure it's on your `PATH` — Android Studio's SDK Manager installs it under `%LOCALAPPDATA%\Android\Sdk\platform-tools`.)

---

## Production readiness checklist

Things worth confirming before calling a build "production," beyond just "it compiled":

- [ ] `EXPO_PUBLIC_API_BASE_URL` points at your real production cloud API domain, over HTTPS, not a staging/dev URL
- [ ] `app.json`'s `android.package` (`in.uvactive.trainer`) matches what you actually want as your permanent Play Store package ID — **this cannot be changed after your first Play Store submission**
- [ ] Keystore is backed up somewhere durable and outside this repo (a password manager or secure cloud storage, not a plaintext file in git)
- [ ] `newArchEnabled` is currently set to `false` in `app.json` — deliberate: `react-native-ble-plx`'s New Architecture support is still maturing, and BLE stability matters more here than being on the newest RN architecture. Revisit this once you've confirmed BLE behaves identically under the New Architecture on your actual target devices — don't flip it purely to chase currency.
- [ ] Test the BLE sensor-connect flow on **physical Android devices from more than one OEM** (Samsung, Xiaomi/POCO, etc. all have different background-process/battery-optimization behavior) — this is the single most likely thing to behave differently across devices, per the `with-foreground-service` plugin's own rationale.
- [ ] Run a real session end-to-end on a device with **cellular-only** connectivity (not WiFi) to confirm the offline-first sync queue behaves as designed under a flaky mobile connection, not just a stable office WiFi
- [ ] Confirm `ITSAppUsesNonExemptEncryption: false` in `app.json`'s iOS block is actually correct for your case (it is, if you're only using standard HTTPS/TLS and not implementing your own encryption) — this avoids an App Store export-compliance question, only relevant if/when you also build for iOS
- [ ] Increment `version` in `app.json` for each Play Store release; with `appVersionSource: "remote"` in `eas.json`, EAS manages `versionCode` automatically per build — you don't need to hand-bump that part

## What I could NOT verify from here

Everything up to "does this compile and are the API contracts correct" — I confirmed via a live `tsc --noEmit` pass (zero errors) and by cross-checking every endpoint the app calls against the actual cloud API source. What I could not do, because this sandbox has no Windows, no Android SDK, and no physical BLE hardware:

- Confirm `expo prebuild` actually succeeds and produces a working Gradle project
- Confirm the Gradle build itself succeeds (dependency resolution, native module linking for `expo-sqlite`/`react-native-ble-plx`)
- Confirm the app actually launches and BLE sensors connect on a real device
- Confirm SQLite's WAL mode behaves as expected on real Android storage

Please run through Path A (or B) and let me know what — if anything — breaks. I'd rather fix a real error you hit than claim this is guaranteed to work first try.
