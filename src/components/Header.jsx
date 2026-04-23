import { useState, useRef, useEffect } from 'react';
import { signOut } from '../lib/auth.js';

export default function Header({ ui, setUi, onAdd, user }) {
  const tabs = [
    { k: 'all', label: 'Todos' },
    { k: 'available', label: 'Disponibles' },
    { k: 'sold', label: 'Vendidos' },
  ];
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const initials = (user?.email || '?').slice(0, 2).toUpperCase();

  const handleSignOut = async () => {
    setMenuOpen(false);
    try { await signOut(); } catch {}
  };

  return (
    <header className="app-header">
      <div className="wrap topbar">
        <div className="logo"><span className="picked-text">PICKED</span><span className="picked-star">*</span></div>
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
        {user && (
          <div className="user-menu" ref={menuRef}>
            <button
              className={'user-trigger' + (menuOpen ? ' open' : '')}
              onClick={() => setMenuOpen(o => !o)}
              title={user.email}
            >
              <span className="user-avatar-inline">{initials}</span>
              <svg className="user-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {menuOpen && (
              <div className="user-dropdown">
                <div className="user-email">{user.email}</div>
                <div className="user-divider" />
                <button className="user-item" onClick={handleSignOut}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, verticalAlign: -3 }}>
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
