# Working in ChefMind

CalMind's recipes plus a shopping list and a pantry, on CalMind's server and
CalMind's accounts. (Reminders were removed 2026-08-21 on Sean's word — the
`reminder` record type stays, because the shopping AND pantry rows are reminder
records.) A CLONE of CalMind's `apps/app` and `packages/core`. `README.md` is
the map.

This was a directory inside the CalMind repo until 2026-08-22, when it was
extracted — history preserved — into its own repo. The upstream it clones
lives at `~/GIT/CalMind` (github.com/chere005/CalMind); the server it syncs
through lives THERE, not here.

## Standing rules

- **It is a clone, so keep it one.** A fix that belongs to the product belongs
  upstream in CalMind first and gets copied down — across repos now, which
  makes the copying a deliberate act rather than a shared working tree. The
  deliberate divergences are written down: `core/shopping.ts`, `core/units.ts`,
  `core/grocery.ts` and `core/variant.ts` (no twins upstream),
  `core/normalize.ts` (no calendar or habit starters, plus the shopping and
  pantry folders), the `shopping` and `pantry` flags on `Folder`, `variants` on
  `Note`, and the screens listed in the README's "what was taken out".
- **The space is not configurable.** `SYNC_SPACE` in `app/src/api.ts` is a
  constant. A build that could be aimed at CalMind's records would merge two
  stores into whichever one synced last, silently.
- **Never point a local build at the production API.** `config.ts` derives the
  API from the page's ORIGIN for exactly this reason. It said
  `https://seancheren.com/...` first, and running the app on a laptop under
  that would have written test records into Sean's real store through an API
  that does not know the space yet.
- **`dtp` = deploy, tag, push; `tdtp` = test, deploy, tag, push.** Sean,
  2026-08-22 — two lanes, and the `t` in front is the full test run, not the
  tag. `npm run dtp` / `npm run tdtp` (tools/dtp.sh, tools/tdtp.sh). Either
  lane bumps the MINOR version — x.y.0 → x.(y+1).0, as everywhere in the
  suite — in the five files that must move together: `app/app.json`
  (version), `package.json`, `desktop/package.json`,
  `desktop/src-tauri/tauri.conf.json` and `desktop/src-tauri/Cargo.toml`
  (Cargo.lock follows). `ios.buildNumber`/`android.versionCode` move by hand
  per device build, not per dtp — the web deploy is what the lane ships.
  A failed deploy stops the lane: nothing is tagged, nothing is pushed, and a
  re-run picks the still-untagged version up rather than burning a number.
  Tags are bare `x.y.0` — no `v`, matching every app in the suite (Sean,
  2026-08-22). The old `chefmind-` namespace existed because two apps shared
  CalMind's repo; this repo's history carries those releases retagged as
  1.0.0/1.0.1/1.1.0, and CalMind no longer holds a `chefmind-` tag at all.
- **Prod is the only instance.** Sean, 2026-08-21: straight to
  seancheren.com/ChefMind. So `deploy.sh`'s gates are not optional and there
  is no rehearsal to fall back on. The SSH login lives in `deploy.conf`
  (gitignored, see deploy.conf.sample); the destination is a guarded constant,
  proven by `npm run test:deploy` breaking copies of the real script.
- **The server suite gates the deploy when it can.** The API is CalMind's, so
  its PHP suite is the one that proves the sync space; `deploy.sh` runs it
  from the sibling checkout (`$CALMIND_REPO`, default `~/GIT/CalMind`) and
  says so OUT LOUD when no checkout exists — the live API `spaces` gate is
  then the only server check. `e2e-router.php` reaches the same checkout for
  local runs.
- **`main` is the branch.** Stage explicit paths — never `git add -A`.

## Development

- **Tests**: `npm run test` (→ `npm run test:core`) runs `packages/core`'s
  suite with `--run` (no watch mode). `spec/` carries the behaviour contract
  copied down from CalMind so core's suite runs against it here too.
- **Types**: `npm run typecheck` runs `tsc --noEmit` over `packages/core` and
  `app` — the two workspaces that are clones, not the desktop shell.
- **Workspaces**: an npm workspaces monorepo — `packages/*`, `app`, `desktop`.

## Platforms — what ships where, and how

- **Web** is the only thing `deploy.sh` ships: the PWA frontend, to
  `seancheren.com/ChefMind` (`/home/public/ChefMind` and nothing else — see
  "Prod is the only instance" above). That frontend has **no server of its
  own** — every sync goes out to CalMind's live API in the `chef` sync space,
  and `deploy.sh`'s server-suite gate refuses to ship unless that live API
  reports the `chef` space. Nothing here implies a ChefMind backend; there
  isn't one.
- **macOS**: the Tauri desktop bundle in `desktop/`. `dmg` packaging is
  excluded from `bundle.targets` (see traps below) — the `.app` bundle is
  the shipped artifact.
- **Windows**: `.msi`/`.exe`, built and smoke-tested in CI only
  (`.github/workflows/desktop-windows.yml`, dispatched after a dtp push) —
  Tauri does not cross-compile, so this repo's own deploy never produces it.
- **iOS**: builds and installs to the physical phone via CoreMind's shared
  `bin/build-platforms.sh --ios` (devicectl) — one of the phone's 3 free-tier
  device slots. Reinstalled 2026-08-22 after MyCalMind was freed from the
  phone to make room.
- **watchOS**: no target. `watch.ts` and the watch/widget targets were taken
  out along with Calendar and Habits (see README's "What was taken out") —
  there is nothing to install to a paired watch.
- **Android**: builds, installs, and launches on a local emulator via
  CoreMind's shared `bin/build-platforms.sh --android`. Confirmed working
  2026-08-22.

macOS, Windows, iOS, and Android are not built by anything in this repo's own
`dtp`/`tdtp` — they come from CoreMind's table-driven, shared
`bin/build-platforms.sh <App> [--mac] [--ios] [--android]`, normally run as
part of `sh bin/dtp.sh all --full --platforms` from CoreMind, which runs
every app's tdtp lane in dependency order (core first, then CalMind, then
this repo — ChefMind's deploy depends on CalMind's live API being up) and
then builds whatever platforms each app's own deploy doesn't ship by itself.
Two rules apply on this machine regardless of which repo you're in: never run
two heavy build/device processes concurrently (proven twice to cause real
failures), and remember the phone's hard cap of 3 installed apps at a time
(currently CalMind, ChefMind, AcctMind — MyCalMind is deliberately not one of
them, to stay under that cap).

## The three lists, and the rules they keep

- **A shopping row and a pantry row are both `reminder` records**, in folders
  wearing the `shopping` and `pantry` flags. One screen renders both
  (`screens/Shopping.tsx`, `<FlagList kind>`), because the only difference is
  which flag it reads. `normalize` seeds exactly one folder of each and neither
  counts as an ordinary reminders folder — miss that second half and the
  pantry is created on one load and demolished as a stray on the next.
- **The pantry SUBTRACTS.** Anything on it is left off the shopping list
  entirely — not added and struck through. The matching lives in
  `core/shopping.ts` so every route obeys it, and it is on the ingredient NAME:
  'flour' must never claim 'almond flour'.
- **Conversion is within a DIMENSION only.** A cup is 236.588 ml by
  definition, so cups and tablespoons of one thing become one line in
  millilitres. A cup to a GRAM needs a density that differs per ingredient, so
  it stays two lines — the original rule, narrowed rather than dropped. See
  `core/units.ts`.
- **A row is filed by its ingredient, not by its measure** — otherwise '3
  cloves garlic' lands in the spice rack. The one exception is `can`/`jar`,
  which say where a thing is SOLD (`core/grocery.ts`, `ingredientAisle`).
- **A variant names its sections by TEXT, not by index.** A variant pointing at
  "the third subheader" would silently mean something else the moment one was
  added above it. Renaming a subheader detaches it, which is visible; an index
  would have been silent. `liveSections` drops names the card no longer has.

## Traps that have cost real time here

- **`space` reaches a filename.** It is whitelisted in `sync_space()` (in
  CalMind's `server/lib/app.php`), never sanitised. "Reject anything not on
  the list" and "strip the characters I thought of" are not the same door.
- **`simctl`/browser text injection lowercases and drops characters.** The
  `**Ingredients**` heading typed into the note body came out
  `**ingredients**`; core matches it case-insensitively, so this cost only
  confusion — but the same injection silently truncated a URL at the first `.`
  elsewhere. Read back what you typed before believing a failure.
- **A two-handled basket icon reads as a WASTE BIN at tab-bar size.** Next to a
  list of things you are about to buy, that is the worst possible misread. One
  arc over the top is the shape nothing else has.
- **`␡` has no glyph in the app's font** and renders as a literal `DEL` box.
- **tauri.conf.json takes NO extra keys.** A `"_note"` alongside the real ones
  fails the schema outright: `Additional properties are not allowed`. Notes
  about that file go here. Two of them: the bundle targets exclude `dmg`,
  because create-dmg's bundle_dmg.sh needs Finder/AppleScript and dies on this
  machine while the `.app` bundles fine; and `msi`/`nsis` build in CI —
  `.github/workflows/desktop-windows.yml`, dispatched after a dtp's push —
  since Tauri does not cross-compile and Windows needs its own toolchain.
- **The desktop shell's `location.origin` is `tauri://localhost`.** Deriving
  the API from it aims every request at a path the asset protocol answers with
  index.html, which reads back as "server error (500)" on the login card.
  `config.ts` carries an explicit tauri branch; CalMind's does too.
- **`app/ios/build/` is NOT disposable.** It looks like derived output and is
  gitignored, but ReactCodegen's generated sources live under
  `build/generated/ios/` and are written by `pod install`, not by xcodebuild.
  Delete it to free disk and the next build dies on seven "Build input file
  cannot be found" errors naming files nobody wrote. `pod install` (with the
  UTF-8 locale) puts them back.
- **A build killed by a full disk leaves a Gradle LOCK behind.** The next run
  fails in under a second with "Cannot lock file hash cache … already been
  locked by this process", which reads as a concurrency bug rather than
  wreckage. `./gradlew --stop` and remove `app/android/.gradle`.
- **A Directions row must be NUMBERED or splitRecipeBody ends the block there.**
  A test fixture with '- salt' under **Directions** put half the card in
  `after`, untouched — which read as the variant filter leaking. The parser was
  right and the fixture was wrong, which is the way round that is easy to miss.
- **Metro's port is not a constant.** `config.ts` used to spot the dev server
  by an allow-list of ports (8081, 19006). Start it on any other — because 8081
  is busy with CalMind's, which is the normal case on this machine — and the
  app aimed at `http://localhost:<that>/calmind/api/index.php`, got Metro's
  index.html and reported "server error" on the login card. It matches the
  HOST now.
- **`Modal` fades in, so a screenshot taken right after opening one shows it
  half-transparent.** Two minutes went on "why is the variants window see-
  through" before the DOM said it was `rgb(26,26,26)` all along.
- **The shell's working directory persists between Bash calls.** Use absolute
  paths.
- **Ask what happens when a write fails.** Same rule as upstream: the snapshot
  is the device's only copy between syncs, and a store that will not parse is
  moved aside and reported, never treated as an empty account.
