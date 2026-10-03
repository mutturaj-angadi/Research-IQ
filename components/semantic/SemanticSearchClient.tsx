'use client';
import { useState, type FormEvent } from 'react';
import { EmptyState, Spinner } from '@/components/ui';
import { ResultCard } from '@/components/semantic/ResultCard';
import type { SemanticSearchResponse } from '@/lib/types';

/** Used for both /semantic-search (all papers) and "Find evidence in this paper" (paperId given). */
export function SemanticSearchClient({ paperId, placeholder }: { paperId?: string; placeholder?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SemanticSearchResponse | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const query = String(new FormData(e.currentTarget).get('query') ?? '').trim();
    if (!query) return;
    setBusy(true); setError(null); setData(null);
    try {
      const res = paperId
        ? await fetch(`/api/papers/${paperId}/evidence?q=${encodeURIComponent(query)}`)
        : await fetch('/api/semantic-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Search failed.');
      setData(json.data as SemanticSearchResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <form onSubmit={submit} className="row" role="search" aria-busy={busy}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <label htmlFor="sem-q" className="sr-only">Describe what you are looking for</label>
          <input id="sem-q" name="query" maxLength={500} required placeholder={placeholder ?? 'How do neural retrieval systems improve question answering?'} />
        </div>
        <button className="btn" disabled={busy}>{busy ? 'Searching...' : paperId ? 'Find evidence' : 'Semantic search'}</button>
      </form>
      {busy && <Spinner label="Generating semantic results..." />}
      {error && <div className="alert err" role="alert">{error}</div>}
      {data && (data.noEvidence || data.results.length === 0
        ? <EmptyState title="No sufficiently relevant passages found">Try rephrasing the question or describing the concept differently.</EmptyState>
        : <section aria-label="Semantic results" className="stack"><p className="small muted">{data.results.length} passages for “{data.query}”, ranked by cosine similarity.</p>
            {data.results.map((r, i) => <ResultCard key={r.chunkId} r={r} index={i + 1} />)}</section>)}
    </div>
  );
}
