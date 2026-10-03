import Link from 'next/link';
import type { SemanticSearchResult } from '@/lib/types';

export function ResultCard({ r, index }: { r: SemanticSearchResult; index: number }) {
  return (
    <article className="card">
      <div className="row spread">
        <h3>{index}. <Link href={`/papers/${r.paperId}`}>{r.paperTitle}</Link></h3>
        <span className="badge ok">similarity {(r.similarity * 100).toFixed(1)}%</span>
      </div>
      <p className="small muted">
        {[r.authors.join(', '), r.publicationYear, r.venue].filter(Boolean).join(' · ')}
        {' · '}Section: {r.section ?? 'not detected'} · Page: {r.pageNumber ?? 'n/a'}
      </p>
      <blockquote className="snippet" style={{ margin: 0 }}>{r.snippet}</blockquote>
      <p style={{ marginTop: '.6rem', marginBottom: 0 }}><Link className="btn secondary sm" href={`/papers/${r.paperId}`}>Open paper</Link></p>
    </article>
  );
}
