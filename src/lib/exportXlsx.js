import * as XLSX from 'xlsx';

/** Ordered column keys for the inventory sheet. */
export const INVENTORY_COLUMNS = ['name', 'quantity', 'price', 'stock_status'];

/**
 * Pure function: given an array of product objects, returns an XLSX Workbook
 * with a single sheet named 'Inventario' containing the inventory data.
 *
 * Column mapping:
 *   name        ← p.name
 *   quantity    ← p.qty
 *   price       ← p.price
 *   stock_status← p.sold ? 'Vendido' : 'Disponible'
 *
 * @param {Array} products  - Array of product objects (not mutated).
 * @returns {Object}        - XLSX Workbook object.
 */
export function buildInventorySheet(products) {
  const rows = products.map((p) => ({
    name: p.name,
    quantity: p.qty,
    price: p.price,
    stock_status: p.sold ? 'Vendido' : 'Disponible',
  }));

  const sheet = XLSX.utils.json_to_sheet(rows, { header: INVENTORY_COLUMNS });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Inventario');
  return workbook;
}

/**
 * Builds an inventory workbook from products and triggers a browser download
 * of a file named 'inventario_YYYY-MM-DD.xlsx'. Does not mutate products.
 *
 * @param {Array} products - Array of product objects.
 */
export function downloadInventoryXlsx(products) {
  const workbook = buildInventorySheet(products);
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  XLSX.writeFile(workbook, `inventario_${today}.xlsx`);
}
