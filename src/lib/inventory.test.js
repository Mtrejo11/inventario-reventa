import { describe, it, expect } from 'vitest';
import { buildSellPatch, buildUnsellPatch, getDeleteArgs } from './inventory.js';

describe('buildSellPatch', () => {
  it('returns an object with exactly the keys {sold, sold_price, sold_date, sold_note}', () => {
    const patch = buildSellPatch({ price: 100, date: '2024-01-01', note: 'test note' });
    expect(Object.keys(patch).sort()).toEqual(
      ['sold', 'sold_date', 'sold_note', 'sold_price'].sort()
    );
  });

  it('sets sold to true', () => {
    const patch = buildSellPatch({ price: 50, date: '2024-06-15', note: '' });
    expect(patch.sold).toBe(true);
  });

  it('maps price to sold_price without transformation', () => {
    const patch = buildSellPatch({ price: 299.99, date: '2024-01-01', note: '' });
    expect(patch.sold_price).toBe(299.99);
  });

  it('maps date to sold_date without transformation', () => {
    const patch = buildSellPatch({ price: 0, date: '2025-12-31', note: '' });
    expect(patch.sold_date).toBe('2025-12-31');
  });

  it('maps note to sold_note without transformation', () => {
    const patch = buildSellPatch({ price: 0, date: '2024-01-01', note: 'great deal' });
    expect(patch.sold_note).toBe('great deal');
  });

  it('accepts all inputs as-is (no type coercion)', () => {
    const patch = buildSellPatch({ price: '150', date: null, note: undefined });
    expect(patch.sold_price).toBe('150');
    expect(patch.sold_date).toBeNull();
    expect(patch.sold_note).toBeUndefined();
  });
});

describe('buildUnsellPatch', () => {
  it('returns sold: false', () => {
    const patch = buildUnsellPatch();
    expect(patch.sold).toBe(false);
  });

  it('returns sold_price as null', () => {
    expect(buildUnsellPatch().sold_price).toBeNull();
  });

  it('returns sold_date as null', () => {
    expect(buildUnsellPatch().sold_date).toBeNull();
  });

  it('returns sold_note as null', () => {
    expect(buildUnsellPatch().sold_note).toBeNull();
  });

  it('returns exactly {sold, sold_price, sold_date, sold_note} with null fields', () => {
    const patch = buildUnsellPatch();
    expect(patch).toEqual({ sold: false, sold_price: null, sold_date: null, sold_note: null });
  });
});

describe('getDeleteArgs', () => {
  it('returns [item.id, item.photo_path] when both are present', () => {
    const item = { id: 42, photo_path: 'images/photo.jpg' };
    expect(getDeleteArgs(item)).toEqual([42, 'images/photo.jpg']);
  });

  it('returns [item.id, undefined] when photo_path is undefined without throwing', () => {
    const item = { id: 7 };
    expect(() => getDeleteArgs(item)).not.toThrow();
    expect(getDeleteArgs(item)).toEqual([7, undefined]);
  });

  it('returns an array of length 2', () => {
    const item = { id: 1, photo_path: 'path/to/img.png' };
    expect(getDeleteArgs(item)).toHaveLength(2);
  });
});
