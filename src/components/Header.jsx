export default function Header({ ui, setUi, onAdd }) {
  const tabs = [
    { k: 'all', label: 'Todos' },
    { k: 'available', label: 'Disponibles' },
    { k: 'sold', label: 'Vendidos' },
  ];
  return (
    <header className="app-header">
      <div className="wrap topbar">
        <div className="logo">📦 <span>Inventario</span></div>
        <div className="spacer" />
        <div className="tabs">
          {tabs.map(t => (
            <button
              key={t.k}
              className={ui.status === t.k ? 'active' : ''}
              onClick={() => setUi(u => ({ ...u, status: t.k }))}
            >{t.label}</button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={onAdd}>
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Agregar
        </button>
      </div>
    </header>
  );
}
