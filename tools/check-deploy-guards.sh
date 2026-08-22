#!/bin/sh
# Does deploy.sh's guard set still refuse what it claims to refuse?
#
# Every check here works by BREAKING a copy of the real script and watching it
# stop — never by reading it. The method is CalMind's
# tools/check-deploy-guards.sh, where two gates that could not fail printed
# reassuring output for months; no assertion here passes unless the tampered
# copy exits non-zero.
#
# EVERY copy has its ssh, rsync and curl calls replaced with echo. This is not
# belt-and-braces: the point of each case is that a guard has been removed, so
# the copy WILL reach the transfer step whenever the check is doing its job
# and finding a real hole. (curl too — the destination guards run before the
# API gate and never reach it, but a check that only works because of an
# ordering it does not state is one refactor from silently hitting the
# network.)
#
# Nothing here needs SSH_DEST, credentials or a network — the guards run
# before deploy.conf is read, deliberately, so this is runnable by anyone.
#
#   sh tools/check-deploy-guards.sh
set -e
cd "$(dirname "$0")/.."

TMP=$(mktemp -d -t chefguards)
trap 'rm -rf "$TMP" ./_guardcheck-*.sh' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s\n' "$1"; }

# A tampered copy lives at the repo root, because deploy.sh does
# `cd "$(dirname "$0")"` to find the repo.
try() { # try <label> <sed expr> <args...>
  label="$1"; expr="$2"; shift 2
  copy="./_guardcheck-$$.sh"
  sed -e "$expr" \
      -e 's|^\( *\)ssh |\1echo "   [guardcheck] would ssh: " |' \
      -e 's|^\( *\)rsync |\1echo "   [guardcheck] would rsync: " |' \
      -e 's|^\( *\)curl |\1echo "   [guardcheck] would curl: " |' \
      deploy.sh > "$copy"
  chmod +x "$copy"
  if "$copy" "$@" >"$TMP/out" 2>&1; then
    bad "$label — it RAN (exit 0); the guard did not fire"
    sed -n '1,4p' "$TMP/out" | sed 's/^/      /'
  else
    ok "$label"
  fi
  rm -f "$copy"
}

echo "deploy.sh — destination and consent"
# ChefMind writes the PRODUCTION document root and has no test instance, so
# these guards are the only thing between a typo and seancheren.com.
# The bare form must refuse: this one is about argv, so the copy is unmodified.
try "refuses to run without --yes-prod"  's|^#unchanged$|#unchanged|'
try "refuses the site root"              's|^WEB_DEST=.*|WEB_DEST="/home/public"|'              --yes-prod
try "refuses CalMind's own area"         's|^WEB_DEST=.*|WEB_DEST="/home/public/calmind"|'      --yes-prod
try "refuses CalMind's test area"        's|^WEB_DEST=.*|WEB_DEST="/home/public/test/calmind"|' --yes-prod
try "refuses a stray destination"        's|^WEB_DEST=.*|WEB_DEST="/home/public/somewhere"|'    --yes-prod

echo "deploy.sh — the API gate"
# THE ONE PROTECTING SEAN'S DATA rather than his web root: ChefMind sends
# space='chef', and an API that does not know the parameter ignores it and
# merges ChefMind's records into CalMind's store. Both directions are
# checked, because a gate that always refuses would pass the negative case
# while blocking every real deploy.
try "refuses when the API does not know the space" \
  's|^  ANSWER=$(api_spaces .*|  ANSWER=\x27{"ok":true,"spaces":["something-else"]}\x27|' --yes-prod

copy="./_guardcheck-pass-$$.sh"
sed -e 's|^  ANSWER=$(api_spaces .*|  ANSWER=\x27{"ok":true,"spaces":["chef"]}\x27|' \
    -e 's|^\( *\)ssh |\1echo "   [guardcheck] would ssh: " |' \
    -e 's|^\( *\)rsync |\1echo "   [guardcheck] would rsync: " |' \
    -e 's|^\( *\)curl |\1echo "   [guardcheck] would curl: " |' \
    deploy.sh > "$copy"
chmod +x "$copy"
# It will stop later — at a gate that needs a real export or the conf — and
# that is fine. What is proved here is that it got PAST the API gate and said
# so, which is what stops this check from being one that can only ever refuse.
"$copy" --yes-prod >"$TMP/chefpass" 2>&1 || true
if grep -q 'it does\.' "$TMP/chefpass"; then
  ok "and passes when the API names it"
else
  bad "the API gate refused an API that DOES know the space — check $TMP/chefpass"
fi
rm -f "$copy"

echo
echo "────────────────────────────────"
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
