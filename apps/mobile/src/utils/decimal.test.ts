import { describe, expect, it } from 'vitest';

import {
  addDecimalStrings,
  compareDecimalStrings,
  subtractDecimalStrings,
} from './decimal';

describe('decimal-string arithmetic', () => {
  it('addDecimalStrings sums without float error', () => {
    expect(addDecimalStrings('0.1', '0.2')).toBe('0.3');
    expect(addDecimalStrings('1.5', '2.25')).toBe('3.75');
    expect(addDecimalStrings('10', '5')).toBe('15');
  });

  it('addDecimalStrings strips trailing zeros', () => {
    expect(addDecimalStrings('1.50', '2.50')).toBe('4');
    expect(addDecimalStrings('0.5', '0.25')).toBe('0.75');
  });

  it('subtractDecimalStrings subtracts exactly', () => {
    expect(subtractDecimalStrings('5', '3')).toBe('2');
    expect(subtractDecimalStrings('0.5', '0.25')).toBe('0.25');
  });

  it('subtractDecimalStrings floors at 0', () => {
    expect(subtractDecimalStrings('3', '5')).toBe('0');
    expect(subtractDecimalStrings('0.1', '0.2')).toBe('0');
  });

  it('compareDecimalStrings compares numerically, ignoring scale', () => {
    expect(compareDecimalStrings('1.5', '1.50')).toBe(0);
    expect(compareDecimalStrings('2', '1.999')).toBe(1);
    expect(compareDecimalStrings('0.1', '0.2')).toBe(-1);
    expect(compareDecimalStrings('0', '0.00')).toBe(0);
  });
});