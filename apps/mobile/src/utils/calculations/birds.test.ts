import { describe, expect, it } from 'vitest';

import { currentBirds } from './birds';
import { currentBirdsFixtures } from './fixtures';

describe('calculations/birds parity', () => {
  it('matches the API output for every shared fixture', () => {
    for (const { input, expected } of currentBirdsFixtures) {
      expect(currentBirds(input[0], input[1], input[2])).toBe(expected);
    }
  });

  it('subtracts mortality and sold birds', () => {
    expect(currentBirds(10000, 100, 0)).toBe(9900);
  });

  it('floors at 0', () => {
    expect(currentBirds(0, 20000, 100)).toBe(0);
  });
});