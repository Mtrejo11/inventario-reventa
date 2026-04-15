import ProductCard from './ProductCard.jsx';

export default function ProductGrid({ items, total, loading, onAdd, onEdit, onDelete, onSell, onUnsell, onPromo }) {
  if (loading) {
    return <div className="empty"><div className="spinner" /> <p>Cargando inventario...</p></div>;
  }
  if (items.length === 0) {
    return (
      <div className="empty">
        <div style={{ fontSize: 40 }}>🛍️</div>
        <h3>{total === 0 ? 'Aún no hay productos' : 'Sin resultados'}</h3>
        <p>{total === 0 ? 'Agrega tu primera compra para empezar.' : 'Prueba cambiando los filtros o el buscador.'}</p>
        {total === 0 && (
          <button className="btn btn-primary" onClick={onAdd}>Agregar producto</button>
        )}
      </div>
    );
  }
  return (
    <div className="grid">
      {items.map(it => (
        <ProductCard
          key={it.id}
          item={it}
          onEdit={onEdit}
          onDelete={onDelete}
          onSell={onSell}
          onUnsell={onUnsell}
          onPromo={onPromo}
        />
      ))}
    </div>
  );
}
