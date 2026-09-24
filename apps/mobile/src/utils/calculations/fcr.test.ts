import { describe, expect, it } from 'vitest';

import { fcr } from './fcr';
import { fcrFixtures } from './fixtures';

describe('calculations/fcr parity', () => {
  it('matches the API output for every shared fixture', () => {
    for (const { input, expected } of fcrFixtures) {
      expect(fcr(input[0], input[1], input[2], input[3], input[4])).toEqual(expected);
    }
  });

  it('returns incomplete when a weight is missing', () => {
    expect(fcr(10000, 9500, null, 10000, 0.05)).toEqual({ value: null, incomplete: true });
    expect(fcr(10000, 9500, 1.8, 10000, null)).toEqual({ value: null, incomplete: true });
  });

  it('computes the happy-path ratio rounded to 4dp', () => {
    expect(fcr(10000, 9500, 1.8, 10000, 0.05)).toEqual({ value: 0.6024, incomplete: false });
  });

  it('guards against non-positive gain', () => {
    expect(fcr(10000, 100, 0.05, 10000, 0.05)).toEqual({ value: null, incomplete: true });
  });
});
