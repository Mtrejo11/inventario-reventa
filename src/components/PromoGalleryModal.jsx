import { useState } from 'react';

export default function PromoGalleryModal({ item, onClose, onRemove }) {
  const urls = Array.isArray(item?.promo_urls) ? item.promo_urls : [];
  const [removing, setRemoving] = useState(null);
  const [viewIdx, setViewIdx] = useState(null); // full-screen index

  const handleRemove = async (url) => {
    if (!confirm('¿Eliminar esta foto promocional?')) return;
    setRemoving(url);
    try {
      await onRemove(item.id, url);
    } finally {
      setRemoving(null);
    }
  };

  const download = (url, i) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(item.name || 'promo').replace(/\s+/g, '-')}-promo-${i + 1}.jpg`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const downloadAll = () => urls.forEach((u, i) => download(u, i));

  // Full-screen viewer
  if (viewIdx !== null && urls[viewIdx]) {
    return (
      <div className="modal-bg show" onClick={() => setViewIdx(null)}>
        <div className="promo-viewer" onClick={e => e.stopPropagation()}>
          <button className="viewer-close" onClick={() => setViewIdx(null)}>✕</button>
          {viewIdx > 0 && (
            <button className="viewer-nav viewer-prev" onClick={() => setViewIdx(viewIdx - 1)}>‹</button>
          )}
          {viewIdx < urls.length - 1 && (
            <button className="viewer-nav viewer-next" onClick={() => setViewIdx(viewIdx + 1)}>›</button>
          )}
          <img src={urls[viewIdx]} alt={`Promo ${viewIdx + 1}`} className="viewer-img" />
          <div className="viewer-footer">
            <span className="viewer-counter">{viewIdx + 1} / {urls.length}</span>
            <button className="btn btn-sm" onClick={() => download(urls[viewIdx], viewIdx)}>⬇ Descargar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-bg show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal promo-gallery-modal">
        <header>
          <h2>📸 Fotos promocionales</h2>
          <span className="promo-gallery-count">{urls.length} foto{urls.length !== 1 ? 's' : ''}</span>
          <button className="close-btn" onClick={onClose}>✕</button>
        </header>

        {urls.length === 0 ? (
          <div className="promo-gallery-empty">
            No hay fotos promocionales guardadas para este producto.
          </div>
        ) : (
          <>
            <div className="promo-gallery-grid">
              {urls.map((url, i) => (
                <div key={url + i} className="promo-gallery-item">
                  <img
                    src={url}
                    alt={`Promo ${i + 1}`}
                    onClick={() => setViewIdx(i)}
                  />
                  <div className="promo-gallery-actions">
                    <button
                      className="btn btn-sm"
                      onClick={() => download(url, i)}
                      title="Descargar"
                    >
                      ⬇
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleRemove(url)}
                      disabled={removing === url}
                      title="Eliminar"
                    >
                      {removing === url ? '...' : '🗑'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="promo-gallery-footer">
              <button className="btn" onClick={downloadAll}>⬇ Descargar todas</button>
              <button className="btn" onClick={onClose}>Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
