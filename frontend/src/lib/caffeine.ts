// Caffeine content in mg for common drinks.
// Keys are lowercase; lookup uses longest-substring-first matching.
// Lithuanian aliases are included alongside English names.
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

  // Lithuanian — Coffee
  ['dvigubas espreso', 126],
  ['trigubas espreso', 189],
  ['juoda kava', 95],
  ['kapučinas', 130],
  ['amerikanas', 95],
  ['espreso', 63],
  ['latė', 130],
  ['moka', 130],
  ['kava', 95],

  // Lithuanian — Tea
  ['žolelių arbata', 0],
  ['žalioji arbata', 28],
  ['juodoji arbata', 47],
  ['baltoji arbata', 15],
  ['arbata', 47],

  // Lithuanian — Other
  ['karštas šokoladas', 5],
  ['kakava', 5],
];

// Pre-sorted by descending key length so longest match wins
const SORTED_ENTRIES = [...CAFFEINE_MAP].sort(
  ([a], [b]) => b.length - a.length,
);

/**
 * Resolve estimated caffeine (mg) for a drink name using substring matching.
 * Returns 0 for unrecognised drinks.
 */
export function resolveCaffeineMg(drinkName: string): number {
  const lower = drinkName.toLowerCase();
  for (const [key, mg] of SORTED_ENTRIES) {
    if (lower.includes(key)) return mg;
  }
  return 0;
}
