import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabaseReady } from './supabase.js';
import { listProducts, createProduct, updateProduct, deleteProduct, appendPromoUrls, removePromoUrl } from './lib/api.js';
import { exportProductsAsZip } from './lib/exportZip.js';
import { sortProducts, DEFAULT_SORT_KEY } from './lib/sortProducts.js';
import { buildSellPatch, buildUnsellPatch, getDeleteArgs } from './lib/inventory.js';
import { useAuth } from './contexts/AuthContext.jsx';
import Login from './components/Login.jsx';
import Header from './components/Header.jsx';
import Stats from './components/Stats.jsx';
import Filters from './components/Filters.jsx';
import ProductGrid from './components/ProductGrid.jsx';
import SortControl from './components/SortControl.jsx';
import AddProductModal from './components/AddProductModal.jsx';
import SellModal from './components/SellModal.jsx';
import PromoPhotoModal from './components/PromoPhotoModal.jsx';
import PromoGalleryModal from './components/PromoGalleryModal.jsx';
import Toast from './components/Toast.jsx';

export default function App() {
  const { session, loading: authLoading } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState('');
  const [ui, setUi] = useState({ status: 'all', category: '', store: '', query: '', sortKey: DEFAULT_SORT_KEY });

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [sellingId, setSellingId] = useState(null);
  const [promoItem, setPromoItem] = useState(null);
  const [galleryItem, setGalleryItem] = useState(null);
  const [exportProgress, setExportProgress] = useState(null);

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

  useEffect(() => {
    if (session) refresh();
    else { setProducts([]); setLoading(false); }
  }, [session, refresh]);

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

  const sorted = useMemo(() => sortProducts(filtered, ui.sortKey), [filtered, ui.sortKey]);

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
      await deleteProduct(...getDeleteArgs(item));
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
      const updated = await updateProduct(item.id, buildUnsellPatch());
      setProducts(p => p.map(x => x.id === updated.id ? updated : x));
      showToast('Venta revertida');
    } catch (e) { showToast('Error: ' + e.message); }
  };

  const confirmSell = async (payload) => {
    try {
      const updated = await updateProduct(sellingId, buildSellPatch(payload));
      setProducts(p => p.map(x => x.id === updated.id ? updated : x));
      setSellingId(null);
      showToast('Venta registrada ✔');
    } catch (e) { showToast('Error: ' + e.message); }
  };

  const sellingItem = sellingId ? products.find(p => p.id === sellingId) : null;

  const handleExportFiltered = async () => {
    if (filtered.length === 0) {
      showToast('No hay productos para exportar');
      return;
    }
    if (exportProgress) return;
    try {
      setExportProgress({ done: 0, total: 0 });
      const result = await exportProductsAsZip(filtered, {
        zipName: 'inventario',
        onProgress: (p) => setExportProgress(p),
      });
      const msg = result.errors.length
        ? `ZIP listo: ${result.totalFiles} fotos (${result.errors.length} fallaron)`
        : `ZIP listo: ${result.totalFiles} fotos`;
      showToast(msg);
    } catch (e) {
      showToast('Error: ' + e.message);
    } finally {
      setExportProgress(null);
    }
  };

  // Auth gate
  if (authLoading) {
    return (
      <div className="auth-loading">
        <div className="spinner" />
      </div>
    );
  }
  if (!session) {
    return <Login />;
  }

  return (
    <>
      <Header ui={ui} setUi={setUi} onAdd={openAdd} user={session.user} />
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
        <div className="export-bar">
          <button
            className="btn"
            onClick={handleExportFiltered}
            disabled={!!exportProgress || filtered.length === 0}
            title="Descargar ZIP con originales y promos de los productos filtrados"
          >
            {exportProgress
              ? (exportProgress.phase === 'compressing'
                  ? 'Comprimiendo ZIP...'
                  : `Descargando ${exportProgress.done}/${exportProgress.total}...`)
              : `📦 Descargar ZIP (${filtered.length})`}
          </button>
        </div>
        <SortControl
          sortKey={ui.sortKey}
          onChange={(k) => setUi(u => ({ ...u, sortKey: k }))}
        />
        <ProductGrid
          items={sorted}
          total={products.length}
          loading={loading}
          onAdd={openAdd}
          onEdit={openEdit}
          onDelete={handleDelete}
          onSell={handleSell}
          onUnsell={handleUnsell}
          onPromo={(item) => setPromoItem(item)}
          onViewPromos={(item) => setGalleryItem(item)}
          onToast={showToast}
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

      {galleryItem && (
        <PromoGalleryModal
          item={galleryItem}
          onClose={() => setGalleryItem(null)}
          onRemove={async (productId, url) => {
            const updated = await removePromoUrl(productId, url);
            setProducts(p => p.map(x => x.id === updated.id ? updated : x));
            // Update galleryItem in place so the modal reflects the change
            setGalleryItem(prev => prev?.id === updated.id ? updated : prev);
            // If no more promos, close the gallery
            if (!updated.promo_urls || updated.promo_urls.length === 0) {
              setGalleryItem(null);
            }
            showToast('Foto eliminada');
          }}
        />
      )}

      <Toast message={toast} />
    </>
  );
}
