export default function Filters({ ui, setUi }) {
  return (
    <section className="controls">
      <div className="search">
        <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Buscar por nombre, marca, notas..."
          value={ui.query}
          onChange={e => setUi(u => ({ ...u, query: e.target.value }))}
        />
      </div>
      <select value={ui.category} onChange={e => setUi(u => ({ ...u, category: e.target.value }))}>
        <option value="">Todas las categorías</option>
        <option value="cartera">Carteras</option>
        <option value="ropa">Ropa</option>
        <option value="zapatos">Zapatos</option>
        <option value="accesorios">Accesorios</option>
        <option value="otro">Otro</option>
      </select>
      <select value={ui.store} onChange={e => setUi(u => ({ ...u, store: e.target.value }))}>
        <option value="">Todas las tiendas</option>
        <option>Ross</option>
        <option>Marshalls</option>
        <option>Burlington</option>
        <option>TJ Maxx</option>
        <option>Otro</option>
      </select>
    </section>
  );
}
