import { useEffect, useMemo, useState } from 'react';
import { money, todayStr } from '../lib/utils.js';

export default function SellModal({ item, onClose, onConfirm }) {
  const [price, setPrice] = useState(item.price ?? '');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const qty = Number(item.qty || 1);
  const estimated = useMemo(() => (Number(item.price || 0) - Number(item.cost || 0)) * qty, [item, qty]);
  const real = (Number(price || 0) - Number(item.cost || 0)) * qty;
  const diff = real - estimated;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-bg show" onClick={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <div className="modal">
        <header>
          <h2>Marcar como vendido</h2>
          <button className="close" onClick={onClose}>×</button>
        </header>
        <div className="content">
          <div className="chip">{item.name}{item.brand ? ' — ' + item.brand : ''}</div>
          <div className="row">
            <div className="field">
              <label>Precio real de venta ($)</label>
              <input type="number" min="0" step="0.01" value={price}
                onChange={e => setPrice(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label>Fecha de venta</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Nota (opcional)</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder="Cliente, método de pago..." />
          </div>
          <div className="margin-preview">
            <span>Estimado: <b>{money(estimated)}</b></span>
            <span>Real: <b>{money(real)}</b></span>
            <span style={{ color: diff >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              Diferencia: <b>{(diff >= 0 ? '+' : '') + money(diff)}</b>
            </span>
          </div>
        </div>
        <footer>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-success" disabled={saving} onClick={async () => {
            setSaving(true);
            await onConfirm({ price: Number(price || 0), date, note: note.trim() || null });
            setSaving(false);
          }}>
            {saving ? 'Guardando...' : 'Confirmar venta'}
          </button>
        </footer>
      </div>
    </div>
  );
}
