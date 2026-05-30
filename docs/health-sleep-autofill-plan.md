# Plan: Health sleep auto-fill (Health Connect + HealthKit)

**Goal:** automatically mark the hours you were asleep with your Sleep activity, by
reading sleep sessions from **Android Health Connect** and **Apple HealthKit**. It
only fills hours you haven't logged and never overwrites a manual entry.

Review the **Decisions to confirm** at the bottom; once you pick those, I can build it.

---

## 1. Build reality (important)

- **Android (Health Connect): buildable on the existing NAS Android pipeline.** Do this
  first — you can test it on your Pixel 9 Pro via the `android-latest` APK like today.
- **iOS (HealthKit): NOT buildable on the NAS** — HealthKit needs a native iOS build
  (Xcode/macOS). That means **EAS Build (Expo cloud) or a Mac**. So iOS lands in a second
  pass; the shared data layer below is reused as-is, only the native read differs.
- **Web:** no health API — the feature is hidden on web (`Platform.OS` guard).

So the realistic order is **Android now, iOS when we have an EAS/Mac build path.**

## 2. Libraries

- **Android:** [`react-native-health-connect`](https://github.com/matinzd/react-native-health-connect)
  — reads `SleepSessionRecord`, ships an Expo config plugin. Health Connect is built into
  Android 14+ (your Pixel 9 Pro); on 13 it's a Play-Store app.
- **iOS:** [`@kingstinct/react-native-healthkit`](https://github.com/kingstinct/react-native-healthkit)
  — typed, Expo config plugin, reads `HKCategoryTypeIdentifierSleepAnalysis`.

Both are config-plugin based, so they work with our prebuild (CNG) flow — no manual native edits.

## 3. Permissions & config (`app.json`)

- **Android:** the `react-native-health-connect` plugin adds the
  `android.permission.health.READ_SLEEP` permission, the Health Connect `<queries>` entry,
  and the permission-rationale activity. (minSdk 26 already satisfied.)
- **iOS:** the HealthKit plugin adds the HealthKit entitlement +
  `NSHealthShareUsageDescription` ("RightNow reads your sleep to auto-fill the hours you
  were asleep.").

## 4. Architecture

**`app/lib/health.ts`** — platform-agnostic interface (impl split via `Platform` /
`.android.ts` / `.ios.ts`; web returns "unavailable"):

```ts
isHealthAvailable(): boolean
requestSleepPermission(): Promise<boolean>
readSleepSessions(sinceMs: number): Promise<{ start: number; end: number }[]>  // epoch ms
```

**`app/lib/sleepFill.ts`** — pure, unit-tested mapping (no native deps):

```ts
// For each session, the local (date,hour) slots where >= THRESHOLD of the hour falls
// inside a sleep session. Merges overlapping sessions first.
sleepHours(sessions: {start:number;end:number}[], threshold = 0.5): { date: string; hour: number }[]
```

**Integration** (`lib/healthSync.ts`, called on app foreground + a Settings button):
- If `config.healthSleepEnabled` and permission granted:
  - `readSleepSessions(config.lastHealthSyncAt || backfillStart)`
  - `sleepHours(...)` → for each slot **with no existing entry** (or only a prior
    `source:"health"` entry), `setEntry(date, hour, config.sleepActivityIndex, null, "health")`.
  - Write with the slot's real-time `updatedAt` minus an epsilon so **any manual edit wins
    LWW**, and **skip hours that already have a manual entry** (never clobber real logs).
  - Update `config.lastHealthSyncAt`.

This reuses the existing `setEntry` / `source:"health"` field and the chunked push, so
health-filled hours sync like anything else.

## 5. Config additions (`lib/config.ts`)

```ts
healthSleepEnabled: boolean   // default false
sleepActivityIndex: number    // which activity = "Sleep", default 0 (the built-in Sleep)
lastHealthSyncAt: number      // epoch ms of last health read
```

## 6. UI

- **Settings → "Sleep auto-fill"** (native only; hidden on web):
  - Toggle on → `requestSleepPermission()` → initial **backfill** over the chosen range.
  - "Sync sleep now" button + "Last synced …".
  - A **Sleep activity** picker (defaults to your Sleep activity) so it still works if you
    rename/reindex activities.
- **Grid:** health-sourced Sleep renders the same as manual Sleep (source is just metadata);
  optionally a subtle dot to distinguish auto-filled hours.

## 7. Backfill & ongoing sync

- **On enable:** backfill the last N days (default 30).
- **On app foreground:** read sessions since `lastHealthSyncAt`, fill new sleep hours.
- **True background (later):** iOS HealthKit background delivery / Android periodic via
  `expo-background-fetch` + `expo-task-manager`. Not needed for v1 (foreground sync covers it).

## 8. Files to create / change

- deps: `react-native-health-connect` (Android); `@kingstinct/react-native-healthkit` (iOS).
- `app.json`: add the two config plugins.
- `app/lib/health.ts` (+ `.android.ts` / `.ios.ts`), `app/lib/sleepFill.ts` (+ `.test.ts`),
  `app/lib/healthSync.ts`.
- `app/lib/config.ts`: the 3 fields above.
- `app/app/(tabs)/settings.tsx`: the "Sleep auto-fill" section + Sleep-activity picker.
- foreground hook (in `app/app/_layout.tsx` or home `index.tsx`).
- `app/(tabs)/_layout` etc.: no route changes (Settings-only).

## 9. Verify

- **Android:** prebuild + NAS APK build (existing pipeline) → install on the Pixel 9 Pro →
  grant Health Connect permission → confirm last night's sleep fills the right hours,
  doesn't overwrite anything you logged, and syncs.
- Unit tests for `sleepFill.sleepHours` (DST/midnight-spanning sessions, partial hours,
  the threshold, overlapping sessions).
- **iOS:** deferred to an EAS/Mac build.

---

## Decisions to confirm before "go"

1. **Android first (NAS-buildable) now, iOS later via EAS/Mac** — OK? (Or set up EAS now so
   both ship together?)
2. **"Hour counts as sleep" threshold** — default **≥ 50%** of the hour inside a sleep
   session. (Lower = more aggressive fill.)
3. **Which activity is "Sleep"** — default to your Sleep activity (index 0) with a Settings
   picker — OK?
4. **Initial backfill range** — default **30 days**. (Health Connect typically retains ~30
   days; HealthKit retains more.)
5. **Overwrite policy** — only fill **unlogged** hours, never touch a manual entry or any
   hour that has a feeling — OK?
6. **Sleep stages** — treat the whole sleep session as "asleep" (simple), or only count
   asleep stages (core/deep/REM) and exclude "awake in bed"? Default: **whole session**.
