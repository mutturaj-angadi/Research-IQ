'use client';
import { useState } from 'react';

export function SaveButton({ paperId, initiallySaved }: { paperId: string; initiallySaved: boolean }) {
  const [saved, setSaved] = useState(initiallySaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/saved/${paperId}`, { method: saved ? 'DELETE' : 'PUT' });
      if (!res.ok) throw new Error();
      setSaved(!saved);
    } catch {
      setError('Could not update saved papers.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <span>
      <button className={`btn sm ${saved ? 'secondary' : ''}`} onClick={toggle} disabled={busy} aria-pressed={saved}>
        {busy ? 'Saving...' : saved ? 'Saved ✓ (click to remove)' : 'Save paper'}
      </button>
      {error && <span className="field-err" role="alert"> {error}</span>}
    </span>
  );
}
