#!/bin/sh
# dtp — deploy, tag, push. The release gesture for ChefMind.
# tdtp — the same lane with the full test run in front: tools/tdtp.sh, which
# calls this with --full. (Sean's shorthand, 2026-08-22: dtp = deploy, tag,
# push; tdtp = test, deploy, tag, push.)
#
# What a run does, in order:
#   0. refuse a tree with uncommitted TRACKED changes — the tag must name
#      exactly what shipped
#   1. (--full only) typecheck + core suite, before anything is touched
#   2. bump the MINOR version (x.y.0 → x.(y+1).0) in the five files that move
#      together, and commit the bump — UNLESS the current version is still
#      untagged, which means a previous run bumped and then failed before
#      tagging: that version is reused, not skipped past. Re-running a failed
#      dtp is therefore safe and does not burn a number.
#   3. ./deploy.sh --yes-prod       (the gates live in there; a failed deploy
#                                    stops everything — never tag around one)
#   4. tag vX.Y.0 (annotated)
#   5. git push --follow-tags
#   6. dispatch the desktop-windows workflow (CI builds the pushed tree);
#      a dispatch failure is reported but does not un-ship the release
#
# A dtp bumps the MINOR version — standing rule, every app in the suite.
# ios.buildNumber / android.versionCode are NOT touched here: those move by
# hand per device build, the web deploy being what this lane ships.
set -e
cd "$(dirname "$0")/.."

FULL=0
for a in "$@"; do
  case "$a" in
    --full) FULL=1 ;;
    *) echo "unknown flag: $a" >&2; exit 1 ;;
  esac
done

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "refusing: uncommitted tracked changes — commit your work first, so the" >&2
  echo "tag names exactly what shipped:" >&2
  git status --porcelain --untracked-files=no | sed 's/^/  /' >&2
  exit 1
fi

if git remote get-url origin >/dev/null 2>&1; then
  git pull --autostash --quiet
fi

if [ "$FULL" = 1 ]; then
  echo "==> tdtp: the full run, before anything is touched"
  for P in packages/core app; do
    npx tsc --noEmit -p "$P" || { echo "$P typecheck failed — nothing shipped" >&2; exit 1; }
  done
  npm run -s test:core -- --reporter=dot || { echo "core suite failed — nothing shipped" >&2; exit 1; }
fi

# ------------------------------------------------------------------ the version
CUR=$(node -p "require('./package.json').version")
case "$CUR" in
  *[!0-9.]*|.*|*.|*..*) echo "package.json version '$CUR' is not x.y.z" >&2; exit 1 ;;
esac

if git rev-parse -q --verify "refs/tags/v$CUR" >/dev/null; then
  NEW=$(echo "$CUR" | awk -F. '{printf "%d.%d.0", $1, $2+1}')
  echo "==> version: $CUR (tagged) -> $NEW"
else
  # A previous run bumped, then failed before tagging. Ship THAT version
  # rather than burning a number per retry.
  NEW="$CUR"
  echo "==> version: $CUR is still untagged from an earlier run — reusing it"
fi

# The five files that move together (AGENTS.md). Each substitution is
# VERIFIED below — a sed that matches nothing reports success, which is
# AcctMind's hard-learned lesson, not a hypothetical.
if [ "$NEW" != "$CUR" ]; then
  for F in package.json app/app.json desktop/package.json desktop/src-tauri/tauri.conf.json; do
    perl -i -pe "s|\"version\": \"\Q$CUR\E\"|\"version\": \"$NEW\"|" "$F"
  done
  perl -i -pe "s|^version = \"\Q$CUR\E\"|version = \"$NEW\"|" desktop/src-tauri/Cargo.toml
fi
for F in package.json app/app.json desktop/package.json desktop/src-tauri/tauri.conf.json; do
  grep -q "\"version\": \"$NEW\"" "$F" || { echo "guard: $F does not carry $NEW" >&2; exit 1; }
done
grep -q "^version = \"$NEW\"" desktop/src-tauri/Cargo.toml \
  || { echo "guard: Cargo.toml does not carry $NEW" >&2; exit 1; }

# Cargo.lock follows the crate — otherwise the next desktop build dirties it.
if command -v cargo >/dev/null 2>&1; then
  (cd desktop/src-tauri && cargo update -p chefmind-desktop --quiet)
else
  echo "   (no cargo on PATH — Cargo.lock will catch up on the next desktop build)"
fi

if ! git diff --quiet -- package.json app/app.json desktop/package.json \
    desktop/src-tauri/tauri.conf.json desktop/src-tauri/Cargo.toml desktop/src-tauri/Cargo.lock; then
  git add package.json app/app.json desktop/package.json \
    desktop/src-tauri/tauri.conf.json desktop/src-tauri/Cargo.toml desktop/src-tauri/Cargo.lock
  git commit -q -m "ChefMind $NEW"
  echo "==> committed the bump"
fi

# ------------------------------------------------------------------- the deploy
./deploy.sh --yes-prod

# --------------------------------------------------------------- tag, push, CI
git tag -a "v$NEW" -m "ChefMind $NEW"
git push --follow-tags origin main
echo "==> pushed, tagged v$NEW"

if command -v gh >/dev/null 2>&1 && [ -f .github/workflows/desktop-windows.yml ]; then
  gh workflow run desktop-windows \
    && echo "==> desktop-windows dispatched (CI builds the pushed tree)" \
    || echo "   WARNING: desktop-windows dispatch failed — run it from the Actions tab" >&2
fi

echo "==> dtp done: v$NEW is live"
