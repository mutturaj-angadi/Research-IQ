import { PaperCard } from '@/components/papers/PaperCard';
import { SaveButton } from '@/components/papers/SaveButton';
import { EmptyState, ErrorState, Pagination } from '@/components/ui';
import { requirePageUser } from '@/lib/auth/session';
import { listSavedPapers } from '@/lib/services/library';
import { flat, fmtDate, type SearchParams } from '@/lib/ui/params';
import { paginationSchema } from '@/lib/validation/schemas';

export const metadata = { title: 'Saved papers' };

export default async function Saved({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser('saved:manage');
  const paging = paginationSchema.safeParse(await flat(searchParams));
  try {
    const res = await listSavedPapers(user.id, paging.success ? paging.data : {});
    return (
      <div className="stack"><h1>Saved papers</h1>
        {res.items.length === 0 ? <EmptyState title="No saved papers yet">Open a paper and choose “Save paper”.</EmptyState> : (
          <div className="stack">{res.items.map((p) => <PaperCard key={p.paperId} {...p} extra={<><SaveButton paperId={p.paperId} initiallySaved /><span className="small muted">saved {fmtDate(p.savedAt)}</span></>} />)}</div>)}
        <Pagination basePath="/saved" params={{}} page={res.page} totalPages={res.totalPages} />
      </div>
    );
  } catch {
    return <ErrorState message="Unable to load saved papers." retryHref="/saved" />;
  }
}
