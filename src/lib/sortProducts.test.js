import { describe, it, expect } from 'vitest';
import { sortProducts, SORT_OPTIONS, DEFAULT_SORT_KEY } from './sortProducts.js';

// Synthetic product data
const products = [
  { id: 1, name: 'Zapatos', price: 500,  created_at: '2024-01-10T00:00:00Z' },
  { id: 2, name: 'Árbol',   price: 200,  created_at: '2024-03-01T00:00:00Z' },
  { id: 3, name: 'camisa',  price: 350,  created_at: '2023-06-15T00:00:00Z' },
  { id: 4, name: 'árbol',   price: 200,  created_at: '2024-01-05T00:00:00Z' },
];

describe('SORT_OPTIONS and DEFAULT_SORT_KEY', () => {
  it('exports 5 sort options each with key and label', () => {
    expect(SORT_OPTIONS).toHaveLength(5);
    for (const opt of SORT_OPTIONS) {
      expect(opt).toHaveProperty('key');
      expect(opt).toHaveProperty('label');
    }
  });

  it('DEFAULT_SORT_KEY is "newest"', () => {
    expect(DEFAULT_SORT_KEY).toBe('newest');
  });
});

describe('sortProducts – newest', () => {
  it('orders by created_at descending', () => {
    const result = sortProducts(products, 'newest');
    const dates = result.map(p => p.created_at);
    expect(dates).toEqual([
      '2024-03-01T00:00:00Z',
      '2024-01-10T00:00:00Z',
      '2024-01-05T00:00:00Z',
      '2023-06-15T00:00:00Z',
    ]);
  });
});

describe('sortProducts – oldest', () => {
  it('orders by created_at ascending', () => {
    const result = sortProducts(products, 'oldest');
    const dates = result.map(p => p.created_at);
    expect(dates).toEqual([
      '2023-06-15T00:00:00Z',
      '2024-01-05T00:00:00Z',
      '2024-01-10T00:00:00Z',
      '2024-03-01T00:00:00Z',
    ]);
  });
});

describe('sortProducts – price_desc', () => {
  it('orders by price descending', () => {
    const result = sortProducts(products, 'price_desc');
    const prices = result.map(p => p.price);
    expect(prices[0]).toBe(500);
    expect(prices[1]).toBe(350);
    // The two 200-price items come last
    expect(prices[2]).toBe(200);
    expect(prices[3]).toBe(200);
  });
});

describe('sortProducts – price_asc', () => {
  it('orders by price ascending', () => {
    const result = sortProducts(products, 'price_asc');
    const prices = result.map(p => p.price);
    expect(prices[0]).toBe(200);
    expect(prices[1]).toBe(200);
    expect(prices[2]).toBe(350);
    expect(prices[3]).toBe(500);
  });
});

describe('sortProducts – name_asc', () => {
  it('orders alphabetically by name in Spanish (accent-insensitive)', () => {
    const result = sortProducts(products, 'name_asc');
    const names = result.map(p => p.name);
    // 'árbol' and 'Árbol' should come before 'camisa' before 'Zapatos'
    expect(names[0].toLowerCase()).toBe('árbol');
    expect(names[1].toLowerCase()).toBe('árbol');
    expect(names[2]).toBe('camisa');
    expect(names[3]).toBe('Zapatos');
  });
});

describe('sortProducts – immutability', () => {
  it('does not mutate the input array', () => {
    const original = [...products];
    const originalIds = products.map(p => p.id);
    sortProducts(products, 'price_asc');
    expect(products.map(p => p.id)).toEqual(originalIds);
    expect(products).toHaveLength(original.length);
  });
});

describe('sortProducts – missing / null values', () => {
  const withMissing = [
    { id: 10, name: 'Alpha', price: 100,       created_at: '2024-05-01T00:00:00Z' },
    { id: 11, name: 'Beta',  price: null,       created_at: '2024-04-01T00:00:00Z' },
    { id: 12, name: 'Gamma', price: undefined,  created_at: null },
    { id: 13, name: 'Delta', price: 50,         created_at: '2024-06-01T00:00:00Z' },
  ];

  it('price_asc puts null/undefined price items at the end', () => {
    const result = sortProducts(withMissing, 'price_asc');
    // First two should have actual prices
    expect(result[0].price).toBe(50);
    expect(result[1].price).toBe(100);
    // null/undefined at the end
    expect(result[2].price == null || result[2].price === undefined).toBe(true);
    expect(result[3].price == null || result[3].price === undefined).toBe(true);
  });

  it('newest puts null created_at items at the end', () => {
    const result = sortProducts(withMissing, 'newest');
    // Last item should be the one with null created_at
    expect(result[result.length - 1].created_at).toBeNull();
  });

  it('oldest puts null created_at items at the end', () => {
    const result = sortProducts(withMissing, 'oldest');
    expect(result[result.length - 1].created_at).toBeNull();
  });
});

describe('sortProducts – tiebreaker stability (price tie)', () => {
  it('when prices are equal, sorts by created_at desc as secondary key', () => {
    const tied = [
      { id: 20, name: 'X', price: 100, created_at: '2024-01-01T00:00:00Z' },
      { id: 21, name: 'Y', price: 100, created_at: '2024-06-01T00:00:00Z' },
      { id: 22, name: 'Z', price: 100, created_at: '2023-12-01T00:00:00Z' },
    ];
    const result = sortProducts(tied, 'price_asc');
    // All prices equal; tiebreak by created_at desc → newest first
    expect(result[0].id).toBe(21); // 2024-06-01 most recent
    expect(result[1].id).toBe(20); // 2024-01-01
    expect(result[2].id).toBe(22); // 2023-12-01 oldest
  });
});

describe('sortProducts – unknown key', () => {
  it('returns a copy without reordering', () => {
    const input = [...products];
    const result = sortProducts(input, 'unknown_key');
    // Same elements in same order, but a different array reference
    expect(result).not.toBe(input);
    expect(result.map(p => p.id)).toEqual(input.map(p => p.id));
  });
});
