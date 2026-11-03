'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { requestLogout } from '@/lib/ui/actions';

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span>
      <button
        type="button"
        className="btn secondary sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await requestLogout();
            router.replace('/login');
            router.refresh();
          } catch {
            setError('Could not log out. Please try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Signing out...' : 'Log out'}
      </button>
      {error && <span className="field-err" role="alert">{error}</span>}
    </span>
  );
}
