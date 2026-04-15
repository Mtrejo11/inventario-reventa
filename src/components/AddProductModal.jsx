import { useEffect, useRef, useState } from 'react';
import { money, fileToDataUrl, urlToDataUrl } from '../lib/utils.js';
import { analyzeImage, uploadPhoto, removeStoragePath } from '../lib/api.js';

const CATEGORIES = ['cartera', 'ropa', 'zapatos', 'accesorios', 'otro'];
const STORES = ['Ross', 'Marshalls', 'Burlington', 'TJ Maxx', 'Otro'];
const CONDITIONS = ['Nuevo con etiqueta', 'Nuevo sin etiqueta', 'Excelente', 'Buena', 'Usado'];
const MAX_EXTRAS = 2;

export default function AddProductModal({ item, onClose, onSave, onToast }) {
  const [form, setForm] = useState(() => ({
    name: item?.name || '',
    brand: item?.brand || '',
    category: item?.category || 'cartera',
    store: item?.store || 'Ross',
    color: item?.color || '',
    condition: item?.condition || 'Nuevo con etiqueta',
    cost: item?.cost ?? '',
    price: item?.price ?? '',
    qty: item?.qty ?? 1,
    notes: item?.notes || '',
  }));
  const [photoUrl, setPhotoUrl] = useState(item?.photo_url || null);
  const [pendingDataUrl, setPendingDataUrl] = useState(null);

  // Extras: array de longitud MAX_EXTRAS; cada slot es null o { url, path, pendingDataUrl, previousPath }
  const [extras, setExtras] = useState(() => {
    const urls = Array.isArray(item?.extra_photo_urls) ? item.extra_photo_urls : [];
    const paths = Array.isArray(item?.extra_photo_paths) ? item.extra_photo_paths : [];
    const out = urls.map((u, i) => u ? { url: u, path: paths[i] || null, pendingDataUrl: null } : null);
    while (out.length < MAX_EXTRAS) out.push(null);
    return out.slice(0, MAX_EXTRAS);
  });
  // Paths viejos a borrar de Storage si el usuario los reemplazó
  const [pathsToDelete, setPathsToDelete] = useState([]);

  const [aiMsg, setAiMsg] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef(null);
  const extraInputs = useRef([]);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const onFileChange = async (e) => {
    const input = e.target;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      onToast('El archivo no es una imagen válida');
      return;
    }
    try {
      setAiMsg('Procesando imagen...');
      setAiLoading(true);
      const data = await fileToDataUrl(f, 1280, 0.85);
      setPendingDataUrl(data);
      setPhotoUrl(data);

      // Reunir todas las fotos disponibles (la nueva principal + los extras actuales)
      const photos = [data];
      for (const ex of extras) {
        if (!ex) continue;
        if (ex.pendingDataUrl) photos.push(ex.pendingDataUrl);
        else if (ex.url) {
          try { photos.push(await urlToDataUrl(ex.url)); } catch {}
        }
      }
      await runAnalysis(photos);
    } catch (err) {
      setAiLoading(false);
      setAiMsg('');
      onToast('Error cargando foto: ' + err.message);
    }
  };

  // Centraliza la llamada a Claude y el relleno del form
  const runAnalysis = async (photos) => {
    if (!photos || photos.length === 0) return;
    setAiLoading(true);
    setAiMsg(`Analizando ${photos.length} foto${photos.length > 1 ? 's' : ''} con Claude...`);
    try {
      const out = await analyzeImage(photos);
      setForm(prev => {
        const notesParts = [];
        if (out.notes) notesParts.push(out.notes);
        if (out.features) notesParts.push(out.features);
        if (out.material) notesParts.push('Material: ' + out.material);
        if (out.size) notesParts.push('Talla: ' + out.size);
        if (out.model) notesParts.push('Modelo: ' + out.model);
        if (out.style_code) notesParts.push('Código: ' + out.style_code);
        if (out.original_retail) notesParts.push('MSRP: $' + Number(out.original_retail).toFixed(2));
        if (out.price_reasoning) notesParts.push('💡 ' + out.price_reasoning);
        const richNotes = notesParts.filter(Boolean).join(' · ');

        const claudePrice = Number(out.suggested_sale_price) > 0 ? Number(out.suggested_sale_price) : null;
        const fallbackPrice = out.original_retail
          ? Math.round(Number(out.original_retail) * 0.55 * 100) / 100
          : null;
        const suggestedPrice = claudePrice ?? fallbackPrice;

        return {
          ...prev,
          name: prev.name || out.name || prev.name,
          brand: prev.brand || out.brand || prev.brand,
          category: CATEGORIES.includes(out.category) ? out.category : prev.category,
          color: prev.color || out.color || prev.color,
          condition: CONDITIONS.includes(out.condition) ? out.condition : prev.condition,
          store: (out.store && STORES.includes(out.store)) ? out.store : prev.store,
          cost: prev.cost !== '' && prev.cost != null ? prev.cost : (out.tag_price ?? prev.cost),
          price: prev.price !== '' && prev.price != null && prev.price !== 0 ? prev.price : (suggestedPrice ?? prev.price),
          notes: prev.notes || richNotes || prev.notes,
        };
      });
      const bits = [out.brand, out.name || 'producto'].filter(Boolean).join(' — ');
      const priceBit = out.tag_price ? ` · Etiqueta $${out.tag_price}` : '';
      const msrpBit = out.original_retail ? ` · MSRP $${out.original_retail}` : '';
      const sugBit = out.suggested_sale_price ? ` · Sugerido $${out.suggested_sale_price}` : '';
      setAiMsg(`✨ ${bits}${priceBit}${msrpBit}${sugBit}`);
    } catch (err) {
      setAiMsg('No se pudo analizar: ' + err.message);
    } finally {
      setAiLoading(false);
    }
  };

  // Re-analizar usando todas las fotos disponibles (principal + extras)
  const reAnalyze = async () => {
    setAiLoading(true);
    setAiMsg('Recolectando fotos...');
    try {
      const photos = [];
      if (pendingDataUrl) photos.push(pendingDataUrl);
      else if (item?.photo_url) {
        try { photos.push(await urlToDataUrl(item.photo_url)); } catch {}
      }
      for (const ex of extras) {
        if (!ex) continue;
        if (ex.pendingDataUrl) photos.push(ex.pendingDataUrl);
        else if (ex.url) {
          try { photos.push(await urlToDataUrl(ex.url)); } catch {}
        }
      }
      if (photos.length === 0) {
        setAiLoading(false);
        setAiMsg('');
        onToast('Sube al menos una foto antes de analizar');
        return;
      }
      await runAnalysis(photos);
    } catch (e) {
      setAiLoading(false);
      setAiMsg('No se pudieron recolectar las fotos: ' + e.message);
    }
  };

  const hasAnyPhoto = !!(
    pendingDataUrl ||
    item?.photo_url ||
    extras.some(ex => ex && (ex.pendingDataUrl || ex.url))
  );

  const onExtraFileChange = async (idx, e) => {
    const input = e.target;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      onToast('El archivo no es una imagen válida');
      return;
    }
    try {
      const data = await fileToDataUrl(f, 1280, 0.85);
      setExtras(prev => {
        const next = [...prev];
        const previousPath = next[idx]?.path || null;
        if (previousPath) setPathsToDelete(pd => [...pd, previousPath]);
        next[idx] = { url: data, path: null, pendingDataUrl: data };
        return next;
      });
      // Sugerencia visible al usuario sin auto-llamar a Claude
      setAiMsg('📸 Foto extra agregada. Toca "Re-analizar" para consolidar con todas las fotos.');
    } catch (err) {
      onToast('Error cargando extra: ' + err.message);
    }
  };

  const removeExtra = (idx) => {
    setExtras(prev => {
      const next = [...prev];
      const previousPath = next[idx]?.path || null;
      if (previousPath) setPathsToDelete(pd => [...pd, previousPath]);
      next[idx] = null;
      return next;
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) { onToast('Pon al menos un nombre'); return; }
    setSaving(true);
    try {
      let finalPhotoUrl = item?.photo_url || null;
      let finalPhotoPath = item?.photo_path || null;

      if (pendingDataUrl) {
        const uploaded = await uploadPhoto(pendingDataUrl);
        finalPhotoUrl = uploaded.url;
        finalPhotoPath = uploaded.path;
      }

      // Sube extras nuevos y construye arrays finales
      const extraUrls = [];
      const extraPaths = [];
      for (const ex of extras) {
        if (!ex) continue;
        if (ex.pendingDataUrl) {
          const up = await uploadPhoto(ex.pendingDataUrl, 'extras');
          extraUrls.push(up.url);
          extraPaths.push(up.path);
        } else if (ex.url) {
          extraUrls.push(ex.url);
          extraPaths.push(ex.path || '');
        }
      }

      const payload = {
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        category: form.category,
        store: form.store,
        color: form.color.trim() || null,
        condition: form.condition,
        cost: Number(form.cost || 0),
        price: Number(form.price || 0),
        qty: Math.max(1, Number(form.qty || 1)),
        notes: form.notes.trim() || null,
        photo_url: finalPhotoUrl,
        photo_path: finalPhotoPath,
        extra_photo_urls: extraUrls,
        extra_photo_paths: extraPaths,
      };
      await onSave(payload);

      // Best-effort: limpia paths reemplazados del Storage
      for (const p of pathsToDelete) await removeStoragePath(p);
    } catch (e) {
      onToast('Error guardando: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const cost = Number(form.cost || 0);
  const price = Number(form.price || 0);
  const qty = Number(form.qty || 1);
  const gain = (price - cost) * qty;
  const margin = cost > 0 ? ((price - cost) / cost) * 100 : 0;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-bg show" onClick={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <div className="modal">
        <header>
          <h2>{item ? 'Editar producto' : 'Agregar producto'}</h2>
          <button className="close" onClick={onClose}>×</button>
        </header>
        <div className="content">
          <div className="field">
            <label>Foto principal</label>
            <div
              className="photo-dropzone"
              role="button"
              tabIndex={0}
              onClick={() => fileInput.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click(); }}
            >
              {photoUrl
                ? <img src={photoUrl} alt="preview" />
                : (
                  <div>
                    <div style={{ fontSize: 32 }}>📷</div>
                    <div><b>Subir foto</b></div>
                    <div className="hint">
                      Toca para tomar foto o elegir archivo.<br />
                      Claude detectará los datos automáticamente.
                    </div>
                  </div>
                )
              }
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
              onChange={onFileChange}
            />
          </div>

          <div className="field">
            <label>Fotos adicionales <span className="label-hint">(opcional · hasta {MAX_EXTRAS})</span></label>
            <div className="extras-row">
              {extras.map((ex, idx) => (
                <div key={idx} className="extra-slot">
                  {ex ? (
                    <>
                      <img src={ex.url} alt={`extra ${idx + 1}`} />
                      <button
                        type="button"
                        className="extra-remove"
                        onClick={() => removeExtra(idx)}
                        title="Quitar"
                      >×</button>
                      <button
                        type="button"
                        className="extra-replace"
                        onClick={() => extraInputs.current[idx]?.click()}
                        title="Reemplazar"
                      >↻</button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="extra-add"
                      onClick={() => extraInputs.current[idx]?.click()}
                    >
                      <span style={{ fontSize: 24 }}>＋</span>
                      <span style={{ fontSize: 11 }}>Foto {idx + 1}</span>
                    </button>
                  )}
                  <input
                    ref={(el) => { extraInputs.current[idx] = el; }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={(e) => onExtraFileChange(idx, e)}
                  />
                </div>
              ))}
            </div>
            <div className="extras-hint">
              Útiles cuando una sola foto no alcanza: prenda completa, etiqueta, marca...
            </div>
          </div>

          {hasAnyPhoto && (
            <button
              type="button"
              className="btn reanalyze-btn"
              onClick={reAnalyze}
              disabled={aiLoading}
              title="Volver a analizar usando todas las fotos disponibles"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              {aiLoading ? 'Analizando...' : 'Re-analizar con todas las fotos'}
            </button>
          )}

          {aiMsg && (
            <div className={'ai-banner' + (aiLoading ? ' loading' : '')}>
              <div className="dot" />
              <div>{aiMsg}</div>
            </div>
          )}

          <div className="row">
            <Field label="Nombre / descripción">
              <input type="text" value={form.name}
                onChange={e => update('name', e.target.value)}
                placeholder="Cartera negra Coach mediana" />
            </Field>
            <Field label="Marca">
              <input type="text" value={form.brand}
                onChange={e => update('brand', e.target.value)}
                placeholder="Coach, Michael Kors, Nike..." />
            </Field>
          </div>

          <div className="row">
            <Field label="Categoría">
              <select value={form.category} onChange={e => update('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{cap(c)}</option>)}
              </select>
            </Field>
            <Field label="Tienda">
              <select value={form.store} onChange={e => update('store', e.target.value)}>
                {STORES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <div className="row">
            <Field label="Color">
              <input type="text" value={form.color}
                onChange={e => update('color', e.target.value)}
                placeholder="Negro, rojo..." />
            </Field>
            <Field label="Condición">
              <select value={form.condition} onChange={e => update('condition', e.target.value)}>
                {CONDITIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>

          <div className="row">
            <Field label="Precio de compra ($)">
              <input type="number" min="0" step="0.01" value={form.cost}
                onChange={e => update('cost', e.target.value)} />
            </Field>
            <Field label="Precio de venta deseado ($)">
              <input type="number" min="0" step="0.01" value={form.price}
                onChange={e => update('price', e.target.value)} />
            </Field>
          </div>

          <div className="row">
            <Field label="Cantidad">
              <input type="number" min="1" step="1" value={form.qty}
                onChange={e => update('qty', e.target.value)} />
            </Field>
            <Field label="Notas">
              <input type="text" value={form.notes}
                onChange={e => update('notes', e.target.value)}
                placeholder="Detalles, defectos, etc." />
            </Field>
          </div>

          <div className="margin-preview">
            <span>Ganancia estimada: <b>{money(gain)}</b></span>
            <span>Margen: <b>{margin.toFixed(0)}%</b></span>
          </div>
        </div>
        <footer>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
