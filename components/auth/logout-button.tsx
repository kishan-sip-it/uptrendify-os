'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';

export function LogoutButton() {
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    setSigningOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setSigningOut(false);
      window.location.href = '/login';
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={signingOut}
      className="nav-item"
      style={{ border: 0, background: 'transparent', cursor: signingOut ? 'wait' : 'pointer', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
    >
      <LogOut size={15} />
      {signingOut ? 'Signing out…' : 'Sign out'}
    </button>
  );
}