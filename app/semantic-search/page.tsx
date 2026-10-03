import Link from 'next/link';
import { SemanticSearchClient } from '@/components/semantic/SemanticSearchClient';
import { requirePageUser } from '@/lib/auth/session';

export const metadata = { title: 'Semantic search' };

export default async function SemanticPage() {
  await requirePageUser('search:run');
  return (
    <div className="stack">
      <div><h1>Semantic search</h1>
        <p className="muted">Describe an idea in your own words. ResearchIQ compares the <em>meaning</em> of your text with every indexed passage (vector similarity), so relevant passages are found even when they use different words. For exact terms, use <Link href="/search">keyword search</Link>.</p></div>
      <SemanticSearchClient />
    </div>
  );
}
