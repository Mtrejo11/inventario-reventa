import { SORT_OPTIONS } from '../lib/sortProducts.js';

export default function SortControl({ sortKey, onChange }) {
  return (
    <section className="controls">
      <label htmlFor="sort-select">Ordenar por:</label>
      <select
        id="sort-select"
        value={sortKey}
        onChange={(e) => onChange(e.target.value)}
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.key} value={opt.key}>
            {opt.label}
          </option>
        ))}
      </select>
    </section>
  );
}
