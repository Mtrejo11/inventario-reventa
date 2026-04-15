import { money } from '../lib/utils.js';

export default function ProductCard({ item, onEdit, onDelete, onSell, onUnsell, onPromo }) {
  const qty = Number(item.qty || 1);
  const cost = Number(item.cost || 0);
  const price = item.sold ? Number(item.sold_price || 0) : Number(item.price || 0);
  const gain = (price - cost) * qty;
  const margin = cost > 0 ? ((price - cost) / cost) * 100 : 0;

  return (
    <div className="card">
      <div className="photo">
        {item.photo_url
          ? <img src={item.photo_url} alt={item.name} />
          : <div className="no-photo">📦</div>}
        <span className={'badge ' + (item.sold ? 'sold' : 'available')}>
          {item.sold ? 'Vendido' : 'Disponible'}
        </span>
        {item.photo_url && (
          <button
            className="promo-fab"
            onClick={(e) => { e.stopPropagation(); onPromo(item); }}
            title="Generar fotos para anuncio"
          >
            ✨ Promo
          </button>
        )}
      </div>
      <div className="body">
        <div className="title">{item.name || 'Sin nombre'}</div>
        <div className="meta">
          {item.brand && <span className="chip">{item.brand}</span>}
          <span className="chip">{item.category || 'otro'}</span>
          {item.store && <span className="chip">{item.store}</span>}
          {qty > 1 && <span className="chip">×{qty}</span>}
        </div>
        <div className="prices">
          <div>
            <div className="price-sell">{money(price)}</div>
            <div className="price-buy">{money(cost)}</div>
          </div>
          <div className={'margin ' + (gain >= 0 ? 'pos' : 'neg')}>
            {gain >= 0 ? '+' : ''}{money(gain)}
            <br /><span className="margin-sub">{margin.toFixed(0)}% margen</span>
          </div>
        </div>
        {item.sold && item.sold_date && (
          <div className="sold-date">Vendido el {item.sold_date}</div>
        )}
        {Array.isArray(item.promo_urls) && item.promo_urls.length > 0 && (
          <div className="promo-strip" title="Fotos promocionales generadas">
            {item.promo_urls.slice(0, 3).map((u, i) => (
              <img key={u + i} src={u} alt="promo" />
            ))}
            {item.promo_urls.length > 3 && (
              <span className="promo-more">+{item.promo_urls.length - 3}</span>
            )}
          </div>
        )}
      </div>
      <div className="actions">
        {item.sold
          ? <button className="btn btn-ghost" onClick={() => onUnsell(item)}>Revertir</button>
          : <button className="btn btn-success" onClick={() => onSell(item.id)}>Vender</button>
        }
        <button className="btn" onClick={() => onEdit(item)}>Editar</button>
        <button className="btn btn-danger" onClick={() => onDelete(item)}>Eliminar</button>
      </div>
    </div>
  );
}
