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
 * What a cook did TO an ingredient, as opposed to which ingredient it is.
 *
 * This list is the whole of the loose match's extra reach, and every word on
 * it was chosen by one test: could dropping it ever send you home with the
 * wrong thing? 'chopped' cannot — chopped onions and onions are one purchase.
 * So the list is preparation and size, and nothing else.
 *
 * What is deliberately NOT here is longer than what is: ground, whole, dried,
 * smoked, salted, unsalted, heavy, double, plain, self-raising, dark, white,
 * brown, and every colour and nut in the shop. Those name a DIFFERENT THING
 * on the shelf — dried basil is not fresh basil, and the standing rule that
 * 'flour' must never claim 'almond flour' is the same rule seen from the
 * other side. A loose match that swallowed them would combine two lines into
 * one wrong one, which is worse than the two lines it started with.
 */
const PREP_WORDS = new Set([
  'chopped', 'diced', 'minced', 'sliced', 'shredded', 'grated', 'crushed', 'cubed',
  'halved', 'quartered', 'peeled', 'seeded', 'cored', 'stemmed', 'trimmed', 'rinsed',
  'drained', 'softened', 'melted', 'beaten', 'whisked', 'sifted', 'packed', 'divided',
  'optional', 'finely', 'roughly', 'coarsely', 'thinly', 'freshly', 'lightly', 'well',
  'large', 'small', 'medium', 'extra', 'approx', 'about', 'plus', 'more', 'needed',
]);

/**
 * The same name, reduced to the thing itself — the loose match Refresh uses.
 *
 * Three passes, in this order because each one makes the next simpler: drop a
 * bracketed aside ('flour (plain)'), cut a comma tail (', softened' — what a
 * cook writes after the ingredient is a note to themselves, never a second
 * ingredient, because a second one would be its own line), then drop the prep
 * words and singularise what is left. 'Chopped Onions, finely' and 'onion'
 * meet in the middle at 'onion'.
 */
function looseNameKey(name: string): string {
  const words = nameKey(bareName(name)).split(' ').filter(Boolean);
  const kept = words.filter((w) => !PREP_WORDS.has(w)).map((w) => singularOf(w));
  // Never reduce a name to nothing: a line that says only 'chopped' is a line
  // that says 'chopped', and it should combine with itself rather than with
  // every other emptied name on the list.
  return (kept.length > 0 ? kept : words).join(' ');
}

/** A name with its bracketed aside and its comma tail taken off — what the
 *  loose match compares, and what it puts on the list. */
function bareName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/,[\s\S]*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The metric measure a recipe writes in brackets beside its own — '2 cups
 * (250 g) flour', which is one ingredient stated twice.
 *
 * Sean, 2026-08-22: "if multiple units are provided, prefer g/ml to cups
 * etc." Preferring it is not a conversion and needs no density: the author
 * already did the weighing, and taking the number they wrote is the one way
 * to get a mass out of a cup of flour without inventing anything. Only g, kg,
 * ml and l count — a bracketed '(2 sticks)' is an aside about packaging, not
 * a better measure.
 */
const METRIC_ASIDE = /\((?:approx\.?\s*|about\s*|~)?(\d+(?:[.,]\d+)?)\s*(g|gram|grams|kg|kilogram|kilograms|ml|millilitre|millilitres|milliliter|milliliters|l|litre|litres|liter|liters)\b[^)]*\)/i;

function metricAside(text: string): { qty: string; unit: string } | null {
  const m = METRIC_ASIDE.exec(text);
  if (!m) return null;
  return { qty: m[1]!.replace(',', '.'), unit: m[2]!.toLowerCase() };
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

/**
 * The same combining, tried HARDER — what the Refresh button on the shopping
 * and pantry lists runs (Sean, 2026-08-22: "a button that says refresh that
 * puts additional effort into combining things that are alike").
 *
 * It takes the rows a list already holds rather than recipes, because by the
 * time you press it the lines have come from several places: two recipes, a
 * thing typed in at the shop door, a row edited by hand. shoppingLines
 * combined each batch as it arrived and had no way to see across them.
 *
 * THREE things it does that the strict pass does not, and nothing else:
 *   - matches on the loose name — prep words dropped, plurals folded, a
 *     bracketed aside and a comma tail ignored (see looseNameKey);
 *   - prefers a bracketed metric measure to the cook's own (metricAside);
 *   - keeps the SHORTEST of the names it merged, so a list tidies towards
 *     'onions' rather than away from it.
 *
 * What it deliberately does NOT do is convert across dimensions. Grams and
 * cups of the same thing are still two lines here, for the reason at the top
 * of this file: that conversion needs a density, and a shopping list that
 * invents one is worse than a list that repeats itself. 'Additional effort'
 * was never a licence to guess.
 */
export function recombineLines(texts: string[]): string[] {
  return shoppingEntries([{ title: null, ingredients: texts }], [], true).map((e) => e.text);
}

function shoppingEntries(
  sources: ShoppingSource[],
  pantry: string[],
  loose = false,
): { text: string; name: string; aisle: Aisle }[] {
  const keyOfName = loose ? looseNameKey : nameKey;
  const have = new Set(pantry.map((p) => keyOfName(ingredientParts(p).name || p)).filter(Boolean));
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
      // The bracketed metric measure wins over the cook's own, and only in
      // the loose pass: it is a second reading of the SAME line rather than a
      // conversion, so it can never be wrong in the way a density would be.
      const aside = loose ? metricAside(text) : null;
      const unit = (aside?.unit ?? p.unit)?.toLowerCase() ?? null;
      const name = loose ? bareName(p.name) : p.name.trim();
      const nk = keyOfName(name);
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
      const rawQty = aside ? qtyValue(aside.qty) : p.qty === null ? null : qtyValue(p.qty);
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
      // The shortest name of the ones that met, in the loose pass only: three
      // lines that say 'onion', 'chopped onions' and 'yellow onions, diced'
      // should leave one that says 'onion'. First-met wins everywhere else,
      // and still does here whenever the lengths tie.
      if (loose && name !== '' && name.length < prev.name.length) prev.name = name;
    }
  }
  return [...seen.values()].map((e) => {
    const text = render(e, loose);
    return { text, name: e.name, aisle: ingredientAisle(e.name, e.unit) };
  });
}

/** The name made to agree with the number in front of it — the last word
 *  only, because that is the noun: 'baby potato' pluralises to 'baby
 *  potatoes', never 'babies potato'. */
function countName(name: string, qty: number): string {
  const words = name.split(' ');
  const last = words[words.length - 1];
  if (last === undefined || last === '') return name;
  // A prep word is not a noun and has no plural: a line whose whole name is
  // one ('2 chopped' — nonsense, but it reaches here) came out '2 choppeds'.
  if (PREP_WORDS.has(last.toLowerCase())) return name;
  words[words.length - 1] = countWord(last, qty);
  return words.join(' ');
}

function render(e: Entry, loose = false): string {
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
  if (e.unit) return `${amount} ${countWord(e.unit, e.qty)} ${e.name}`.trim();
  // With no unit the NAME is what the number counts, so it is the name that
  // has to agree — and only in the loose pass, which is the only one that can
  // hand you a name from a different line than the total. '2 onions' plus '1
  // onion' kept the shorter name and read '3 onion' the first time this ran.
  // The strict pass never rewrites a name and must not start here.
  return `${amount} ${loose ? countName(e.name, e.qty) : e.name}`.trim();
}
