import { describe, it, expect } from 'vitest';
import { LOW_STOCK_THRESHOLD, STALE_DAYS, isStaleListing, needsAttention } from './needsAttention.js';

// Fixed "now" for deterministic tests: 2024-06-15T00:00:00.000Z
const NOW = new Date('2024-06-15T00:00:00.000Z').getTime();

// Helper to build a date that is `days` days before NOW
const daysAgo = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

describe('needsAttention constants', () => {
  it('exports LOW_STOCK_THRESHOLD as 3', () => {
    expect(LOW_STOCK_THRESHOLD).toBe(3);
  });
  it('exports STALE_DAYS as 30', () => {
    expect(STALE_DAYS).toBe(30);
  });
});

describe('isStaleListing', () => {
  it('returns false for missing createdAt', () => {
    expect(isStaleListing(null, 30, NOW)).toBe(false);
    expect(isStaleListing(undefined, 30, NOW)).toBe(false);
    expect(isStaleListing('', 30, NOW)).toBe(false);
  });

  it('returns false for an invalid date string', () => {
    expect(isStaleListing('not-a-date', 30, NOW)).toBe(false);
  });

  it('returns false when age equals staleDays exactly (boundary: not stale)', () => {
    expect(isStaleListing(daysAgo(30), 30, NOW)).toBe(false);
  });

  it('returns true when age is one day beyond staleDays boundary (age=31d flagged)', () => {
    expect(isStaleListing(daysAgo(31), 30, NOW)).toBe(true);
  });

  it('returns false for a recent listing (1 day old)', () => {
    expect(isStaleListing(daysAgo(1), 30, NOW)).toBe(false);
  });
});

describe('needsAttention', () => {
  it('returns false for a sold item regardless of qty and age', () => {
    const item = { sold: true, qty: 1, created_at: daysAgo(60) };
    expect(needsAttention(item, {}, NOW)).toBe(false);
  });

  it('returns false for a sold item with low qty', () => {
    const item = { sold: true, qty: 1, created_at: daysAgo(5) };
    expect(needsAttention(item, {}, NOW)).toBe(false);
  });

  it('flags low stock only (qty=1, fresh listing)', () => {
    const item = { sold: false, qty: 1, created_at: daysAgo(5) };
    expect(needsAttention(item, {}, NOW)).toBe(true);
  });

  it('flags stale listing only (qty=0, old)', () => {
    // qty=0 is not low stock; but listing is stale
    const item = { sold: false, qty: 0, created_at: daysAgo(45) };
    expect(needsAttention(item, {}, NOW)).toBe(true);
  });

  it('flags item that is both low stock and stale', () => {
    const item = { sold: false, qty: 2, created_at: daysAgo(45) };
    expect(needsAttention(item, {}, NOW)).toBe(true);
  });

  it('returns false when neither low stock nor stale', () => {
    const item = { sold: false, qty: 10, created_at: daysAgo(5) };
    expect(needsAttention(item, {}, NOW)).toBe(false);
  });

  it('does NOT flag qty=0 as low stock (treats 0 as not low stock)', () => {
    // qty=0, fresh listing → stale=false, low=false
    const item = { sold: false, qty: 0, created_at: daysAgo(5) };
    expect(needsAttention(item, {}, NOW)).toBe(false);
  });

  it('does NOT flag when qty equals LOW_STOCK_THRESHOLD exactly (boundary: qty=3 NOT flagged)', () => {
    const item = { sold: false, qty: 3, created_at: daysAgo(5) };
    expect(needsAttention(item, {}, NOW)).toBe(false);
  });

  it('flags when qty is one below threshold (qty=2)', () => {
    const item = { sold: false, qty: 2, created_at: daysAgo(5) };
    expect(needsAttention(item, {}, NOW)).toBe(true);
  });

  it('handles missing qty (treated as 0 → not low stock)', () => {
    const item = { sold: false, created_at: daysAgo(5) };
    expect(needsAttention(item, {}, NOW)).toBe(false);
  });

  it('handles null qty (treated as 0 → not low stock)', () => {
    const item = { sold: false, qty: null, created_at: daysAgo(5) };
    expect(needsAttention(item, {}, NOW)).toBe(false);
  });

  it('handles missing created_at (stale check returns false)', () => {
    // qty=10 (not low), no created_at → not stale → false
    const item = { sold: false, qty: 10 };
    expect(needsAttention(item, {}, NOW)).toBe(false);
    // low stock item, missing created_at → only low-stock check applies
    const itemLow = { sold: false, qty: 1 };
    expect(needsAttention(itemLow, {}, NOW)).toBe(true);
  });

  it('respects custom lowStock threshold override', () => {
    // With threshold=6, qty=4 should be flagged; with default (3) it would not
    const item = { sold: false, qty: 4, created_at: daysAgo(5) };
    expect(needsAttention(item, { lowStock: 6 }, NOW)).toBe(true);
    expect(needsAttention(item, { lowStock: 3 }, NOW)).toBe(false);
  });

  it('respects custom staleDays threshold override', () => {
    // 20 days old → not stale with default (30), stale with custom (10)
    const item = { sold: false, qty: 10, created_at: daysAgo(20) };
    expect(needsAttention(item, { staleDays: 10 }, NOW)).toBe(true);
    expect(needsAttention(item, { staleDays: 30 }, NOW)).toBe(false);
  });

  it('returns false for a null/undefined item', () => {
    expect(needsAttention(null, {}, NOW)).toBe(false);
    expect(needsAttention(undefined, {}, NOW)).toBe(false);
  });

  it('age=30d exactly is NOT stale (boundary)', () => {
    const item = { sold: false, qty: 10, created_at: daysAgo(30) };
    expect(needsAttention(item, {}, NOW)).toBe(false);
  });

  it('age=31d IS stale (boundary + 1)', () => {
    const item = { sold: false, qty: 10, created_at: daysAgo(31) };
    expect(needsAttention(item, {}, NOW)).toBe(true);
  });
});
