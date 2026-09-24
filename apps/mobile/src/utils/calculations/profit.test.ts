import { describe, expect, it } from 'vitest';

import { profitWithLabel } from './profit';

describe('calculations/profit', () => {
  it('labels profit when revenue exceeds expenses', () => {
    const result = profitWithLabel(1000, 400, 100, 200);
    expect(result.value).toBe(300);
    expect(result.label).toBe('profit');
  });

  it('labels loss when expenses exceed revenue', () => {
    const result = profitWithLabel(500, 400, 100, 200);
    expect(result.value).toBe(-200);
    expect(result.label).toBe('loss');
  });

  it('treats zero as profit', () => {
    const result = profitWithLabel(700, 400, 100, 200);
    expect(result.value).toBe(0);
    expect(result.label).toBe('profit');
  });
});
