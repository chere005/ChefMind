/**
 * A shopping list out of chosen recipes.
 *
 * ChefMind only (Sean, 2026-08-21): pick several recipes in the Recipes tab's
 * edit mode and their ingredients become the list. CalMind's core has no twin
 * of this file — it has no shopping tab to feed.
 *
 * THE RULE, and the reason it is a rule rather than a concatenation: a cook
 * shopping for three dinners wants one line that says how much butter, not
 * three lines each saying some.
 *
 * CONVERSION, added 2026-08-22 (Sean: "consolidate identical items.. sum the
 * total amount needed to purchase in a consistent unit by type... grams/ml if
 * possible, even if converted properly"). This file used to refuse every
 * conversion, on the grounds that '1 cup butter' plus '2 tbsp butter' means
 * choosing a density. That was two rules wearing one coat:
 *
 *   - cup → tbsp is VOLUME to VOLUME, exact by definition, invents nothing;
 *   - cup → gram is volume to MASS, and still refused, for the original
 *     reason. Butter, flour and honey do not weigh the same per cup, and a
 *     list that quietly picks one is worse than a list that repeats itself.
 *
 * So lines that name the same thing in the same DIMENSION are added together
 * and rendered once in grams or millilitres; lines in different dimensions
 * stay as two lines, as they always did. A unit with no dimension (clove,
 * can, pinch, 'large') combines only with itself, exactly as before.
 *
 * THE PANTRY (Sean, same day: "if something is on the pantry already, skip
 * adding to shopping cart") is applied here rather than at the call site, so
 * every route into the list obeys it and there is one place to look.
 */
import { ingredientParts, isSubheader, countWord, qtyText, qtyValue, singularOf } from './recipe';
import { amountText, formatBase, toBase, unitDimension, type Dimension } from './units';
import { ingredientAisle, type Aisle } from './grocery';

export type ShoppingSource = { title: string | null; ingredients: string[] };

/** One thing to buy, before it is written out. */
type Entry = {
  /** Summed in the dimension's base unit (g or ml) when `dim` is set, and in
   *  the line's own unit when it is not. Null once a range has poisoned it. */
  qty: number | null;
  dim: Dimension | null;
  /** The unit as written — kept for the dimensionless case, where it is the
   *  only unit this entry will ever have. */
  unit: string | null;
  name: string;
  /** The first line exactly as written, which is what an unsummable entry
   *  falls back to rather than a reconstruction. */
  raw: string;
};

/** Case-folded, punctuation-light, for deciding "the same thing". */
function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, '').replace(/\s+/g, ' ').trim();
}

/**
 * One line per thing to buy, in the order first met.
 *
 * Order matters and is the ORDER THE RECIPES WERE PICKED IN, not alphabetical
 * and not regrouped: the list reads as "the first recipe, then what the second
 * one adds", which is how someone checks they chose the right recipes. The
 * shopping screen groups by aisle for the walk round the shop; that is a view
 * over this order, not a change to it.
 *
 * `pantry` is a list of names already on hand. Anything matching one of them
 * is left out entirely — not added and struck through, left out: a list you
 * have to read past is the thing it was meant to save you from.
 */
export function shoppingLines(sources: ShoppingSource[], pantry: string[] = []): string[] {
  return shoppingEntries(sources, pantry).map((e) => e.text);
}

/** The same list, with each line's aisle and name alongside — what the
 *  shopping screen needs to group without re-parsing every row. */
export function shoppingRows(
  sources: ShoppingSource[],
  pantry: string[] = [],
): { text: string; name: string; aisle: Aisle }[] {
  return shoppingEntries(sources, pantry);
}

function shoppingEntries(
  sources: ShoppingSource[],
  pantry: string[],
): { text: string; name: string; aisle: Aisle }[] {
  const have = new Set(pantry.map((p) => nameKey(ingredientParts(p).name || p)).filter(Boolean));
  // Insertion-ordered, which is what Map guarantees and a plain object does
  // not for numeric-looking keys.
  const seen = new Map<string, Entry>();
  for (const src of sources) {
    for (const line of src.ingredients) {
      const text = line.trim();
      // A subheader is a heading for the COOK ("For the béchamel:"), not a
      // thing to buy. It carries no quantity by definition — that is what
      // isSubheader tests — so it would otherwise arrive as a bare row
      // telling you to purchase a phase of the work.
      if (text === '' || isSubheader(text)) continue;
      const p = ingredientParts(text);
      const unit = p.unit?.toLowerCase() ?? null;
      const name = p.name.trim();
      const nk = nameKey(name);
      if (nk !== '' && have.has(nk)) continue;   // already in the pantry
      const dim = unitDimension(unit);
      // The key is what "the same thing" means. Case-folded; the DIMENSION
      // counts rather than the unit, so cups and tablespoons of the same
      // thing are one line while grams and cups of it stay two.
      //
      // A dimensionless unit is SINGULARISED first. UNIT_MAP canonicalises
      // 'cloves' to 'cloves' and 'clove' to 'clove' — deliberately, so the
      // scaler can print back the spelling the author used — which meant
      // '1 clove garlic' and '3 cloves garlic' were two different things.
      const key = `${dim ?? (unit === null ? '' : singularOf(unit))}|${nk}`;
      // A RANGE ('2-3 cloves') has no single value, so qtyValue answers null
      // and the entry stops combining from then on. That is the honest
      // outcome: '2-3 cloves' plus '4 cloves' has no arithmetic, and inventing
      // one would put a number on the list nobody wrote.
      const rawQty = p.qty === null ? null : qtyValue(p.qty);
      const qty = rawQty === null ? null : dim === null ? rawQty : toBase(rawQty, unit);
      const prev = seen.get(key);
      if (!prev) {
        seen.set(key, { qty, dim, unit, name, raw: text });
        continue;
      }
      // Two lines that both parse: add them. Anything else keeps the first
      // line exactly as written, which is also what makes a repeated
      // quantity-less ingredient ('salt') collapse to one row.
      if (prev.qty !== null && qty !== null) prev.qty += qty;
      else prev.qty = null;
    }
  }
  return [...seen.values()].map((e) => {
    const text = render(e);
    return { text, name: e.name, aisle: ingredientAisle(e.name, e.unit) };
  });
}

function render(e: Entry): string {
  if (e.qty === null) return e.raw;
  if (e.dim !== null) {
    // Grams and millilitres, which is what Sean asked for and what makes one
    // unit per thing possible at all. amountText, not qtyText: 236.59 ml has
    // no vulgar fraction, and ⅙ of a gram is not a shopping instruction.
    const { qty, unit } = formatBase(e.qty, e.dim);
    return `${amountText(qty)} ${unit} ${e.name}`.trim();
  }
  const amount = qtyText(e.qty);
  // countWord is what makes '1 clove' and '2 cloves' both right — and the same
  // call the scaler makes, so the two agree about English.
  return e.unit ? `${amount} ${countWord(e.unit, e.qty)} ${e.name}`.trim() : `${amount} ${e.name}`.trim();
}
