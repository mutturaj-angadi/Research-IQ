'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Card, Spinner } from '@/components/ui';
import { EvidenceCard } from '@/components/evidence/EvidenceCard';
import type { AskResponse } from '@/lib/types';

const NO_EVIDENCE = 'ResearchIQ could not find sufficient evidence to answer this question confidently.';

export function AskClient() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<AskResponse | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const question = String(new FormData(e.currentTarget).get('question') ?? '').trim();
    if (question.length < 3) return;
    setBusy(true); setError(null); setRes(null);
    try {
      const r = await fetch('/api/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error?.message ?? 'Unable to answer this question.');
      setRes(json.data as AskResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to answer this question.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="pipeline" aria-label="How it works"><span className="step">Question</span><span className="arrow">→</span><span className="step">Semantic retrieval</span><span className="arrow">→</span><span className="step">Evidence</span><span className="arrow">→</span><span className="step">AI answer</span><span className="arrow">→</span><span className="step">Cited evidence</span></div>
      <form onSubmit={submit} aria-busy={busy}>
        <label htmlFor="question">Your research question</label>
        <textarea id="question" name="question" required minLength={3} maxLength={2000} placeholder="e.g. What techniques improve the factual accuracy of retrieval-augmented generation?" />
        <p style={{ marginTop: '.75rem' }}><button className="btn" disabled={busy}>{busy ? 'Analysing...' : 'Ask ResearchIQ'}</button></p>
      </form>
      {busy && <Spinner label="ResearchIQ is analyzing evidence..." />}
      {error && <div className="alert err" role="alert">{error}</div>}
      {res && res.status === 'ANSWERED' && (
        <>
          <Card className="answer"><h2>Answer</h2><p style={{ whiteSpace: 'pre-wrap' }}>{res.answer}</p><p className="small muted">Generated only from the passages below. Verify against the source papers.</p></Card>
          <section aria-label="Evidence" className="stack"><h2>Evidence ({res.evidence.length})</h2>{res.evidence.map((ev) => <EvidenceCard key={ev.chunkId} item={ev} />)}</section>
          <details className="card"><summary>How this answer was generated</summary>
            <ol className="small"><li>Your question was converted into an embedding vector.</li><li>pgvector compared it with stored passage embeddings by cosine similarity.</li><li>The top {res.evidence.length} passages above the relevance threshold were selected.</li><li>The language model was asked to answer using only those passages.</li><li>The question, answer and evidence ranking were stored in your history.</li></ol></details>
        </>
      )}
      {res && res.status === 'NO_EVIDENCE' && <div className="alert warn" role="status"><strong>{NO_EVIDENCE}</strong><p className="small" style={{ margin: '.4rem 0 0' }}>Try rephrasing, or check the <Link href="/papers">paper library</Link> for relevant coverage.</p></div>}
      {res && res.status === 'FAILED' && <div className="alert err" role="alert">The answer service is unavailable right now. Please try again later.</div>}
    </div>
  );
}
