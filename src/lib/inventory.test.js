import { describe, it, expect } from 'vitest';
import { buildSellPatch, buildUnsellPatch, getDeleteArgs, buildEditPatch, EDITABLE_FIELDS } from './inventory.js';

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

describe('buildEditPatch', () => {
  const ALL_EDITABLE = [
    'name', 'brand', 'category', 'store', 'color', 'size', 'condition',
    'cost', 'price', 'qty', 'notes', 'photo_url', 'photo_path',
    'extra_photo_urls', 'extra_photo_paths',
  ];

  it('EDITABLE_FIELDS has exactly 15 entries with the correct names in order', () => {
    expect(EDITABLE_FIELDS).toHaveLength(15);
    expect(EDITABLE_FIELDS).toEqual(ALL_EDITABLE);
  });

  it('EDITABLE_FIELDS does not include sold, sold_price, sold_date, sold_note, id, or created_at', () => {
    const forbidden = ['sold', 'sold_price', 'sold_date', 'sold_note', 'id', 'created_at'];
    expect(forbidden.every(k => !EDITABLE_FIELDS.includes(k))).toBe(true);
  });

  it('returns all editable fields when all are present in payload', () => {
    const payload = {
      name: 'Shirt', brand: 'Nike', category: 'Clothing', store: 'eBay',
      color: 'Red', size: 'M', condition: 'New', cost: 10, price: 20,
      qty: 5, notes: 'nice', photo_url: 'http://a.com/p.jpg',
      photo_path: 'photos/p.jpg', extra_photo_urls: [], extra_photo_paths: [],
    };
    const patch = buildEditPatch(payload);
    expect(Object.keys(patch).sort()).toEqual(ALL_EDITABLE.slice().sort());
  });

  it('returns only the present editable fields for a partial payload', () => {
    const patch = buildEditPatch({ name: 'X' });
    expect(patch).toEqual({ name: 'X' });
  });

  it('filters out non-whitelisted fields like sold', () => {
    const patch = buildEditPatch({ name: 'A', sold: true });
    expect(patch).toEqual({ name: 'A' });
    expect(Object.prototype.hasOwnProperty.call(patch, 'sold')).toBe(false);
  });

  it('returns {} for an empty payload', () => {
    expect(buildEditPatch({})).toEqual({});
  });

  it('returns a new object reference, not the same as payload', () => {
    const payload = { name: 'B' };
    const patch = buildEditPatch(payload);
    expect(patch).not.toBe(payload);
  });

  it('does not mutate the input payload', () => {
    const payload = { name: 'C', sold: true };
    const keysBefore = Object.keys(payload).slice();
    const valuesBefore = { ...payload };
    buildEditPatch(payload);
    expect(Object.keys(payload)).toEqual(keysBefore);
    expect(payload).toEqual(valuesBefore);
  });

  it('copies values without transformation (string cost stays string)', () => {
    const patch = buildEditPatch({ cost: '50', price: '100' });
    expect(patch.cost).toBe('50');
    expect(patch.price).toBe('100');
  });
});

