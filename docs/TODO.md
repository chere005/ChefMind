# ChefMind backlog

- [ ] **Pantry: normalize ingredient identity and correct aisle assignment.** Reported during screenshot review on October 25, 2026: quantity/unit prefixes such as `500 g rice` make pantry names confusing and can leave duplicate ingredients or misleading Produce/Dry Goods groupings. This is open; the screenshot fixture was cleaned, but application behavior was not changed.

  Reproduce in a disposable pantry on 1.29.0:
  1. Add `Rice`, then `500 g rice`. The current UI keeps two separate rows under Dry Goods.
  2. Add `Black pepper`. It appears under Produce, although it belongs under Spices & Seasoning. This also occurs without any quantity prefix.
  3. Check add, receipt/list import, rename, and refresh paths for prefixed/plain forms of the same ingredient appearing in different groups. The reported rice-in-Produce case was not reproduced in this capture: both `Rice` and `500 g rice` classified as Dry Goods.

  Expected: quantities and units do not change the ingredient's identity or aisle; equivalent pantry ingredients resolve consistently instead of remaining duplicate names. Rice belongs in Dry Goods. Black pepper belongs in Spices & Seasoning; fresh peppers still belong in Produce. Preserve legitimate can/jar handling and avoid converting between mass and volume without a supported conversion.

  Investigate the core ingredient parser, pantry matching/normalization, and grocery-rule precedence (`packages/core/src/recipe.ts`, `shopping.ts`, `grocery.ts`) plus pantry add/import plumbing in `app/src/screens/Shopping.tsx`. Add regression vectors for prefixed/plain rice, duplicate add/import paths, and black pepper versus fresh pepper before claiming a fix.
