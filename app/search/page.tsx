import Link from 'next/link';
import { PaperCard } from '@/components/papers/PaperCard';
import { EmptyState, ErrorState, Pagination } from '@/components/ui';
import { requirePageUser } from '@/lib/auth/session';
import { researchiq } from '@/lib/services/researchiq';
import { flat, type SearchParams } from '@/lib/ui/params';
import { searchBodySchema, toFilters } from '@/lib/validation/app';

export const metadata = { title: 'Keyword search' };

export default async function KeywordSearch({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser('search:run');
  const sp = await flat(searchParams);
  const form = (
    <form method="get" className="card grid grid-4" role="search">
      <div style={{ gridColumn: '1 / -1' }}><label htmlFor="q">Keywords</label><input id="q" name="query" maxLength={500} required defaultValue={sp.query ?? ''} placeholder="e.g. transformer attention" /></div>
      <div><label htmlFor="yf">Year from</label><input id="yf" name="yearFrom" type="number" min={1900} max={2100} defaultValue={sp.yearFrom ?? ''} /></div>
      <div><label htmlFor="yt">Year to</label><input id="yt" name="yearTo" type="number" min={1900} max={2100} defaultValue={sp.yearTo ?? ''} /></div>
      <div><label htmlFor="v">Venue</label><input id="v" name="venue" maxLength={200} defaultValue={sp.venue ?? ''} /></div>
      <div className="row" style={{ alignItems: 'flex-end' }}><button className="btn sm">Search</button><Link className="btn secondary sm" href="/search">Clear filters</Link></div>
    </form>
  );
  const head = (
    <><h1>Keyword search</h1>
      <p className="muted">Exact-term full-text search over titles and abstracts (PostgreSQL <code>tsvector</code> ranking). To find passages by meaning, use <Link href="/semantic-search">semantic search</Link>.</p></>
  );
  if (!sp.query) return <div className="stack">{head}{form}</div>;
  const parsed = searchBodySchema.safeParse(sp);
  if (!parsed.success) return <div className="stack">{head}{form}<ErrorState message="Your search contains invalid values." retryHref="/search" /></div>;
  const q = parsed.data;
  try {
    const res = await researchiq.searchPapers(user, { query: q.query, filters: toFilters(q), page: q.page, pageSize: q.pageSize });
    return (
      <div className="stack">{head}{form}
        <h2>Search results</h2><p className="small muted">{res.total} results for “{q.query}”, ranked by relevance</p>
        {res.items.length === 0 ? <EmptyState title="No results">Try different or fewer keywords, or use semantic search.</EmptyState> : (
          <div className="stack">{res.items.map((h) => <PaperCard key={h.paperId} paperId={h.paperId} title={h.title} authors={h.authors} publicationYear={h.publicationYear} venue={h.venue} snippet={h.snippet} rank={h.rank} />)}</div>)}
        <Pagination basePath="/search" params={{ query: q.query, yearFrom: sp.yearFrom, yearTo: sp.yearTo, venue: sp.venue }} page={res.page} totalPages={res.totalPages} />
      </div>
    );
  } catch {
    return <div className="stack">{head}{form}<ErrorState message="Search failed." retryHref={`/search?query=${encodeURIComponent(q.query)}`} /></div>;
  }
}
