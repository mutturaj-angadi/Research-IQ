import Link from 'next/link';
import { Badge, Card, statusTone } from '@/components/ui';

export interface PaperCardProps {
  paperId: string; title: string; authors: string | string[]; publicationYear: number | null; venue: string | null;
  processingStatus?: string; snippet?: string; rank?: number; extra?: React.ReactNode;
}

export function PaperCard(p: PaperCardProps) {
  const authors = Array.isArray(p.authors) ? p.authors.join(', ') : p.authors;
  return (
    <Card>
      <div className="row spread">
        <h3><Link href={`/papers/${p.paperId}`}>{p.title}</Link></h3>
        <span className="row">{p.rank !== undefined && <Badge>rank {p.rank.toFixed(3)}</Badge>}{p.processingStatus && <Badge tone={statusTone(p.processingStatus)}>{p.processingStatus.toLowerCase()}</Badge>}</span>
      </div>
      <p className="small muted">{[authors || 'Unknown authors', p.publicationYear, p.venue].filter(Boolean).join(' · ')}</p>
      {p.snippet && <p className="snippet">{p.snippet}</p>}
      <div className="row"><Link className="btn secondary sm" href={`/papers/${p.paperId}`}>Open paper</Link>{p.extra}</div>
    </Card>
  );
}
