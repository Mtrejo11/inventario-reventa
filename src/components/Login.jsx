import { useState } from 'react';
import { signInWithPassword, signUpWithPassword } from '../lib/auth.js';

export default function Login() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null); setMessage(null);
    if (!email.trim() || !password) {
      setError('Pon email y contraseña');
      return;
    }
    if (mode === 'signup' && password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signInWithPassword(email, password);
        // AuthContext captará el cambio de sesión automáticamente
      } else {
        const { user, session } = await signUpWithPassword(email, password);
        if (!session) {
          setMessage('Cuenta creada. Revisa tu email para confirmar antes de entrar.');
          setMode('signin');
        }
      }
    } catch (e) {
      setError(translateError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">PICKED<span className="picked-star">*</span></div>
        <h1>{mode === 'signin' ? 'Entrar a tu cuenta' : 'Crear cuenta'}</h1>
        <p className="login-sub">
          {mode === 'signin'
            ? 'Accede a tu inventario curado.'
            : 'Regístrate con email y contraseña.'}
        </p>

        <form onSubmit={submit} className="login-form">
          <div className="field">
            <label>Email</label>
            <input
              className="login-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              autoComplete="email"
              autoFocus
              required
            />
          </div>
          <div className="field">
            <label>Contraseña</label>
            <div className="password-wrap">
              <input
                className="login-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Mínimo 8 caracteres' : '••••••••'}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(s => !s)}
                title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && <div className="login-error">{error}</div>}
          {message && <div className="login-message">{message}</div>}

          <button className="btn btn-primary login-submit" disabled={loading}>
            {loading ? 'Procesando...' : (mode === 'signin' ? 'Entrar' : 'Crear cuenta')}
          </button>
        </form>

        <div className="login-switch">
          {mode === 'signin' ? (
            <>¿No tienes cuenta? <button onClick={() => { setMode('signup'); setError(null); setMessage(null); }}>Crear una</button></>
          ) : (
            <>¿Ya tienes cuenta? <button onClick={() => { setMode('signin'); setError(null); setMessage(null); }}>Entrar</button></>
          )}
        </div>
      </div>
    </div>
  );
}

function translateError(e) {
  const m = (e?.message || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email o contraseña incorrectos';
  if (m.includes('user already registered')) return 'Ya existe una cuenta con ese email';
  if (m.includes('email not confirmed')) return 'Email no confirmado. Revisa tu bandeja de entrada';
  if (m.includes('rate limit')) return 'Demasiados intentos. Espera un momento';
  if (m.includes('password') && m.includes('short')) return 'Contraseña muy corta';
  if (m.includes('signup') && m.includes('disabled')) return 'El registro está desactivado. Contacta al admin';
  return e?.message || 'Error inesperado';
}
