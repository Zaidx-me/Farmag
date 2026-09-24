import { describe, expect, it } from 'vitest';

import { feedClosingStock } from './feed';

describe('calculations/feed', () => {
  it('computes closing stock with purchases and consumption', () => {
    expect(feedClosingStock(100, 50, 30, 0)).toBe(120);
  });

  it('floors at 0', () => {
    expect(feedClosingStock(10, 0, 20, 0)).toBe(0);
  });

  it('accounts for transferred feed (net in)', () => {
    expect(feedClosingStock(100, 0, 30, 20)).toBe(90);
  });

  it('accounts for transferred feed (net out)', () => {
    expect(feedClosingStock(100, 0, 30, -40)).toBe(30);
  });
});
