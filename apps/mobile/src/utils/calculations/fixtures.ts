/**
 * Shared parity fixtures — identical numeric inputs to the API test suite
 * (apps/api/tests/calculations.test.ts) so the mobile mirrors must produce
 * identical numeric outputs. Cross-verified by hand against the API tests.
 */

export const currentBirdsFixtures = [
  { input: [10000, 100, 0] as const, expected: 9900 },
  { input: [0, 20000, 100] as const, expected: 0 },
] as const;

export const mortalityPercentFixtures = [
  { input: [100, 10000] as const, expected: 1 },
  { input: [50, 0] as const, expected: 0 },
] as const;

export const fcrFixtures = [
  { input: [10000, 9500, null, 10000, 0.05] as const, expected: { value: null, incomplete: true } },
  { input: [10000, 9500, 1.8, 10000, null] as const, expected: { value: null, incomplete: true } },
  { input: [10000, 9500, 1.8, 10000, 0.05] as const, expected: { value: 0.6024, incomplete: false } },
  { input: [10000, 100, 0.05, 10000, 0.05] as const, expected: { value: null, incomplete: true } },
] as const;