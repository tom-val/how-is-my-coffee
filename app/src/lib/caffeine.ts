/**
 * Caffeine content in mg for common drinks — a straight port of the old web client's table
 * (`frontend/src/lib/caffeine.ts`), Lithuanian aliases included.
 *
 * The client keeps its own copy so typing "flat white" fills in 130 mg instantly, with no round
 * trip. The server has the same table behind `POST /v1/drinks/resolve-caffeine`, which also falls
 * back to an AI estimate — the composer only asks the server when this table comes up empty.
 *
 * Keys are lowercase; lookup is longest-substring-first, so "double espresso" beats "espresso".
 */
const CAFFEINE_MAP: [string, number][] = [
  // Coffee
  ['double espresso', 126],
  ['triple espresso', 189],
  ['vietnamese coffee', 100],
  ['turkish coffee', 65],
  ['irish coffee', 70],
  ['iced coffee', 95],
  ['filter coffee', 95],
  ['drip coffee', 95],
  ['cold brew', 200],
  ['flat white', 130],
  ['cappuccino', 130],
  ['americano', 95],
  ['ristretto', 63],
  ['macchiato', 63],
  ['cortado', 63],
  ['affogato', 63],
  ['espresso', 63],
  ['lungo', 80],
  ['mocha', 130],
  ['latte', 130],
  ['decaf', 3],
  ['3in1', 50],
  ['2in1', 50],
  ['coffee', 95],

  // Tea
  ['english breakfast', 47],
  ['green tea', 28],
  ['black tea', 47],
  ['oolong tea', 38],
  ['white tea', 15],
  ['herbal tea', 0],
  ['earl grey', 47],
  ['yerba mate', 85],
  ['rooibos', 0],
  ['matcha', 70],
  ['chai', 50],
  ['tea', 47],

  // Other
  ['hot chocolate', 5],
  ['energy drink', 80],
  ['kombucha', 15],
  ['cocoa', 5],

  // Lithuanian — coffee
  ['dvigubas espreso', 126],
  ['trigubas espreso', 189],
  ['juoda kava', 95],
  ['kapucinas', 130],
  ['amerikanas', 95],
  ['espreso', 63],
  ['late', 130],
  ['moka', 130],
  ['kava', 95],

  // Lithuanian — tea
  ['zoleliu arbata', 0],
  ['zalioji arbata', 28],
  ['juodoji arbata', 47],
  ['baltoji arbata', 15],
  ['arbata', 47],

  // Lithuanian — other
  ['karstas sokoladas', 5],
  ['kakava', 5],
];

// Pre-sorted by descending key length so the longest match wins.
const SORTED_ENTRIES = [...CAFFEINE_MAP].sort(([a], [b]) => b.length - a.length);

/**
 * Lithuanian is typed with and without diacritics ("latė" / "late", "žalioji" / "zalioji"), and the
 * table is stored in the plain form, so both sides are folded before comparing. `NFD` splits a
 * letter from its accent; the range strips combining marks. Ogoneks and the caron on č/š/ž all
 * decompose, so "kapučinas" and "kapucinas" land on the same key.
 */
function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Estimated caffeine (mg) for a drink name, or 0 when nothing in the table matches — which is the
 * composer's cue to offer the server/AI estimate.
 */
export function resolveCaffeineMg(drinkName: string): number {
  const needle = fold(drinkName);
  if (!needle.trim()) return 0;
  for (const [key, mg] of SORTED_ENTRIES) {
    if (needle.includes(key)) return mg;
  }
  return 0;
}
