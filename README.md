# ChefMind

Feel free to deploy this on your own website, build and deploy the iOS version, etc.

**This is a personal project to have some fun with claude code, which generated essentially all of the code, and the rest of this readme:**

Recipes, a pantry and a shopping list. A [CalMind](https://github.com/chere005/CalMind) clone that signs in with a CalMind account.

- Tick recipes, press *Add to shopping list*: ingredients combine, grouped by aisle, pantry items skipped.
- Three tabs: Recipes · Pantry · Shopping.
- Runs on web (PWA), iOS, Android, macOS and Windows. Live at [seancheren.com/ChefMind](https://seancheren.com/ChefMind).
- No server of its own. Records live on CalMind's.

<table>
<tr>
<td align="center" valign="top"><img src="docs/screenshots/chefmind-recipes-mobile.png" width="200" alt="Recipes"><br><sub><b>Recipes.</b> In folders; send their ingredients to the list.</sub></td>
<td align="center" valign="top"><img src="docs/screenshots/chefmind-recipe-mobile.png" width="200" alt="Recipe editor"><br><sub><b>Recipe editor.</b> Ingredients, quantities and steps.</sub></td>
<td align="center" valign="top"><img src="docs/screenshots/chefmind-pantry-mobile.png" width="200" alt="Pantry"><br><sub><b>Pantry.</b> What you have, typed or scanned from a receipt.</sub></td>
<td align="center" valign="top"><img src="docs/screenshots/chefmind-shopping-mobile.png" width="200" alt="Shopping list"><br><sub><b>Shopping list.</b> Items grouped by aisle.</sub></td>
</tr>
</table>

## Run

```sh
npm install
npm run export:web && node tools/patch-web-html.mjs app/dist/index.html
CALMIND_DATA_DIR=/tmp/chefmind-dev-data php -S 127.0.0.1:8792 e2e-router.php
```

Needs a sibling `../CalMind` checkout. Release: `npm run dtp` (or `tdtp`, tests first); the tag builds the installers on GitHub.

Docs: [ARCHITECTURE](ARCHITECTURE.md) · [AGENTS](AGENTS.md). BSD 3-Clause.
