/**
 * UV Active — Gradle config plugin  (v5 — definitive CMake fix)
 *
 * Fixes "ninja: build.ninja still dirty after 100 tries" on Windows.
 *
 * ROOT CAUSE:
 *   Multiple native modules (react-native-screens, expo-modules-core, expo-sqlite)
 *   build C++ via CMake. The .cxx build artifacts are written inside
 *   node_modules/<lib>/android/.cxx/... On Windows, the combined path exceeds
 *   260 chars (MAX_PATH). Ninja can't write its lock file, sees build.ninja
 *   as permanently dirty, loops 100x.
 *
 * THE FIX:
 *   Inject `buildStagingDirectory "C:/cxx/<lib>"` into the OUTER
 *   android { externalNativeBuild { cmake { ... } } } block of each module's
 *   build.gradle. This block uses CmakeOptions DSL which DOES support
 *   buildStagingDirectory.
 */

const { withAppBuildGradle, withGradleProperties, withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs   = require('fs');

// ── 1. app/build.gradle — abiFilters ────────────────────────────────────────
const withAbiFilters = (config) => {
  return withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;
    if (!gradle.includes('abiFilters')) {
      gradle = gradle.replace(
        /(\s+)(versionName\s+"[^"]*")/,
        '$1$2\n$1    ndk {\n$1        abiFilters "arm64-v8a", "x86_64"\n$1    }'
      );
    }
    mod.modResults.contents = gradle;
    return mod;
  });
};

// ── 2. gradle.properties — ABI filter entries ────────────────────────────────
const withGradleAbiFilters = (config) => {
  return withGradleProperties(config, (mod) => {
    const props = [
      { key: 'android.abiFilters',      value: 'arm64-v8a,x86_64' },
      { key: 'reactNativeArchitectures', value: 'arm64-v8a,x86_64' },
    ];
    for (const { key, value } of props) {
      const existing = mod.modResults.find(
        (item) => item.type === 'property' && item.key === key
      );
      if (!existing) mod.modResults.push({ type: 'property', key, value });
      else existing.value = value;
    }
    return mod;
  });
};

// ── 3. Patch native module build.gradle files with buildStagingDirectory ───
// Injects buildStagingDirectory into the OUTER android { externalNativeBuild
// { cmake { path "CMakeLists.txt" } } } block — CmakeOptions DSL.
// NOT into defaultConfig { externalNativeBuild { cmake { arguments } } }
// which is ExternalNativeCmakeOptions (no buildStagingDirectory property).
const CMAKE_PATCHES = [
  { module: 'react-native-screens', dirName: 'rnscreens' },
  { module: 'expo-modules-core',  dirName: 'expo-modules-core' },
  { module: 'expo-sqlite',        dirName: 'expo-sqlite' },
];

const withCMakeStagingFix = (config) => {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      for (const { module, dirName } of CMAKE_PATCHES) {
        const buildGradle = path.join(
          mod.modRequest.projectRoot,
          'node_modules', module, 'android', 'build.gradle'
        );

        if (!fs.existsSync(buildGradle)) {
          console.warn(`[cmake-fix] ${module} build.gradle not found — skipping`);
          continue;
        }

        let content = fs.readFileSync(buildGradle, 'utf8');

        const marker = `C:/cxx/${dirName}`;
        if (content.includes(marker)) {
          console.log(`[cmake-fix] ${module} already patched`);
          continue;
        }

        // Match the OUTER externalNativeBuild { cmake { path "CMakeLists.txt" } }
        const pathLineRe = /([ \t]*path\s+"CMakeLists\.txt")/;
        if (!pathLineRe.test(content)) {
          console.warn(`[cmake-fix] Could not find \`path "CMakeLists.txt"\` in ${module} — skipping`);
          continue;
        }

        const patched = content.replace(
          pathLineRe,
          `$1\n            buildStagingDirectory "${marker}"`
        );

        fs.writeFileSync(buildGradle, patched, 'utf8');
        console.log(`[cmake-fix] ✓ buildStagingDirectory "${marker}" injected into ${module}`);
      }
      return mod;
    },
  ]);
};

module.exports = (config) => {
  config = withAbiFilters(config);
  config = withGradleAbiFilters(config);
  config = withCMakeStagingFix(config);
  return config;
};
