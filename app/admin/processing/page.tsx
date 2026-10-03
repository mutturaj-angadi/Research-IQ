import Link from 'next/link';
import { Badge, Card, EmptyState, ErrorState, Pagination, statusTone } from '@/components/ui';
import { requirePageUser } from '@/lib/auth/session';
import { listProcessing } from '@/lib/services/library';
import { flat, fmtDate, type SearchParams } from '@/lib/ui/params';

export const metadata = { title: 'Processing' };
const STATES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;

export default async function AdminProcessing({ searchParams }: { searchParams: SearchParams }) {
  await requirePageUser('papers:process');
  const sp = await flat(searchParams);
  try {
    const { counts, page } = await listProcessing(sp);
    return (
      <div className="stack"><h1>Processing status</h1>
        <div className="grid grid-4">{STATES.map((s) => <Card key={s}><div className="stat">{counts[s] ?? 0}</div><Link href={`/admin/processing?status=${s}`}>{s.toLowerCase()}</Link></Card>)}</div>
        <p className="small muted">{sp.status ? <>Filtered: {sp.status} · <Link href="/admin/processing">show all</Link></> : 'All papers'}</p>
        {page.items.length === 0 ? <EmptyState title="No papers in this state" /> : (
          <div className="table-wrap"><table><thead><tr><th>Paper</th><th>Status</th><th>Passages</th><th>Uploaded by</th><th>Updated</th><th>Error</th></tr></thead>
            <tbody>{page.items.map((x) => <tr key={x.paperId}><td><Link href={`/papers/${x.paperId}`}>{x.title}</Link></td><td><Badge tone={statusTone(x.status)}>{x.status.toLowerCase()}</Badge></td>
              <td>{x.chunkCount}</td><td>{x.uploadedBy ?? '-'}</td><td>{fmtDate(x.updatedAt)}</td><td className="small">{x.error ?? ''}</td></tr>)}</tbody></table></div>)}
        <Pagination basePath="/admin/processing" params={{ status: sp.status }} page={page.page} totalPages={page.totalPages} />
        <p className="small muted">Failed papers can be re-processed by uploading the same PDF again; the ingestion pipeline resets and retries it.</p>
      </div>
    );
  } catch {
    return <ErrorState message="Unable to load processing status." retryHref="/admin/processing" />;
  }
}
