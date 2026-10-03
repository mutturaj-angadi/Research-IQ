import Link from 'next/link';
import { UploadForm } from '@/components/admin/UploadForm';
import { Badge, EmptyState, ErrorState, Pagination, statusTone } from '@/components/ui';
import { requirePageUser } from '@/lib/auth/session';
import { researchiq } from '@/lib/services/researchiq';
import { flat, type SearchParams } from '@/lib/ui/params';
import { paginationSchema } from '@/lib/validation/schemas';

export const metadata = { title: 'Manage papers' };

export default async function AdminPapers({ searchParams }: { searchParams: SearchParams }) {
  await requirePageUser('papers:upload');
  const p = paginationSchema.safeParse(await flat(searchParams));
  try {
    const res = await researchiq.listPapers(p.success ? p.data : {});
    return (
      <div className="stack"><h1>Manage papers</h1><UploadForm />
        <h2>Library ({res.total})</h2>
        {res.items.length === 0 ? <EmptyState title="No papers yet">Upload a PDF above to get started.</EmptyState> : (
          <div className="table-wrap"><table><thead><tr><th>Title</th><th>Year</th><th>Status</th><th>Passages</th></tr></thead>
            <tbody>{res.items.map((x) => <tr key={x.paperId}><td><Link href={`/papers/${x.paperId}`}>{x.title}</Link></td><td>{x.publicationYear ?? '-'}</td>
              <td><Badge tone={statusTone(x.processingStatus)}>{x.processingStatus.toLowerCase()}</Badge></td><td>{x.chunkCount}</td></tr>)}</tbody></table></div>)}
        <Pagination basePath="/admin/papers" params={{}} page={res.page} totalPages={res.totalPages} />
      </div>
    );
  } catch {
    return <ErrorState message="Unable to load papers." retryHref="/admin/papers" />;
  }
}
