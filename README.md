# ChefMind

Feel free to deploy this on your own website, build and deploy the iOS version, etc.

**This is a personal project to have some fun with claude code, which generated essentially all of the code, and the rest of this readme:**

Recipes, with a shopping list and a pantry. Tick the recipes you mean to cook,
press *Add to shopping list*, and their ingredients arrive on one list —
combined, and grouped by aisle in the order you walk a shop. Anything already
in the pantry is left off it. Four tabs: **Recipes · Pantry · ⊕ · Shopping**.

It is a clone of [CalMind](https://github.com/chere005/CalMind)'s app and core
rather than a rewrite, and it signs in with a CalMind account — same users,
same tokens, same passkeys. There is no ChefMind server and no separate
sign-up; the records just live in their own store on CalMind's.

**Where it runs:** the web app at
[seancheren.com/ChefMind](https://seancheren.com/ChefMind), which installs as a
PWA and is the only instance there is; iOS and Android via Expo; a macOS
desktop shell built with Tauri; and Windows `.msi`/`.exe` built by CI.

## Running it locally

```
npm install
npm run export:web && node tools/patch-web-html.mjs app/dist/index.html
CALMIND_DATA_DIR=/tmp/chefmind-dev-data php -S 127.0.0.1:8792 e2e-router.php
```

Then http://127.0.0.1:8792/ChefMind/. The API is CalMind's and comes from a
sibling checkout, which needs a server of its own —
[ARCHITECTURE.md](ARCHITECTURE.md#running-it-locally) has the whole recipe.

## Shipping it

`npm run tdtp` is the release: the tests, then the web deploy to production,
then the macOS bundle, then the tag and the push, and the iOS and Android
builds last. `./deploy.sh --dry-run` previews the web deploy on its own.

## More

[ARCHITECTURE.md](ARCHITECTURE.md) is the long version — the tree, what each
screen does, what was taken out of CalMind and why, how the accounts and the
store are split, and the deploy and release lanes in detail.
[AGENTS.md](AGENTS.md) is the working rules for anyone, human or agent,
changing the code. BSD 3-Clause; see [LICENSE](LICENSE).
