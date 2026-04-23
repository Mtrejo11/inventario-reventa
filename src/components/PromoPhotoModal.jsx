import { useEffect, useMemo, useRef, useState } from 'react';
import { getAllPresets } from '../lib/backgrounds.js';
import { removeProductBackground, blobToImage, composeWithPreset, blobToDataUrl } from '../lib/promo.js';
import { uploadPromoPhoto } from '../lib/api.js';
import { generateAIPromo, AI_STYLES, b64ToBlob } from '../lib/openai-promo.js';

// Tabs: 'local' = bg removal + presets, 'ai' = GPT Image 2
// Fases local: 'idle' -> 'removing' -> 'composing' -> 'ready'
// Fases AI:    'idle' -> 'generating' -> 'ready'

export default function PromoPhotoModal({ item, onClose, onSaved, onToast }) {
  const sources = useMemo(() => {
    const list = [];
    if (item?.photo_url) list.push({ id: 'main', url: item.photo_url, label: 'Principal' });
    const extras = Array.isArray(item?.extra_photo_urls) ? item.extra_photo_urls : [];
    extras.forEach((u, i) => { if (u) list.push({ id: 'extra-' + i, url: u, label: `Foto ${i + 1}` }); });
    return list;
  }, [item]);

  const [tab, setTab] = useState('local'); // default to local (pixel-perfect)
  const [sourceId, setSourceId] = useState(sources[0]?.id || 'main');
  // Local state
  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [variants, setVariants] = useState([]);
  // AI state
  const [aiPhase, setAiPhase] = useState('idle');
  const [aiVariants, setAiVariants] = useState([]);
  // Rotation state (manual override)
  const [manualRotation, setManualRotation] = useState(0); // 0, 90, 180, 270
  // Shared state
  const [selected, setSelected] = useState(new Set());
  const [previewKey, setPreviewKey] = useState(null);
  const [saving, setSaving] = useState(false);
  const productImgRef = useRef(null);
  const runRef = useRef(0);
  const aiRunRef = useRef(0);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  // ---- LOCAL: bg removal + compose (triggered by button) ----
  const startLocalGeneration = () => {
    const currentSource = sources.find(s => s.id === sourceId);
    if (!currentSource) { onToast('No hay foto disponible'); return; }
    const runId = ++runRef.current;
    setVariants([]); setSelected(new Set()); setPreviewKey(null);
    setPhase('removing'); setProgress(0);
    let cancelled = false;
    const cancelRef = { cancelled: false };
    (async () => {
      try {
        const blob = await removeProductBackground(currentSource.url, (p) => {
          if (!cancelRef.cancelled && runRef.current === runId) setProgress(p.pct);
        });
        if (cancelRef.cancelled || runRef.current !== runId) return;
        const img = await blobToImage(blob);
        productImgRef.current = img;
        setPhase('composing');
        const presets = getAllPresets();
        const out = [];
        for (const p of presets) {
          if (cancelRef.cancelled || runRef.current !== runId) return;
          const composed = await composeWithPreset(img, p.key, 900);
          const dataUrl = await blobToDataUrl(composed);
          out.push({ key: `${sourceId}__${p.key}`, preset: p.key, label: p.label, tag: p.tag, blob: composed, dataUrl });
          if (runRef.current === runId) setVariants([...out]);
        }
        if (!cancelRef.cancelled && runRef.current === runId) setPhase('ready');
      } catch (e) {
        if (!cancelRef.cancelled && runRef.current === runId) onToast('Error: ' + (e?.message || 'no se pudo procesar'));
      }
    })();
  };

  // ---- AI: GPT Image 2 (single API call for all styles) ----
  const startAiGeneration = () => {
    const currentSource = sources.find(s => s.id === sourceId);
    if (!currentSource) { onToast('No hay foto disponible'); return; }
    const runId = ++aiRunRef.current;
    setAiVariants([]); setSelected(new Set()); setPreviewKey(null);
    setAiPhase('generating');

    (async () => {
      try {
        // Single call — server analyzes once + generates all styles
        const res = await fetch('/api/generate-promo', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ imageUrl: currentSource.url, rotation: manualRotation }),
        });
        if (aiRunRef.current !== runId) return;

        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          onToast('Error AI: ' + (j.error || `HTTP ${res.status}`));
          setAiPhase('idle');
          return;
        }

        const { images } = await res.json();
        const results = (images || []).map((img, i) => {
          const styleMeta = AI_STYLES.find(s => s.key === img.style) || AI_STYLES[i] || {};
          if (img.error || !img.b64) {
            return { key: `ai_${sourceId}_${img.style}`, style: img.style, label: img.label || styleMeta.label, tag: styleMeta.tag, emoji: styleMeta.emoji, error: true };
          }
          const dataUrl = `data:image/png;base64,${img.b64}`;
          const blob = b64ToBlob(img.b64);
          return { key: `ai_${sourceId}_${img.style}`, style: img.style, label: img.label || styleMeta.label, tag: styleMeta.tag, emoji: styleMeta.emoji, dataUrl, blob, b64: img.b64 };
        });

        if (aiRunRef.current === runId) {
          setAiVariants(results);
          setAiPhase('ready');
        }
      } catch (e) {
        if (aiRunRef.current === runId) {
          onToast('Error AI: ' + (e?.message || 'error'));
          setAiPhase('idle');
        }
      }
    })();
  };

  // Current variants based on tab
  const currentVariants = tab === 'local' ? variants : aiVariants;
  const currentPhase = tab === 'local' ? phase : aiPhase;
  const isReady = currentPhase === 'ready';

  const toggleSelect = (key) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(currentVariants.filter(v => !v.error).map(v => v.key)));
  const clearAll = () => setSelected(new Set());

  const downloadOne = (v) => {
    const a = document.createElement('a');
    a.href = v.dataUrl;
    a.download = `${slug(item.name)}-${v.style || v.preset}-${tab}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const downloadSelected = () => {
    const list = currentVariants.filter(v => selected.has(v.key) && !v.error);
    if (list.length === 0) { onToast('Selecciona al menos una foto'); return; }
    list.forEach(v => downloadOne(v));
  };

  const saveSelected = async () => {
    const list = currentVariants.filter(v => selected.has(v.key) && !v.error);
    if (list.length === 0) { onToast('Selecciona al menos una foto'); return; }
    setSaving(true);
    try {
      const urls = [];
      for (const v of list) {
        const uploadBlob = v.blob || (v.b64 ? b64ToBlob(v.b64) : null);
        if (!uploadBlob) continue;
        const { url } = await uploadPromoPhoto(uploadBlob, item.id, `${tab}_${v.style || v.preset}`);
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

  const preview = currentVariants.find(v => v.key === previewKey);

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
          {/* Tab switcher */}
          <div className="promo-tabs">
            <button
              className={'promo-tab' + (tab === 'local' ? ' active' : '')}
              onClick={() => { if (!saving) { setTab('local'); setSelected(new Set()); setPreviewKey(null); }}}
              disabled={saving}
            >
              📸 Producto real
            </button>
            <button
              className={'promo-tab' + (tab === 'ai' ? ' active' : '')}
              onClick={() => { if (!saving) { setTab('ai'); setSelected(new Set()); setPreviewKey(null); }}}
              disabled={saving}
            >
              🤖 AI Creativo
            </button>
          </div>

          {/* Source picker */}
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

          {/* Rotation controls + preview */}
          {sources.length > 0 && (
            <div className="rotation-controls">
              <div className="rotation-preview">
                <img
                  src={sources.find(s => s.id === sourceId)?.url}
                  alt="Preview"
                  style={{ transform: `rotate(${manualRotation}deg)` }}
                />
              </div>
              <div className="rotation-buttons">
                <button
                  className="btn btn-ghost"
                  onClick={() => setManualRotation(r => (r + 270) % 360)}
                  disabled={saving || phase !== 'idle' && tab === 'local' || aiPhase !== 'idle' && tab === 'ai'}
                  title="Rotar 90° izquierda"
                >
                  ↺ 90°
                </button>
                <span className="rotation-label">
                  {manualRotation === 0 ? 'Original' : `Rotada ${manualRotation}°`}
                </span>
                <button
                  className="btn btn-ghost"
                  onClick={() => setManualRotation(r => (r + 90) % 360)}
                  disabled={saving || phase !== 'idle' && tab === 'local' || aiPhase !== 'idle' && tab === 'ai'}
                  title="Rotar 90° derecha"
                >
                  ↻ 90°
                </button>
              </div>
            </div>
          )}

          {/* ====== AI TAB ====== */}
          {tab === 'ai' && (
            <>
              {aiPhase === 'idle' && (
                <div className="ai-start">
                  <div className="ai-start-icon">🤖</div>
                  <h3>GPT Image 2 — AI Studio</h3>
                  <p>Genera fotos profesionales de tu producto con inteligencia artificial. Se crearán <strong>{AI_STYLES.length} estilos</strong> diferentes:</p>
                  <div className="ai-style-preview">
                    {AI_STYLES.map(s => (
                      <div key={s.key} className="ai-style-chip">
                        <span className="ai-style-emoji">{s.emoji}</span>
                        <span>{s.label}</span>
                        <span className="ai-style-tag">{s.tag}</span>
                      </div>
                    ))}
                  </div>
                  <button className="btn btn-primary btn-lg" onClick={startAiGeneration} disabled={!sources.length}>
                    🚀 Generar con AI
                  </button>
                  <div className="ai-hint">Toma ~30-60 segundos. Usa tu OpenAI API key.</div>
                  <div className="ai-disclaimer">⚠️ AI puede alterar ligeramente el producto (forma, textura, logo). Ideal para redes sociales, no para listings donde necesitas fidelidad exacta. Para eso usa "📸 Producto real".</div>
                </div>
              )}

              {aiPhase === 'generating' && (
                <div className="promo-loading">
                  <div className="spinner" />
                  <div><b>Generando con GPT Image 2...</b></div>
                  <div className="hint">Analizando producto y creando {AI_STYLES.length} estilos. Esto toma ~30-60 segundos.</div>
                </div>
              )}

              {/* Show AI results as they arrive */}
              {aiVariants.length > 0 && (
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
                    {aiVariants.map(v => (
                      <div
                        key={v.key}
                        className={'promo-card' + (selected.has(v.key) ? ' selected' : '') + (v.error ? ' errored' : '')}
                        onClick={() => !v.error && toggleSelect(v.key)}
                      >
                        <div className="promo-thumb">
                          {v.error
                            ? <div className="promo-error">⚠️ Error</div>
                            : <>
                                <img src={v.dataUrl} alt={v.label} />
                                <button
                                  className="promo-zoom"
                                  onClick={(e) => { e.stopPropagation(); setPreviewKey(v.key); }}
                                  title="Ver grande"
                                >⤢</button>
                                {selected.has(v.key) && <div className="promo-check">✓</div>}
                              </>
                          }
                        </div>
                        <div className="promo-meta">
                          <div className="promo-label">{v.emoji} {v.label}</div>
                          <div className="promo-tag">{v.tag}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* ====== LOCAL TAB ====== */}
          {tab === 'local' && (
            <>
              {phase === 'idle' && (
                <div className="ai-start">
                  <div className="ai-start-icon">📸</div>
                  <h3>Producto real — Fondos profesionales</h3>
                  <p>Remueve el fondo de tu foto y genera <strong>8 variantes</strong> con fondos de estudio, mármol, madera y más. Tu producto se mantiene 100% fiel al original.</p>
                  <button className="btn btn-primary btn-lg" onClick={startLocalGeneration} disabled={!sources.length}>
                    🎨 Generar variantes
                  </button>
                  <div className="ai-hint">Corre localmente en tu navegador. Primera vez descarga ~40MB.</div>
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
                      <div className="hint">Todo corre localmente en tu navegador. Ninguna foto sale de tu equipo.</div>
                    </>
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
            </>
          )}

          {/* Preview overlay (shared) */}
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
          <button className="btn" onClick={downloadSelected} disabled={saving || !isReady || selected.size === 0}>
            ⬇ Descargar ({selected.size})
          </button>
          <button className="btn btn-primary" onClick={saveSelected} disabled={saving || !isReady || selected.size === 0}>
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
