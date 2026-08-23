# ChefMind

CalMind's recipes, with a shopping list and a pantry, syncing through the same
server on the same account. A CLONE of CalMind's `apps/app` and
`packages/core`, not a rewrite — see `AGENTS.md` for the rules that keep it
one. Its own repo since 2026-08-22, extracted from
[chere005/CalMind](https://github.com/chere005/CalMind) with its history.

**Platforms:** the web app at
[seancheren.com/ChefMind](https://seancheren.com/ChefMind) (an installable
PWA — production is the only instance), iOS and Android via Expo, a macOS
desktop shell (Tauri), and Windows `.msi`/`.exe` built by CI.

```
app/            The Expo app, cloned from CalMind's apps/app.
packages/core/  The brain, cloned — plus shopping.ts, units.ts, grocery.ts and
                variant.ts, which have no twins upstream.
tools/          The web export's head patch, service worker, the deploy-guard
                prover, and the dtp/tdtp release lanes.
deploy.sh       The one deploy: the web client, to production.
spec/           The behaviour contract, copied so core's suite runs here.
```

## What it is

Four tabs: **Recipes · Pantry · ⊕ · Shopping**.

- **Recipes** is CalMind's Notes screen, renamed. Only the labels moved — the
  record type is still `note`, the folder's app is still `notes`, and the
  recipe card, the measure badges, the scale row and the photo import are the
  same code CalMind runs. Renaming the data to change a word on screen would be
  a migration for nothing.
- **Variants** let one card hold several things you might make from it. The
  Cheese card is four — Ricotta, Mascarpone, Mozzarella, Burrata — sharing a
  page and a shopping list. A variant is a name plus a set of the card's own
  subheaders; choosing one from the dropdown beside ½×/1×/2× hides the rest,
  and everything before the first subheader is shared and always shown.
  *Manage variants* (the gear) adds, renames, deletes and re-ticks them.
- **Edit mode** is a top-bar button, and a long press or a double tap on any
  recipe gets you there too (Sean, 2026-08-21). In it, recipes carry a tick, a
  **Select all** sits beside the pencil, and the bar at the foot offers
  *Delete* (two presses, red on the first) beside *Add to shopping list*.
- **Shopping** is the list those ticks fill. Pick several recipes, press *Add to
  shopping list*, and their ingredients arrive combined and **grouped by aisle**
  — produce, dairy, meat, dry goods, tins — in the order you walk a shop.
  Amounts are summed in ONE unit per thing: grams for mass, millilitres for
  volume, converted exactly. A cup to a tablespoon is a definition and is done;
  a cup to a gram needs a density that differs per ingredient and is refused,
  so those stay two lines. `core/shopping.ts` and `core/units.ts`, tested.
- **Pantry** is what you already have. It is the same screen as Shopping —
  same rows, same aisles — reading a different folder flag, and it
  **subtracts**: anything on it is left off the shopping list entirely rather
  than added and struck through.
- **Edit mode on both lists** is the Recipes tab's, on the same bar. *Select
  all* sits beside the pencil and is the way IN — it arrives in edit mode with
  everything picked — the tick boxes become round select circles while you are
  there, and the foot of the screen offers *Delete* (two presses, red on the
  first) beside **Refresh**. Refresh combines what is alike harder than the
  list could when the rows arrived from different places: plurals and
  preparation words folded together, a bracketed metric measure preferred to
  the cook's own — `2 cups (250 g) flour` counts as 250 g — and cups summed
  with tablespoons. It still will not turn a cup into a gram, because that
  needs a density (`core/shopping.ts`, `recombineLines`, tested).

## What was taken out

| Gone | Because |
|---|---|
| `Calendar`, `Habits` | not this app |
| `Requests`, `Request`, the account badge | the public request page is CalMind's |
| `QuickTick`, `watch.ts`, the watch/widget targets | no watch, no widgets |
| `subs.ts` | calendar subscriptions belong to the calendar |
| the Event card on Add | an event is a calendar thing |
| `Reminders`, the Reminder card, and the general reminders FOLDER | Sean, 2026-08-21: "remove reminders from ChefMind" — a general list is CalMind's job. The screen went then; the seeded folder named *Reminders* survived until 2026-08-22 ("that should have been removed completely") because the shape pass needed somewhere to file a stray reminder. The shopping list is that somewhere now, and an account that already grew the folder has it folded in — rows first, then the folder. The `reminder` RECORD stays: the shopping rows are reminder records, and Search finds them under **Shopping** |
| the repeat pill on Add | what is left there makes a recipe, and a recipe does not recur |
| the time field on Add | a time belongs to a reminder |
| core's calendar and habit STARTERS | records that would sync forever and never be drawn |

## Accounts and data

Sean, 2026-08-21: *"we might as well reuse calmind logins"*, and its own store.

Both, exactly:

- **The API is CalMind's** — `https://seancheren.com/calmind/api/index.php`.
  Same users, same tokens, same passkeys. There is no ChefMind server.
- **The store is not.** Every sync sends `space: 'chef'`, and the server keeps
  one record file per user per space: `records-<user>.json` is CalMind's,
  `records-chef-<user>.json` is this one. See `records_file()` in
  `server/lib/app.php`.

The space is a CONSTANT in `app/src/api.ts`, never configurable: a ChefMind
build that could be pointed at CalMind's records would merge two apps' stores
into whichever synced last.

`deploy.sh` **refuses to ship** unless the live API answers the public `spaces`
action naming `chef`. An API that does not know the parameter ignores it, and
then nothing errors while every ChefMind record lands in CalMind's own store —
found weeks later, by a reminders list with recipes in it.

## Running it locally

```
npm install
npm run export:web && node tools/patch-web-html.mjs app/dist/index.html
CALMIND_DATA_DIR=/tmp/chefmind-dev-data php -S 127.0.0.1:8792 e2e-router.php
```

…then http://127.0.0.1:8792/ChefMind/. The router serves this app at /ChefMind
and CalMind's API at /calmind/api, which is the arrangement production has —
one origin, two paths. The API itself lives in the CalMind repo: the router
assumes a sibling checkout at `../CalMind` (`CALMIND_REPO` overrides it).

## Deploying

```
./deploy.sh --dry-run     # preview
./deploy.sh --yes-prod    # do it
./deploy.sh --verify      # check what is live
```

It writes `/home/public/ChefMind` and nothing else. There is no test instance:
Sean asked for it straight at production, so the gates are the whole rehearsal.
The SSH login lives in `deploy.conf` (gitignored — see `deploy.conf.sample`).

A release is one gesture, and it ships every platform this repo has — the web,
then the macOS bundle before the tag, then iOS and Android after the push:

```
npm run dtp                      # deploy, tag, push — bumps the minor version
npm run tdtp                     # the same lane with the full test run in front
npm run tdtp -- --web            # the release only, no platform builds
npm run tdtp -- --mac            # …and just the desktop bundle
```

Naming a platform selects only it; naming none means all of them. The device
builds run after the push and are reported rather than fatal — an unplugged
phone is not a failed release. Windows is CI's alone, since Tauri does not
cross-compile.

The platform builds live in `tools/build-platforms.sh`, runnable on their own:

```
sh tools/build-platforms.sh --mac --ios --android
```
