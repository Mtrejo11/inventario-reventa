import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabaseReady } from './supabase.js';
import { listProducts, createProduct, updateProduct, deleteProduct, appendPromoUrls } from './lib/api.js';
import Header from './components/Header.jsx';
import Stats from './components/Stats.jsx';
import Filters from './components/Filters.jsx';
import ProductGrid from './components/ProductGrid.jsx';
import AddProductModal from './components/AddProductModal.jsx';
import SellModal from './components/SellModal.jsx';
import PromoPhotoModal from './components/PromoPhotoModal.jsx';
import Toast from './components/Toast.jsx';

export default function App() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState('');
  const [ui, setUi] = useState({ status: 'all', category: '', store: '', query: '' });

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [sellingId, setSellingId] = useState(null);
  const [promoItem, setPromoItem] = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2400);
  }, []);

  const refresh = useCallback(async () => {
    if (!supabaseReady()) {
      setError('Falta configurar Supabase. Copia .env.example a .env y llena VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listProducts();
      setProducts(rows);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    return products.filter(it => {
      if (ui.status === 'available' && it.sold) return false;
      if (ui.status === 'sold' && !it.sold) return false;
      if (ui.category && it.category !== ui.category) return false;
      if (ui.store && it.store !== ui.store) return false;
      if (ui.query) {
        const q = ui.query.toLowerCase();
        const hay = [it.name, it.brand, it.notes, it.color].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, ui]);

  const stats = useMemo(() => {
    let invested = 0, potential = 0, realProfit = 0, potentialProfit = 0;
    let avail = 0, sold = 0;
    for (const it of products) {
      const qty = Number(it.qty || 1);
      const cost = Number(it.cost || 0) * qty;
      invested += cost;
      if (it.sold) {
        sold++;
        realProfit += (Number(it.sold_price || 0) * qty) - cost;
      } else {
        avail++;
        potential += Number(it.price || 0) * qty;
        potentialProfit += (Number(it.price || 0) * qty) - cost;
      }
    }
    return {
      count: products.length, avail, sold, invested, potential,
      profit: realProfit + potentialProfit, realProfit, potentialProfit
    };
  }, [products]);

  const openAdd = () => { setEditing(null); setAddOpen(true); };
  const openEdit = (item) => { setEditing(item); setAddOpen(true); };

  const handleSave = async (data, originalPhotoPath) => {
    try {
      if (editing) {
        const updated = await updateProduct(editing.id, data);
        setProducts(p => p.map(x => x.id === updated.id ? updated : x));
        showToast('Producto actualizado');
      } else {
        const created = await createProduct(data);
        setProducts(p => [created, ...p]);
        showToast('Producto agregado');
      }
      setAddOpen(false);
      setEditing(null);
    } catch (e) {
      showToast('Error: ' + e.message);
    }
  };

  const handleDelete = async (item) => {
    if (!confirm('¿Eliminar este producto? No se puede deshacer.')) return;
    try {
      await deleteProduct(item.id, item.photo_path);
      setProducts(p => p.filter(x => x.id !== item.id));
      showToast('Producto eliminado');
    } catch (e) {
      showToast('Error: ' + e.message);
    }
  };

  const handleSell = (id) => setSellingId(id);
  const handleUnsell = async (item) => {
    if (!confirm('¿Revertir la venta y marcarlo como disponible?')) return;
    try {
      const updated = await updateProduct(item.id, {
        sold: false, sold_price: null, sold_date: null, sold_note: null
      });
      setProducts(p => p.map(x => x.id === updated.id ? updated : x));
      showToast('Venta revertida');
    } catch (e) { showToast('Error: ' + e.message); }
  };

  const confirmSell = async (payload) => {
    try {
      const updated = await updateProduct(sellingId, {
        sold: true,
        sold_price: payload.price,
        sold_date: payload.date,
        sold_note: payload.note
      });
      setProducts(p => p.map(x => x.id === updated.id ? updated : x));
      setSellingId(null);
      showToast('Venta registrada ✔');
    } catch (e) { showToast('Error: ' + e.message); }
  };

  const sellingItem = sellingId ? products.find(p => p.id === sellingId) : null;

  return (
    <>
      <Header ui={ui} setUi={setUi} onAdd={openAdd} />
      <main className="wrap main">
        {error && (
          <div className="alert">
            {error}
            <div className="alert-sub">
              Configura las variables de entorno y corre el SQL de <code>supabase/schema.sql</code>.
            </div>
          </div>
        )}
        <Stats s={stats} />
        <Filters ui={ui} setUi={setUi} />
        <ProductGrid
          items={filtered}
          total={products.length}
          loading={loading}
          onAdd={openAdd}
          onEdit={openEdit}
          onDelete={handleDelete}
          onSell={handleSell}
          onUnsell={handleUnsell}
          onPromo={(item) => setPromoItem(item)}
        />
      </main>

      {addOpen && (
        <AddProductModal
          item={editing}
          onClose={() => { setAddOpen(false); setEditing(null); }}
          onSave={handleSave}
          onToast={showToast}
        />
      )}

      {sellingItem && (
        <SellModal
          item={sellingItem}
          onClose={() => setSellingId(null)}
          onConfirm={confirmSell}
        />
      )}

      {promoItem && (
        <PromoPhotoModal
          item={promoItem}
          onClose={() => setPromoItem(null)}
          onToast={showToast}
          onSaved={async (urls) => {
            const updated = await appendPromoUrls(promoItem.id, urls);
            setProducts(p => p.map(x => x.id === updated.id ? updated : x));
          }}
        />
      )}

      <Toast message={toast} />
    </>
  );
}
