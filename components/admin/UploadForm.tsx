'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export function UploadForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get('file');
    if (!(file instanceof File) || file.size === 0) return setMsg({ ok: false, text: 'Choose a PDF file.' });
    if (file.type !== 'application/pdf') return setMsg({ ok: false, text: 'Only PDF files are accepted.' });
    for (const [k, v] of [...data.entries()]) if (typeof v === 'string' && v.trim() === '') data.delete(k);
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/papers', { method: 'POST', body: data });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Upload failed.');
      const r = json.data as { outcome: string; chunkCount: number };
      setMsg({ ok: true, text: r.outcome === 'DUPLICATE' ? 'This paper is already in the library (duplicate detected).' : `Processed successfully: ${r.chunkCount} passages indexed.` });
      form.reset();
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Upload failed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card stack" aria-busy={busy}>
      <h2>Upload a paper</h2>
      <div><label htmlFor="file">PDF file (max 20 MB)</label><input id="file" name="file" type="file" accept="application/pdf,.pdf" required /></div>
      <div className="grid grid-2">
        <div><label htmlFor="title">Title (optional, detected if empty)</label><input id="title" name="title" maxLength={1000} /></div>
        <div><label htmlFor="authors">Authors (comma separated)</label><input id="authors" name="authors" maxLength={2000} /></div>
        <div><label htmlFor="categories">Categories (comma separated)</label><input id="categories" name="categories" maxLength={1000} /></div>
        <div><label htmlFor="venue">Venue</label><input id="venue" name="venue" maxLength={300} /></div>
        <div><label htmlFor="year">Publication year</label><input id="year" name="publicationYear" type="number" min={1900} max={2100} /></div>
      </div>
      <div><button className="btn" disabled={busy}>{busy ? 'Uploading and processing...' : 'Upload and process'}</button></div>
      {busy && <p className="muted small" role="status">Extracting text and generating embeddings. This can take a minute.</p>}
      {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</div>}
    </form>
  );
}
