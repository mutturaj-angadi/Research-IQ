import Link from 'next/link';
import { PaperCard } from '@/components/papers/PaperCard';
import { EmptyState, ErrorState, Pagination } from '@/components/ui';
import { requirePageUser } from '@/lib/auth/session';
import { researchiq } from '@/lib/services/researchiq';
import { flat, type SearchParams } from '@/lib/ui/params';
import { paperListQuerySchema, toFilters } from '@/lib/validation/app';

export const metadata = { title: 'Paper library' };

export default async function Papers({ searchParams }: { searchParams: SearchParams }) {
  await requirePageUser('papers:read');
  const sp = await flat(searchParams);
  const parsed = paperListQuerySchema.safeParse(sp);
  if (!parsed.success) return <ErrorState message="Some filters are invalid." retryHref="/papers" />;
  const q = parsed.data;
  try {
    const [list, cats] = await Promise.all([
      researchiq.listPapers({ page: q.page, pageSize: q.pageSize }, toFilters(q)),
      researchiq.listCategories({ pageSize: 50 }),
    ]);
    return (
      <div className="stack">
        <h1>Paper library</h1>
        <form method="get" className="card grid grid-4" aria-label="Filters">
          <div><label htmlFor="yf">Year from</label><input id="yf" name="yearFrom" type="number" min={1900} max={2100} defaultValue={sp.yearFrom ?? ''} /></div>
          <div><label htmlFor="yt">Year to</label><input id="yt" name="yearTo" type="number" min={1900} max={2100} defaultValue={sp.yearTo ?? ''} /></div>
          <div><label htmlFor="v">Venue</label><input id="v" name="venue" maxLength={200} defaultValue={sp.venue ?? ''} /></div>
          <div><label htmlFor="c">Category</label>
            <select id="c" name="categoryId" defaultValue={sp.categoryId ?? ''}><option value="">All</option>{cats.items.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.name} ({c.paperCount})</option>)}</select></div>
          <div className="row" style={{ alignItems: 'flex-end' }}><button className="btn sm">Apply</button><Link className="btn secondary sm" href="/papers">Clear filters</Link></div>
        </form>
        <p className="small muted">{list.total} papers · newest first</p>
        {list.items.length === 0 ? <EmptyState title="No papers found">Adjust the filters, or ask an admin to upload papers.</EmptyState> : (
          <div className="stack">{list.items.map((p) => <PaperCard key={p.paperId} {...p} />)}</div>)}
        <Pagination basePath="/papers" params={{ yearFrom: sp.yearFrom, yearTo: sp.yearTo, venue: sp.venue, categoryId: sp.categoryId }} page={list.page} totalPages={list.totalPages} />
      </div>
    );
  } catch {
    return <ErrorState message="Unable to load papers." retryHref="/papers" />;
  }
}
