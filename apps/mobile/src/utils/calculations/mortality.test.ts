import { describe, expect, it } from 'vitest';

import { mortalityPercentFixtures } from './fixtures';
import { mortalityPercent } from './mortality';

describe('calculations/mortality parity', () => {
  it('matches the API output for every shared fixture', () => {
    for (const { input, expected } of mortalityPercentFixtures) {
      expect(mortalityPercent(input[0], input[1])).toBe(expected);
    }
  });

  it('computes percentage', () => {
    expect(mortalityPercent(100, 10000)).toBe(1);
  });

  it('guards against division by zero', () => {
    expect(mortalityPercent(50, 0)).toBe(0);
  });
});