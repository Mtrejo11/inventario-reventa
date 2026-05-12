/**
 * Pure business-rule builders for inventory sell/unsell/delete operations.
 * These functions return exactly the patch objects and argument lists that
 * the App handlers need — no validation, no side effects.
 */

/**
 * Build the update-patch for marking a product as sold.
 * @param {{ price: any, date: any, note: any }} param0
 * @returns {{ sold: boolean, sold_price: any, sold_date: any, sold_note: any }}
 */
export function buildSellPatch({ price, date, note }) {
  return {
    sold: true,
    sold_price: price,
    sold_date: date,
    sold_note: note,
  };
}

/**
 * Build the update-patch for reverting a sale (unsell).
 * @returns {{ sold: boolean, sold_price: null, sold_date: null, sold_note: null }}
 */
export function buildUnsellPatch() {
  return {
    sold: false,
    sold_price: null,
    sold_date: null,
    sold_note: null,
  };
}

/**
 * Return the positional arguments for deleteProduct as a tuple.
 * @param {{ id: any, photo_path: any }} item
 * @returns {[any, any]}
 */
export function getDeleteArgs(item) {
  return [item.id, item.photo_path];
}

/**
 * Whitelist of field names that may be updated when editing a product.
 * Keys not in this list are stripped by buildEditPatch.
 * @type {string[]}
 */
export const EDITABLE_FIELDS = [
  'name',
  'brand',
  'category',
  'store',
  'color',
  'size',
  'condition',
  'cost',
  'price',
  'qty',
  'notes',
  'photo_url',
  'photo_path',
  'extra_photo_urls',
  'extra_photo_paths',
];

/**
 * Build the update-patch for editing a product.
 * Only copies keys present in EDITABLE_FIELDS AND present in payload.
 * No type coercion, no validation — values are copied as-is.
 * @param {Record<string, any>} payload
 * @returns {Record<string, any>}
 */
export function buildEditPatch(payload) {
  const patch = {};
  for (const key of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      patch[key] = payload[key];
    }
  }
  return patch;
}
