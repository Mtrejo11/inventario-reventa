/**
 * Pure client-side predicates for flagging inventory items that need attention.
 * No side effects, no Supabase dependencies.
 */

/** Items with fewer than this many units (but > 0) are considered low-stock. */
export const LOW_STOCK_THRESHOLD = 3;

/** Listings older than this many days (unsold) are considered stale. */
export const STALE_DAYS = 30;

/**
 * Returns true if the listing is stale (unsold and created more than staleDays ago).
 *
 * @param {string|null|undefined} createdAt - ISO date string (e.g. item.created_at)
 * @param {number} staleDays - number of days after which a listing is stale
 * @param {number} [now] - timestamp to use as "now" (injectable for tests); defaults to Date.now()
 * @returns {boolean}
 */
export function isStaleListing(createdAt, staleDays, now = Date.now()) {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (isNaN(created)) return false;
  const ageMs = now - created;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays > staleDays;
}

/**
 * Returns true if the item needs attention:
 * - Not sold AND
 *   - (qty > 0 AND qty < LOW_STOCK_THRESHOLD)  ← low stock
 *   - OR listing is stale (created_at > STALE_DAYS ago)
 *
 * qty === 0 is treated as "not low stock" (empty rows shouldn't be false-flagged).
 * Missing created_at means stale check returns false.
 *
 * @param {object} item - inventory item
 * @param {object} [thresholds] - optional overrides: { lowStock, staleDays }
 * @param {number} [now] - timestamp for "now" (injectable for tests)
 * @returns {boolean}
 */
export function needsAttention(item, thresholds = {}, now = Date.now()) {
  if (!item || item.sold) return false;

  const lowStockThreshold = thresholds.lowStock ?? LOW_STOCK_THRESHOLD;
  const staleDays = thresholds.staleDays ?? STALE_DAYS;

  const qty = Number(item.qty ?? 0);
  const isLowStock = qty > 0 && qty < lowStockThreshold;
  const isStale = isStaleListing(item.created_at, staleDays, now);

  return isLowStock || isStale;
}
