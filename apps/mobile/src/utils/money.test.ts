import { describe, expect, it } from 'vitest';

import { sanitizeMoneyInput } from './money';

describe('sanitizeMoneyInput', () => {
  it('keeps valid money strings unchanged', () => {
    expect(sanitizeMoneyInput('100')).toBe('100');
    expect(sanitizeMoneyInput('12.5')).toBe('12.5');
    expect(sanitizeMoneyInput('0.25')).toBe('0.25');
  });

  it('caps the fraction at 2dp', () => {
    expect(sanitizeMoneyInput('12.345')).toBe('12.34');
    expect(sanitizeMoneyInput('0.999')).toBe('0.99');
  });

  it('keeps only the first dot', () => {
    expect(sanitizeMoneyInput('1.2.3')).toBe('1.23');
    expect(sanitizeMoneyInput('1..5')).toBe('1.5');
  });

  it('strips non-numeric characters', () => {
    expect(sanitizeMoneyInput('abc12.5x')).toBe('12.5');
    expect(sanitizeMoneyInput('$1,000.50')).toBe('1000.50');
    expect(sanitizeMoneyInput('')).toBe('');
  });
});