import { describe, it, expect } from 'vitest';
import { resolveCaffeineMg } from './caffeine.js';

describe('resolveCaffeineMg', () => {
  it('resolves an exact drink name', () => {
    expect(resolveCaffeineMg('flat white')).toBe(130);
  });

  it('is case-insensitive', () => {
    expect(resolveCaffeineMg('ESPRESSO')).toBe(63);
    expect(resolveCaffeineMg('Flat White')).toBe(130);
  });

  it('matches a substring within a longer drink name', () => {
    expect(resolveCaffeineMg('Iced Vanilla Latte')).toBe(130);
    expect(resolveCaffeineMg('Oat Milk Cappuccino')).toBe(130);
  });

  it('matches the longest key first', () => {
    // "double espresso" (126) wins over "espresso" (63)
    expect(resolveCaffeineMg('Double Espresso')).toBe(126);
    expect(resolveCaffeineMg('Iced Double Espresso')).toBe(126);
  });

  it('returns 0 for an unrecognised drink', () => {
    expect(resolveCaffeineMg('orange juice')).toBe(0);
    expect(resolveCaffeineMg('')).toBe(0);
  });

  it('resolves common drinks correctly', () => {
    expect(resolveCaffeineMg('Americano')).toBe(95);
    expect(resolveCaffeineMg('Cold Brew')).toBe(200);
    expect(resolveCaffeineMg('Cortado')).toBe(63);
    expect(resolveCaffeineMg('Mocha')).toBe(130);
    expect(resolveCaffeineMg('Chai')).toBe(50);
  });

  it('matches the more specific keyword when compound drinks overlap', () => {
    // "Matcha Latte" — "matcha" (6 chars) is longer than "latte" (5 chars), so matcha wins
    expect(resolveCaffeineMg('Matcha Latte')).toBe(70);
    // "Decaf" alone returns 3
    expect(resolveCaffeineMg('Decaf')).toBe(3);
  });
});
