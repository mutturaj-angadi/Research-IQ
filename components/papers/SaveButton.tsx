'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { setPaperSaved } from '@/lib/ui/actions';

export function SaveButton({ paperId, initiallySaved }: { paperId: string; initiallySaved: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initiallySaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true); setError(null);
    try {
      const nextSaved = !saved;
      await setPaperSaved(paperId, nextSaved);
      setSaved(nextSaved);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update saved papers. Please try again.');
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
