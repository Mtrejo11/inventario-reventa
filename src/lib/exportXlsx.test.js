import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { INVENTORY_COLUMNS, buildInventorySheet } from './exportXlsx.js';

describe('INVENTORY_COLUMNS', () => {
  it('has the four required column keys in correct order', () => {
    expect(INVENTORY_COLUMNS).toEqual(['name', 'quantity', 'price', 'stock_status']);
  });
});

describe('buildInventorySheet', () => {
  const sampleProducts = [
    { name: 'Producto A', qty: 3, price: 150, sold: false },
    { name: 'Producto B', qty: 1, price: 200, sold: true },
  ];

  it('returns a workbook with exactly one sheet named Inventario', () => {
    const wb = buildInventorySheet(sampleProducts);
    expect(wb.SheetNames).toHaveLength(1);
    expect(wb.SheetNames[0]).toBe('Inventario');
  });

  it('sheet headers match INVENTORY_COLUMNS', () => {
    const wb = buildInventorySheet(sampleProducts);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Inventario'], { header: 1 });
    expect(rows[0]).toEqual(INVENTORY_COLUMNS);
  });

  it('maps qty to quantity correctly', () => {
    const wb = buildInventorySheet(sampleProducts);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Inventario']);
    expect(rows[0].quantity).toBe(3);
    expect(rows[1].quantity).toBe(1);
  });

  it('maps sold=false to "Disponible" and sold=true to "Vendido"', () => {
    const wb = buildInventorySheet(sampleProducts);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Inventario']);
    expect(rows[0].stock_status).toBe('Disponible');
    expect(rows[1].stock_status).toBe('Vendido');
  });

  it('treats sold=undefined as "Disponible"', () => {
    const products = [{ name: 'Sin sold', qty: 2, price: 50 }];
    const wb = buildInventorySheet(products);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Inventario']);
    expect(rows[0].stock_status).toBe('Disponible');
  });

  it('empty array produces workbook with only headers row', () => {
    const wb = buildInventorySheet([]);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Inventario'], { header: 1 });
    // Only the header row should exist
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(INVENTORY_COLUMNS);
  });

  it('does not mutate the input products array', () => {
    const products = [{ name: 'X', qty: 5, price: 100, sold: false }];
    const original = JSON.stringify(products);
    buildInventorySheet(products);
    expect(JSON.stringify(products)).toBe(original);
  });
});
