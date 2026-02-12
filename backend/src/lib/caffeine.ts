// Caffeine content in mg for common coffee drinks.
// Keys are lowercase; lookup uses longest-substring-first matching.
const CAFFEINE_MAP: [string, number][] = [
  ['double espresso', 126],
  ['triple espresso', 189],
  ['cold brew', 200],
  ['drip coffee', 95],
  ['filter coffee', 95],
  ['flat white', 130],
  ['cappuccino', 130],
  ['americano', 95],
  ['cortado', 63],
  ['macchiato', 63],
  ['espresso', 63],
  ['mocha', 130],
  ['latte', 130],
  ['matcha', 70],
  ['chai', 50],
  ['decaf', 3],
  ['hot chocolate', 5],
  ['tea', 47],
  ['coffee', 95],
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
