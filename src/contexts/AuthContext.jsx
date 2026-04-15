import { createContext, useContext, useEffect, useState } from 'react';
import { getSession, onAuthChange } from '../lib/auth.js';
import { supabaseReady } from '../supabase.js';

const AuthContext = createContext({ session: null, loading: true });

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabaseReady()) {
      setLoading(false);
      return;
    }
    let active = true;
    getSession()
      .then(s => { if (active) setSession(s); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });

    const unsub = onAuthChange((s) => {
      if (active) setSession(s);
    });

    return () => { active = false; unsub(); };
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, user: session?.user || null }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
