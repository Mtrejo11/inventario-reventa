export const SORT_OPTIONS = [
  { key: 'newest', label: 'Más reciente' },
  { key: 'oldest', label: 'Más antiguo' },
  { key: 'price_desc', label: 'Mayor precio' },
  { key: 'price_asc', label: 'Menor precio' },
  { key: 'name_asc', label: 'Nombre A–Z' },
];

export const DEFAULT_SORT_KEY = 'newest';

const collator = new Intl.Collator('es', { sensitivity: 'base' });

/**
 * Returns a new array sorted by `key`. Never mutates `items`.
 * Items with missing/null primary sort value fall to the end.
 * Tiebreaker: created_at desc, then id.
 *
 * @param {Array} items
 * @param {string} key
 * @returns {Array}
 */
export function sortProducts(items, key) {
  const copy = [...items];

  // Helper: parse created_at as comparable number (ms). Missing → -Infinity.
  const tsOf = (item) => {
    const v = item.created_at;
    if (v == null) return -Infinity;
    const ms = Date.parse(v);
    return isNaN(ms) ? -Infinity : ms;
  };

  // Tiebreaker applied when primary keys are equal.
  const tiebreak = (a, b) => {
    // created_at desc (more recent = smaller index = comes first)
    const diff = tsOf(b) - tsOf(a);
    if (diff !== 0) return diff;
    // id as final tiebreaker (ascending, gives stable order)
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  };

  switch (key) {
    case 'newest':
      copy.sort((a, b) => {
        const ta = tsOf(a);
        const tb = tsOf(b);
        // items without created_at fall to the end
        const aNull = ta === -Infinity;
        const bNull = tb === -Infinity;
        if (aNull && bNull) return tiebreak(a, b);
        if (aNull) return 1;
        if (bNull) return -1;
        const diff = tb - ta;
        return diff !== 0 ? diff : tiebreak(a, b);
      });
      break;

    case 'oldest':
      copy.sort((a, b) => {
        const ta = tsOf(a);
        const tb = tsOf(b);
        const aNull = ta === -Infinity;
        const bNull = tb === -Infinity;
        if (aNull && bNull) return tiebreak(a, b);
        if (aNull) return 1;
        if (bNull) return -1;
        const diff = ta - tb;
        return diff !== 0 ? diff : tiebreak(a, b);
      });
      break;

    case 'price_desc':
      copy.sort((a, b) => {
        const pa = a.price == null ? null : Number(a.price);
        const pb = b.price == null ? null : Number(b.price);
        const aNull = pa == null || isNaN(pa);
        const bNull = pb == null || isNaN(pb);
        if (aNull && bNull) return tiebreak(a, b);
        if (aNull) return 1;
        if (bNull) return -1;
        const diff = pb - pa;
        return diff !== 0 ? diff : tiebreak(a, b);
      });
      break;

    case 'price_asc':
      copy.sort((a, b) => {
        const pa = a.price == null ? null : Number(a.price);
        const pb = b.price == null ? null : Number(b.price);
        const aNull = pa == null || isNaN(pa);
        const bNull = pb == null || isNaN(pb);
        if (aNull && bNull) return tiebreak(a, b);
        if (aNull) return 1;
        if (bNull) return -1;
        const diff = pa - pb;
        return diff !== 0 ? diff : tiebreak(a, b);
      });
      break;

    case 'name_asc':
      copy.sort((a, b) => {
        const na = a.name == null ? null : String(a.name);
        const nb = b.name == null ? null : String(b.name);
        const aNull = na == null;
        const bNull = nb == null;
        if (aNull && bNull) return tiebreak(a, b);
        if (aNull) return 1;
        if (bNull) return -1;
        const cmp = collator.compare(na, nb);
        return cmp !== 0 ? cmp : tiebreak(a, b);
      });
      break;

    default:
      // Unknown key: return copy without reordering
      break;
  }

  return copy;
}
