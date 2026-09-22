import { describe, expect, it } from 'vitest';
import { BatchStatus, UserRole } from './enums.js';
describe('enums', () => {
  it('has the documented role set', () => {
    expect(Object.values(UserRole).sort()).toEqual(['ACCOUNTANT', 'MANAGER', 'OWNER', 'WORKER']);
    expect(Object.values(BatchStatus).sort()).toEqual(['ACTIVE', 'CLOSED', 'SOLD', 'UPCOMING']);
  });
});