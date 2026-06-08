# Mobile Support Plan — promptpilot-ai

Goal: extend the scan → context → standards → skills pipeline to **React Native / Expo, Flutter, native Android (Kotlin/Java), native iOS (Swift)** — same architecture as web/backend, no new runtime dependencies (lightweight regex parsing, consistent with the existing JSON/TOML/requirements parsing).

A new framework `type: 'mobile'` is introduced, and `standards.js` gains a **mobile** side (UI consistency + performance + platform conventions) alongside backend/frontend.

---

## Architecture touchpoints (shared across all platforms)

| File | Change |
|---|---|
| `src/scanner/file-tree.js` | Add source extensions `.dart .kt .java .swift .m .mm`. Add mobile build dirs to IGNORE: `build`, `.dart_tool`, `Pods`, `DerivedData`, `.gradle`, `android/build`, `ios/build`, `*.xcworkspace`, `.expo`. Capture mobile config files. |
| `src/scanner/index.js` | `scanProject` routes by config file: `pubspec.yaml` → Flutter; `build.gradle(.kts)`/`settings.gradle` → Android; `*.xcodeproj`/`Package.swift`/`Podfile` → iOS; `package.json` with `react-native`/`expo` → RN (inside the Node path). |
| `src/scanner/stack-detector.js` | New detectors `detectFlutter/detectAndroid/detectIos`; extend Node `detectFramework` for RN/Expo. New dep maps per ecosystem. Emit `type: 'mobile'`. |
| `src/scanner/module-analyzer.js` | Mobile module strategies (screens/widgets/features/navigation/services/store). New module type `screen` (or reuse `routes`/`ui`). |
| `src/scanner/pattern-detector.js` | Dart/Kotlin/Swift naming + import styles; mobile state-mgmt detection; rename `cssApproach` semantics to "styling approach" for mobile (StyleSheet / NativeWind / Tamagui / Compose theme / SwiftUI). |
| `src/generators/standards.js` | Add `isMobile` + a **mobile** standards block (performance, UI consistency, platform conventions, state/persistence). |
| `src/generators/settings.js` | Permission allow-list per ecosystem (`flutter`,`dart`,`./gradlew`,`pod`,`xcodebuild`,`swift`,`fastlane`). |
| `src/commands/init.js` | `detectNewProject` regex += `.dart .kt .java .swift`. `collectNewProjectConfig` += mobile framework choices. |
| `src/generators/skills.js` | `design` → mobile-UI aware; `db` → mobile persistence; new `mobile`/`perf` skill. |
| `src/generators/agents.js` | `tester` uses platform test cmd (`flutter test` / `./gradlew test` / `xcodebuild test`). |

**Zero-dependency parsing note:** `pubspec.yaml` (YAML), `build.gradle(.kts)` (Groovy/KTS), `Podfile` (Ruby), `Package.swift` (Swift DSL), `gradle/libs.versions.toml` (TOML) are all parsed with **targeted regex**, not full parsers — same approach already used for `pyproject.toml`/`requirements.txt`. Mitigate brittleness with fallbacks + presence checks.

---

## 1. React Native / Expo — effort **S** (quick win)

- **Detect:** `package.json` deps `react-native` (bare) or `expo` (managed); config `app.json`/`app.config.{js,ts}`, `metro.config.js`, presence of `android/` + `ios/` folders (bare).
- **Language/runtime:** TS/JS (existing) · runtime "React Native" / "Expo" · `type: 'mobile'`.
- **Detect libs:** navigation `@react-navigation/*` / `expo-router` / `react-native-navigation`; state redux/zustand/jotai/recoil/mobx; data `@react-native-async-storage/async-storage` / `react-native-mmkv` / `watermelondb` / `realm` / `expo-sqlite` / `op-sqlite`; UI `react-native-paper` / `tamagui` / `nativewind` / `@gluestack-ui` / `react-native-elements`; net `axios`/`@tanstack/react-query`/`swr`/`apollo`; testing `jest` + `@testing-library/react-native`, e2e `detox`/`maestro`.
- **Modules:** `app/` (expo-router routes), `src/screens`, `src/components`, `src/navigation`, `src/hooks`, `src/services`/`api`, `src/store`.
- **Commands:** from scripts + `expo start` / `react-native run-android|ios`, `npm test`.
- **Work:** extend Node maps + add `mobile` type + mobile module dirs + mobile standards. Smallest change, largest audience.

## 2. Flutter (Dart) — effort **M**

- **Detect:** `pubspec.yaml` (with `flutter:` key) → Flutter; Dart-only → "Dart". Entry `lib/main.dart`.
- **Parse pubspec.yaml (regex):** `dependencies:` block.
- **Detect libs:** state provider/riverpod/flutter_bloc(bloc)/get(GetX)/mobx/stacked; data drift/sqflite/hive/isar/objectbox/floor/shared_preferences; net dio/http/retrofit/chopper/graphql_flutter; DI get_it/injectable; routing go_router/auto_route/beamer; codegen build_runner/freezed/json_serializable; testing flutter_test/mockito/bloc_test/integration_test/patrol.
- **Structure:** `lib/` — feature-first (`lib/features/*`) or layer-first (`lib/screens`,`lib/widgets`,`lib/models`,`lib/services`,`lib/providers`/`blocs`).
- **Patterns:** files snake_case, classes PascalCase, `package:`/relative imports.
- **Commands:** `flutter pub get`, `flutter run`, `flutter build apk|ios|appbundle`, `flutter test`, `dart analyze`, `dart format`.
- **Work:** new pubspec detector branch, Dart patterns, `lib/` module analysis, `.dart` ext.

## 3. Native Android (Kotlin/Java) — effort **L**

- **Detect:** `settings.gradle(.kts)` + `build.gradle(.kts)` + `app/src/main/AndroidManifest.xml`. Language: Kotlin (default) vs Java by `.kt`/`.java` prevalence.
- **Parse (regex):** `build.gradle(.kts)` dependency lines + `gradle/libs.versions.toml` version catalog.
- **Detect libs/arch:** UI Jetpack **Compose** (`androidx.compose`) vs **XML Views** (`res/layout/*.xml`); DI Hilt/Dagger/Koin; data Room/SQLDelight/DataStore/Realm; net Retrofit/OkHttp/Ktor/Apollo; async coroutines+Flow/RxJava; nav Jetpack Navigation/Compose Navigation; arch MVVM (ViewModel+StateFlow/LiveData)/MVI/Clean (data/domain/presentation); testing JUnit/Espresso/Robolectric/Compose-UI-test/MockK; lint ktlint/detekt.
- **Modules:** Gradle modules from `settings.gradle` `include(...)` (app, core, feature-*, data, domain) + package layers under `app/src/main/{java,kotlin}/...`.
- **Patterns:** Kotlin — PascalCase types, camelCase funcs, files PascalCase, packages.
- **Commands:** `./gradlew assembleDebug`, `./gradlew test`, `./gradlew connectedAndroidTest`, `./gradlew lint` / `ktlintCheck` / `detekt`.
- **Work:** new Gradle ecosystem detector (build.gradle + KTS + version catalog), Kotlin/Java patterns, gradle-module analysis, `.kt/.java` ext, manifest read.

## 4. Native iOS (Swift) — effort **L**

- **Detect:** `*.xcodeproj`/`*.xcworkspace`, `Package.swift` (SPM), `Podfile` (CocoaPods), `Cartfile`. Language: Swift vs Obj-C by `.swift`/`.m`.
- **Parse (regex):** `Package.swift` (`.package(...)`/`.product(...)`), `Podfile` (`pod '...'`). Avoid deep `project.pbxproj` parsing; infer frameworks from SPM/Podfile.
- **Detect libs/arch:** UI **SwiftUI** (`import SwiftUI`, `@main App`) vs **UIKit** (Storyboards/.xib + UIViewController); arch MVVM/MVC/VIPER/TCA(The Composable Architecture)/Clean; data SwiftData/CoreData/Realm/GRDB/SQLite.swift; net URLSession/Alamofire/Moya/Apollo; async async-await/Combine/RxSwift; DI Swinject/Factory/Resolver; nav NavigationStack/Coordinator; testing XCTest/Quick+Nimble/ViewInspector/snapshot.
- **Structure:** target/feature folders; Models/Views/ViewModels; `Sources/` for SPM.
- **Patterns:** Swift — PascalCase types, camelCase, files PascalCase.
- **Commands:** `xcodebuild build|test`, `swift build|test`, `pod install`, `swiftlint`/`swiftformat`, `fastlane`.
- **Work:** new Swift/iOS detector (Package.swift/Podfile parse + SwiftUI/UIKit detection), Swift patterns, source analysis, `.swift` ext.

---

## Mobile MANDATORY standards (standards.js → mobile block)

Adapted per platform; common spine:

- **Performance (mandatory):** virtualize long lists (`FlatList`/`FlashList` · `ListView.builder` · `LazyColumn`/`LazyRow` · `List`/`LazyVStack`); avoid unnecessary re-renders/rebuilds (memoization · `const` widgets/`select` · `@Stable`/`derivedStateOf` · value types); never block the UI/main thread (offload to background — coroutines/isolates/`Task`/async); cache & right-size images; target 60/120fps, avoid jank; lazy-load heavy screens.
- **UI consistency (mandatory):** reuse the design-system components (RN components / Flutter widgets / Compose composables / SwiftUI views) — do not recreate; one styling approach (NativeWind/Tamagui/StyleSheet · Theme · Material `MaterialTheme` · SwiftUI modifiers); follow platform conventions (Material 3 / Apple HIG); respect safe areas, notches, dynamic type, dark mode; responsive across device sizes & orientation.
- **State & data:** use the detected state manager; persist via the detected store (AsyncStorage/MMKV · Drift/Hive/Isar · Room/DataStore · SwiftData/CoreData); design for **offline** + error/loading states.
- **Platform correctness:** request/handle permissions properly; handle app lifecycle & background; deep links/navigation state; accessibility (labels, focus, contrast, screen readers — TalkBack/VoiceOver).
- **Always (shared):** no duplicate code, common functions, pass linter (ESLint · `dart analyze` · ktlint/detekt · swiftlint), no hardcoded secrets, tests for new behavior.

`detectSides()` gains a `mobile` flag (`framework.type === 'mobile'`). A mobile app paired with a backend (multi-repo) still gets backend standards for the API repo + the **bridge** maps mobile `fetch`/`dio`/`Retrofit`/`URLSession` calls to backend endpoints.

---

## Skills (skills.js) — mobile-adapted

- **design** → mobile-UI: enumerate reusable components/widgets from the detected UI dir; styling approach; platform conventions + a11y + responsive.
- **db** → mobile persistence: detected store (Room/CoreData/Drift/WatermelonDB/SwiftData/Realm) with its migration/query workflow.
- **mobile / perf** (new) → performance checklist + build/release commands (debug/release builds, signing, app bundles) per platform.
- **agents** (`/ship`): `tester` runs the platform test command; `builder` follows platform conventions.

---

## Phasing & releases

| Phase | Scope | Effort | Release |
|---|---|---|---|
| 1 | React Native + Expo (extend Node path) | S | v0.9.0 |
| 2 | Flutter (Dart detector) | M | v0.10.0 |
| 3 | Native Android (Gradle/Kotlin) | L | v0.11.0 |
| 4 | Native iOS (Swift/Xcode) | L | v0.12.0 |

Each phase = detector + module + patterns + standards + skills + settings + fixtures/tests, then publish.

## Testing strategy

Fixture mini-projects per platform under a test harness (minimal `pubspec.yaml` / `build.gradle` / `Package.swift` + a few sample source files). Assert: detected stack (framework/lang/state/data/UI), modules, mobile standards (correct platform rules, no web false-positives), and generated `AGENTS.md`/`CLAUDE.md`/skills. Reuse the adversarial-review workflow before each release.

## Key decisions / risks

- **Zero-dep regex parsing** for YAML/Gradle/Podfile/SPM/TOML (keeps the no-dependency promise; accept some brittleness, add fallbacks).
- **New `type: 'mobile'`** must be handled in architecture labels, `commandsBlock`, `describeModuleType`, and `detectSides`.
- **Hybrid folders:** RN/Flutter ship `android/` + `ios/` subfolders — detect the *primary* framework, don't double-count native subdirs as separate apps.
- **Monorepo:** mobile app + backend → multi-repo bridge applies (mobile ↔ API endpoint map).
- **Kotlin vs Java / Swift vs Obj-C / bare-RN vs Expo** disambiguation by file prevalence + config presence.
