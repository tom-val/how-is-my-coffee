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

  it('resolves new coffee types', () => {
    expect(resolveCaffeineMg('Ristretto')).toBe(63);
    expect(resolveCaffeineMg('Lungo')).toBe(80);
    expect(resolveCaffeineMg('Affogato')).toBe(63);
    expect(resolveCaffeineMg('Irish Coffee')).toBe(70);
    expect(resolveCaffeineMg('Iced Coffee')).toBe(95);
    expect(resolveCaffeineMg('Vietnamese Coffee')).toBe(100);
    expect(resolveCaffeineMg('Turkish Coffee')).toBe(65);
  });

  it('resolves tea types', () => {
    expect(resolveCaffeineMg('Green Tea')).toBe(28);
    expect(resolveCaffeineMg('Black Tea')).toBe(47);
    expect(resolveCaffeineMg('Oolong Tea')).toBe(38);
    expect(resolveCaffeineMg('White Tea')).toBe(15);
    expect(resolveCaffeineMg('Herbal Tea')).toBe(0);
    expect(resolveCaffeineMg('Earl Grey')).toBe(47);
    expect(resolveCaffeineMg('English Breakfast')).toBe(47);
    expect(resolveCaffeineMg('Yerba Mate')).toBe(85);
    expect(resolveCaffeineMg('Rooibos')).toBe(0);
  });

  it('resolves instant coffee sachets', () => {
    expect(resolveCaffeineMg('3in1')).toBe(50);
    expect(resolveCaffeineMg('2in1')).toBe(50);
  });

  it('resolves other drink types', () => {
    expect(resolveCaffeineMg('Energy Drink')).toBe(80);
    expect(resolveCaffeineMg('Kombucha')).toBe(15);
    expect(resolveCaffeineMg('Cocoa')).toBe(5);
  });

  it('resolves Lithuanian coffee aliases', () => {
    expect(resolveCaffeineMg('kapučinas')).toBe(130);
    expect(resolveCaffeineMg('amerikanas')).toBe(95);
    expect(resolveCaffeineMg('espreso')).toBe(63);
    expect(resolveCaffeineMg('latė')).toBe(130);
    expect(resolveCaffeineMg('kava')).toBe(95);
    expect(resolveCaffeineMg('dvigubas espreso')).toBe(126);
    expect(resolveCaffeineMg('trigubas espreso')).toBe(189);
    expect(resolveCaffeineMg('juoda kava')).toBe(95);
  });

  it('resolves Lithuanian tea aliases', () => {
    expect(resolveCaffeineMg('arbata')).toBe(47);
    expect(resolveCaffeineMg('žalioji arbata')).toBe(28);
    expect(resolveCaffeineMg('juodoji arbata')).toBe(47);
    expect(resolveCaffeineMg('baltoji arbata')).toBe(15);
    expect(resolveCaffeineMg('žolelių arbata')).toBe(0);
  });

  it('resolves Lithuanian other aliases', () => {
    expect(resolveCaffeineMg('karštas šokoladas')).toBe(5);
    expect(resolveCaffeineMg('kakava')).toBe(5);
  });

  it('matches Lithuanian substrings within longer drink names', () => {
    expect(resolveCaffeineMg('Ledinis kapučinas')).toBe(130);
    expect(resolveCaffeineMg('Šalta kava')).toBe(95);
  });

  it('picks the more specific Lithuanian keyword when compound names overlap', () => {
    // "žalioji arbata" (14 chars) wins over "arbata" (6 chars)
    expect(resolveCaffeineMg('žalioji arbata')).toBe(28);
    // "dvigubas espreso" (16 chars) wins over "espreso" (7 chars)
    expect(resolveCaffeineMg('dvigubas espreso')).toBe(126);
  });
});
