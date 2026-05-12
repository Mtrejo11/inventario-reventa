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
