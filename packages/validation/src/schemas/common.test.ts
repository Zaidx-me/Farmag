import { describe, expect, it } from 'vitest';
import { moneySchema, uuidSchema } from './common.js';
describe('common schemas', () => {
  it('accepts 2dp money and rejects 3dp', () => {
    expect(moneySchema.safeParse('123.45').success).toBe(true);
    expect(moneySchema.safeParse('123.456').success).toBe(false);
  });
  it('rejects negative money', () => {
    expect(moneySchema.safeParse('-5').success).toBe(false);
  });
  it('rejects invalid uuid', () => {
    expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});
