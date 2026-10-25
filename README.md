# ChefMind

Recipes, a pantry and a shopping list. A [CalMind](https://github.com/chere005/CalMind) clone that signs in with a CalMind account.

## Disclaimer

Feel free to deploy this on your own website, build and deploy the iOS version, etc.

**This is a personal project to have some fun with claude code, which generated essentially all of the code, and the rest of this readme:**

## Quick start / Install

- Web: [seancheren.com/ChefMind](https://seancheren.com/ChefMind). Installs as a PWA. Sign in with a CalMind account.
- macOS and Windows: installers on [GitHub Releases](https://github.com/chere005/ChefMind/releases). Unsigned.
- iOS and Android: build from source, see Building.

## Notes

- Three tabs: Recipes · Pantry · Shopping.
- No server of its own. Records live on CalMind's, under the same account.
- Runs on web, iOS, Android, macOS and Windows.

## Usage

Tick the recipes you mean to cook and press *Add to shopping list*. Ingredients combine, grouped by aisle. Anything in the pantry is left off.

<table>
<tr>
<td align="center" valign="top"><img src="docs/screenshots/chefmind-recipes-mobile.png" width="200" alt="Recipes"><br><sub><b>Recipes.</b> In folders; send their ingredients to the list.</sub></td>
<td align="center" valign="top"><img src="docs/screenshots/chefmind-recipe-mobile.png" width="200" alt="Recipe editor"><br><sub><b>Recipe editor.</b> Ingredients, quantities and steps.</sub></td>
<td align="center" valign="top"><img src="docs/screenshots/chefmind-pantry-mobile.png" width="200" alt="Pantry"><br><sub><b>Pantry.</b> What you have, typed or scanned from a receipt.</sub></td>
<td align="center" valign="top"><img src="docs/screenshots/chefmind-shopping-mobile.png" width="200" alt="Shopping list"><br><sub><b>Shopping list.</b> Items grouped by aisle.</sub></td>
</tr>
</table>

## Building

```sh
npm install
npm run export:web && node tools/patch-web-html.mjs app/dist/index.html
CALMIND_DATA_DIR=/tmp/chefmind-dev-data php -S 127.0.0.1:8792 e2e-router.php   # then http://127.0.0.1:8792/ChefMind/
```

Needs a sibling `../CalMind` checkout. Phones: `sh tools/build-platforms.sh --ios` or `--android`. Desktop: `npm run desktop`. Release: `npm run dtp` (or `tdtp`, tests first); the tag builds the installers on GitHub.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md): the tree, the screens, accounts and store, deploy and release lanes.
- [AGENTS.md](AGENTS.md): rules for anyone, human or agent, changing the code.

## Contributing

Issues and pull requests are welcome. Read AGENTS.md first; `npm test` and `npm run typecheck` must pass. BSD 3-Clause, see [LICENSE](LICENSE).
