import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SaveButton } from '@/components/papers/SaveButton';
import { SemanticSearchClient } from '@/components/semantic/SemanticSearchClient';
import { Badge, Card, ErrorState, statusTone } from '@/components/ui';
import { requirePageUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { isPaperSaved } from '@/lib/services/library';
import { researchiq } from '@/lib/services/researchiq';
import type { PaperDetail } from '@/lib/types';
import { uuidSchema } from '@/lib/validation/schemas';

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser('papers:read');
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  let paper: PaperDetail, saved: boolean;
  try {
    paper = await researchiq.getPaper(id);
    saved = await isPaperSaved(user.id, id);
  } catch (err) {
    if (err instanceof AppError && err.code === 'NOT_FOUND') notFound();
    return <ErrorState message="Unable to load paper." retryHref={`/papers/${id}`} />;
  }
  const ready = paper.processingStatus === 'COMPLETED';
  return (
    <div className="stack">
      <p><Link href="/papers">← Paper library</Link></p>
      <div className="row spread"><h1>{paper.title}</h1><SaveButton paperId={paper.paperId} initiallySaved={saved} /></div>
      <div className="row"><Badge tone={statusTone(paper.processingStatus)}>{paper.processingStatus.toLowerCase()}</Badge>
        {paper.categories.map((c) => <Badge key={c.categoryId}>{c.name}</Badge>)}</div>
      <Card>
        <p className="muted">{paper.authors.map((a) => a.name).join(', ') || 'Unknown authors'}</p>
        <dl className="small" style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '.25rem 1rem', margin: 0 }}>
          <dt className="muted">Year</dt><dd style={{ margin: 0 }}>{paper.publicationYear ?? 'n/a'}</dd>
          <dt className="muted">Venue</dt><dd style={{ margin: 0 }}>{paper.venue ?? 'n/a'}</dd>
          <dt className="muted">DOI</dt><dd style={{ margin: 0 }}>{paper.doi ?? 'n/a'}</dd>
          <dt className="muted">URL</dt><dd style={{ margin: 0 }}>{paper.url ? <a href={paper.url} rel="noopener noreferrer nofollow" target="_blank">{paper.url}</a> : 'n/a'}</dd>
          <dt className="muted">Indexed passages</dt><dd style={{ margin: 0 }}>{paper.stats.embeddedChunkCount} of {paper.stats.chunkCount}</dd>
          <dt className="muted">Saved by</dt><dd style={{ margin: 0 }}>{paper.stats.timesSaved} researchers</dd>
        </dl>
      </Card>
      <Card><h2>Abstract</h2><p>{paper.abstract ?? 'No abstract available.'}</p></Card>
      <Card><h2>Find evidence in this paper</h2>
        {ready ? <SemanticSearchClient paperId={paper.paperId} placeholder="What does this paper say about…?" /> : <p className="muted">Evidence search is available once processing completes.</p>}</Card>
    </div>
  );
}
