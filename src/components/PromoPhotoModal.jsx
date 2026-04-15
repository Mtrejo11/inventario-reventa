import { useEffect, useMemo, useRef, useState } from 'react';
import { getAllPresets } from '../lib/backgrounds.js';
import { removeProductBackground, blobToImage, composeWithPreset, blobToDataUrl } from '../lib/promo.js';
import { uploadPromoPhoto } from '../lib/api.js';

// Fases: 'idle' -> 'removing' -> 'composing' -> 'ready'
export default function PromoPhotoModal({ item, onClose, onSaved, onToast }) {
  const sources = useMemo(() => {
    const list = [];
    if (item?.photo_url) list.push({ id: 'main', url: item.photo_url, label: 'Principal' });
    const extras = Array.isArray(item?.extra_photo_urls) ? item.extra_photo_urls : [];
    extras.forEach((u, i) => { if (u) list.push({ id: 'extra-' + i, url: u, label: `Foto ${i + 1}` }); });
    return list;
  }, [item]);

  const [sourceId, setSourceId] = useState(sources[0]?.id || 'main');
  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [variants, setVariants] = useState([]); // [{ key, label, tag, dataUrl, blob }]
  const [selected, setSelected] = useState(new Set());
  const [previewKey, setPreviewKey] = useState(null);
  const [saving, setSaving] = useState(false);
  const productImgRef = useRef(null);
  const runRef = useRef(0);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  // Procesa una fuente (URL): bg removal + composición de todas las variantes.
  useEffect(() => {
    const currentSource = sources.find(s => s.id === sourceId);
    if (!currentSource) {
      onToast('Este producto no tiene fotos para generar promo');
      onClose();
      return;
    }
    const runId = ++runRef.current;
    let cancelled = false;
    (async () => {
      try {
        // Reset
        setVariants([]);
        setSelected(new Set());
        setPreviewKey(null);
        setPhase('removing'); setProgress(0);

        const blob = await removeProductBackground(currentSource.url, (p) => {
          if (!cancelled && runRef.current === runId) setProgress(p.pct);
        });
        if (cancelled || runRef.current !== runId) return;
        const img = await blobToImage(blob);
        productImgRef.current = img;

        setPhase('composing');
        const presets = getAllPresets();
        const out = [];
        for (const p of presets) {
          if (cancelled || runRef.current !== runId) return;
          const composed = await composeWithPreset(img, p.key, 900);
          const dataUrl = await blobToDataUrl(composed);
          out.push({ key: `${sourceId}__${p.key}`, preset: p.key, label: p.label, tag: p.tag, blob: composed, dataUrl });
          if (runRef.current === runId) setVariants([...out]);
        }
        if (!cancelled && runRef.current === runId) setPhase('ready');
      } catch (e) {
        if (!cancelled && runRef.current === runId) {
          onToast('Error: ' + (e?.message || 'no se pudo procesar'));
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  const toggleSelect = (key) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(variants.map(v => v.key)));
  const clearAll = () => setSelected(new Set());

  const downloadOne = (v) => {
    const a = document.createElement('a');
    a.href = v.dataUrl;
    a.download = `${slug(item.name)}-${sourceId}-${v.preset}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const downloadSelected = () => {
    const list = variants.filter(v => selected.has(v.key));
    if (list.length === 0) { onToast('Selecciona al menos una foto'); return; }
    list.forEach(v => downloadOne(v));
  };

  const saveSelected = async () => {
    const list = variants.filter(v => selected.has(v.key));
    if (list.length === 0) { onToast('Selecciona al menos una foto'); return; }
    setSaving(true);
    try {
      const urls = [];
      for (const v of list) {
        const { url } = await uploadPromoPhoto(v.blob, item.id, `${sourceId}_${v.preset}`);
        urls.push(url);
      }
      await onSaved(urls);
      onToast(`✔ ${urls.length} foto${urls.length > 1 ? 's' : ''} guardada${urls.length > 1 ? 's' : ''}`);
      onClose();
    } catch (e) {
      onToast('Error al guardar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const preview = variants.find(v => v.key === previewKey);

  return (
    <div className="modal-bg show" onClick={(e) => { if (e.currentTarget === e.target && !saving) onClose(); }}>
      <div className="modal promo-modal">
        <header>
          <h2>✨ Fotos para anuncio</h2>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>
            {item.name}{item.brand ? ' — ' + item.brand : ''}
          </div>
          <button className="close" onClick={onClose} disabled={saving}>×</button>
        </header>

        <div className="content">
          {sources.length > 1 && (
            <div className="source-picker">
              <div className="source-label">Foto de base</div>
              <div className="source-row">
                {sources.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className={'source-thumb' + (sourceId === s.id ? ' active' : '')}
                    onClick={() => sourceId !== s.id && !saving && setSourceId(s.id)}
                    disabled={saving}
                    title={`Usar ${s.label}`}
                  >
                    <img src={s.url} alt={s.label} />
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(phase === 'removing' || (phase === 'composing' && variants.length === 0)) && (
            <div className="promo-loading">
              <div className="spinner" />
              <div><b>{phase === 'removing' ? 'Removiendo fondo...' : 'Componiendo variantes...'}</b></div>
              {phase === 'removing' && (
                <>
                  <div className="promo-progress"><div style={{ width: progress + '%' }} /></div>
                  <div className="hint">{progress}% · primera vez descarga el modelo (~40MB), luego es instantáneo</div>
                </>
              )}
              {phase === 'removing' && (
                <div className="hint">Todo corre localmente en tu navegador. Ninguna foto sale de tu equipo.</div>
              )}
            </div>
          )}

          {(phase === 'composing' || phase === 'ready') && variants.length > 0 && (
            <>
              <div className="promo-toolbar">
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {selected.size > 0 ? `${selected.size} seleccionada${selected.size > 1 ? 's' : ''}` : 'Toca para seleccionar'}
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost" onClick={selectAll} disabled={saving}>Todas</button>
                  <button className="btn btn-ghost" onClick={clearAll} disabled={saving}>Ninguna</button>
                </div>
              </div>

              <div className="promo-grid">
                {variants.map(v => (
                  <div
                    key={v.key}
                    className={'promo-card' + (selected.has(v.key) ? ' selected' : '')}
                    onClick={() => toggleSelect(v.key)}
                  >
                    <div className="promo-thumb">
                      <img src={v.dataUrl} alt={v.label} />
                      <button
                        className="promo-zoom"
                        onClick={(e) => { e.stopPropagation(); setPreviewKey(v.key); }}
                        title="Ver grande"
                      >⤢</button>
                      {selected.has(v.key) && <div className="promo-check">✓</div>}
                    </div>
                    <div className="promo-meta">
                      <div className="promo-label">{v.label}</div>
                      <div className="promo-tag">{v.tag}</div>
                    </div>
                  </div>
                ))}
              </div>
              {phase === 'composing' && (
                <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  Generando variantes... {variants.length}/{getAllPresets().length}
                </div>
              )}
            </>
          )}

          {preview && (
            <div className="promo-preview" onClick={() => setPreviewKey(null)}>
              <img src={preview.dataUrl} alt={preview.label} />
              <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); downloadOne(preview); }}>
                Descargar
              </button>
              <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); setPreviewKey(null); }}>
                Cerrar
              </button>
            </div>
          )}
        </div>

        <footer>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cerrar</button>
          <button className="btn" onClick={downloadSelected} disabled={saving || phase !== 'ready' || selected.size === 0}>
            ⬇ Descargar ({selected.size})
          </button>
          <button className="btn btn-primary" onClick={saveSelected} disabled={saving || phase !== 'ready' || selected.size === 0}>
            {saving ? 'Guardando...' : `Guardar en producto (${selected.size})`}
          </button>
        </footer>
      </div>
    </div>
  );
}

function slug(s) {
  return String(s || 'producto').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}
