import { describe, expect, it } from 'vitest';
import { shoppingLines, shoppingRows } from '../src/shopping';

const r = (title: string, ingredients: string[]) => ({ title, ingredients });

describe('a shopping list out of chosen recipes', () => {
  it('adds up the same thing in the same unit, in millilitres', () => {
    // 5 cups → 1182.94 ml → over a litre, so it reads as litres. Sean, 2026-08-22:
    // "sum the total amount needed to purchase in a consistent unit by type...
    // grams/ml if possible".
    //
    // Whole millilitres above 10, two decimals below: nobody buys 236.59 ml of
    // sugar, and nobody can measure 1.23 ml as "1 ml". The precision belongs
    // where the amount is small enough for it to mean something.
    expect(shoppingLines([
      r('Cake', ['2 cups flour', '1 cup sugar']),
      r('Bread', ['3 cups flour']),
    ])).toEqual(['1.18 l flour', '237 ml sugar']);
  });

  it('converts within a dimension rather than repeating itself', () => {
    // This is the case the old rule got wrong. A cup is 236.588 ml BY
    // DEFINITION — no density, no guess — so cups and tablespoons of the same
    // thing are one line.
    expect(shoppingLines([
      r('a', ['1 cup butter']),
      r('b', ['2 tbsp butter']),
    ])).toEqual(['266 ml butter']);
  });

  it('still refuses to convert ACROSS dimensions', () => {
    // Volume to mass needs a density, which differs per ingredient. Two lines
    // is a thing a person reconciles in a second; a wrong single line is not.
    expect(shoppingLines([
      r('a', ['1 cup flour']),
      r('b', ['200 g flour']),
    ])).toEqual(['237 ml flour', '200 g flour']);
  });

  it('adds mass in grams and steps up to kilograms', () => {
    expect(shoppingLines([r('a', ['1 lb beef']), r('b', ['8 oz beef'])])).toEqual(['680 g beef']);
    expect(shoppingLines([r('a', ['2 kg flour']), r('b', ['500 g flour'])])).toEqual(['2.5 kg flour']);
  });

  it('keeps a small amount readable rather than rounding it to nothing', () => {
    // ¼ tsp is 1.23 ml. Rounded to a whole millilitre it would read as 1, and
    // at the bottom of the scale that is a 20% error on a measurement.
    expect(shoppingLines([r('a', ['1/4 tsp salt'])])).toEqual(['1.23 ml salt']);
  });

  it('counts unitless things without pretending they have a measure', () => {
    expect(shoppingLines([r('a', ['2 large eggs']), r('b', ['3 large eggs'])])).toEqual(['5 large eggs']);
  });

  it('leaves a unit it does not measure alone, and says cloves at more than one', () => {
    expect(shoppingLines([r('a', ['1 clove garlic']), r('b', ['3 cloves garlic'])])).toEqual(['4 cloves garlic']);
    expect(shoppingLines([r('a', ['2 cans tomatoes'])])).toEqual(['2 cans tomatoes']);
  });

  it('collapses a repeated ingredient that carries no quantity', () => {
    expect(shoppingLines([
      r('a', ['salt to taste']),
      r('b', ['salt to taste']),
    ])).toEqual(['salt to taste']);
  });

  it('drops the cook’s subheaders — they are not things to buy', () => {
    expect(shoppingLines([r('a', ['For the béchamel:', '2 cups milk'])])).toEqual(['473 ml milk']);
  });

  it('leaves a RANGE alone rather than putting a number on it nobody wrote', () => {
    const out = shoppingLines([r('a', ['2-3 cloves garlic']), r('b', ['4 cloves garlic'])]);
    expect(out).toEqual(['2-3 cloves garlic']);
  });

  it('a range poisons the sum whichever side it arrives on', () => {
    // The first line parses and the second does not. Before, the second was
    // simply skipped and the list claimed 4 — a number smaller than the truth,
    // stated with confidence.
    expect(shoppingLines([r('a', ['4 cloves garlic']), r('b', ['2-3 cloves garlic'])]))
      .toEqual(['4 cloves garlic']);
  });

  it('keeps the order the recipes were picked in', () => {
    expect(shoppingLines([
      r('a', ['1 onion', '1 cup rice']),
      r('b', ['1 lemon']),
    ])).toEqual(['1 onion', '237 ml rice', '1 lemon']);
  });

  it('is empty for nothing, and for a recipe with no ingredients', () => {
    expect(shoppingLines([])).toEqual([]);
    expect(shoppingLines([r('a', [])])).toEqual([]);
    expect(shoppingLines([r('a', ['   '])])).toEqual([]);
  });
});

describe('the big US volumes', () => {
  it('adds gallons, quarts and pints like any other volume', () => {
    // Found the first time Sean's Cheese card reached the list: '½ gal whole
    // milk' and '1 gal whole milk' had no unit between them, so 'gal' stayed
    // part of the NAME and the row read '1 ½ gal whole milk'.
    expect(shoppingLines([r('a', ['1/2 gal whole milk']), r('b', ['1 gal whole milk'])]))
      .toEqual(['5.68 l whole milk']);
    expect(shoppingLines([r('a', ['1 qt heavy cream'])])).toEqual(['946 ml heavy cream']);
    expect(shoppingLines([r('a', ['1 pt cream']), r('b', ['1 cup cream'])])).toEqual(['710 ml cream']);
  });

  it('a quart and four cups are the same quart', () => {
    expect(shoppingLines([r('a', ['1 qt stock']), r('b', ['4 cups stock'])])).toEqual(['1.89 l stock']);
  });
});

describe('the pantry', () => {
  it('leaves out what is already on hand', () => {
    // Sean, 2026-08-22: "if something is on the pantry already, skip adding to
    // shopping cart". Left OUT, not struck through — a list you have to read
    // past is the thing it was meant to save you from.
    expect(shoppingLines([r('a', ['2 cups flour', '3 eggs', '1 tsp salt'])], ['flour', 'salt']))
      .toEqual(['3 eggs']);
  });

  it('matches on the ingredient NAME, however the pantry row was written', () => {
    expect(shoppingLines([r('a', ['2 cups flour'])], ['1 kg flour'])).toEqual([]);
    expect(shoppingLines([r('a', ['2 cups Flour'])], ['flour'])).toEqual([]);
  });

  it('does not match a different thing that merely contains the word', () => {
    expect(shoppingLines([r('a', ['2 cups almond flour'])], ['flour']))
      .toEqual(['473 ml almond flour']);
  });

  it('an empty pantry changes nothing', () => {
    expect(shoppingLines([r('a', ['3 eggs'])], [])).toEqual(['3 eggs']);
  });
});

describe('rows carry the aisle to shop them in', () => {
  it('files each line where it is found in the shop', () => {
    const rows = shoppingRows([r('a', ['3 eggs', '1 onion', '1 lb beef', '2 cups flour'])]);
    expect(rows.map((x) => x.aisle)).toEqual(['Dairy & Eggs', 'Produce', 'Meat & Seafood', 'Dry Goods']);
  });

  it('files by the ingredient, never by the measure it was counted in', () => {
    // '3 cloves garlic' is Produce. The clove that is a spice is a different
    // word wearing the same spelling, and filing by the unit put garlic in
    // the spice rack.
    const rows = shoppingRows([r('a', ['3 cloves garlic', '2 cans tomatoes'])]);
    expect(rows.map((x) => x.aisle)).toEqual(['Produce', 'Cans & Jars']);
  });
});
