import Link from 'next/link';
import { Badge, EmptyState, ErrorState, Pagination } from '@/components/ui';
import { requirePageUser } from '@/lib/auth/session';
import { listHistoryByKind, type HistoryKind } from '@/lib/services/library';
import { flat, fmtDate, type SearchParams } from '@/lib/ui/params';
import { paginationSchema } from '@/lib/validation/schemas';

export const metadata = { title: 'History' };

const TABS: { kind: HistoryKind; label: string }[] = [{ kind: 'KEYWORD', label: 'Keyword searches' }, { kind: 'SEMANTIC', label: 'Semantic searches' }, { kind: 'QUESTION', label: 'Questions' }];

export default async function History({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser('history:read-own');
  const sp = await flat(searchParams);
  const kind = (TABS.find((t) => t.kind === sp.kind)?.kind ?? 'KEYWORD') as HistoryKind;
  const paging = paginationSchema.safeParse(sp);
  try {
    const res = await listHistoryByKind(user.id, kind, paging.success ? paging.data : {});
    return (
      <div className="stack"><h1>Your history</h1>
        <nav className="row" aria-label="History type">{TABS.map((t) => <Link key={t.kind} className={`btn sm ${t.kind === kind ? '' : 'secondary'}`} aria-current={t.kind === kind ? 'page' : undefined} href={`/history?kind=${t.kind}`}>{t.label}</Link>)}</nav>
        {res.items.length === 0 ? <EmptyState title="Nothing here yet">Your {TABS.find((t) => t.kind === kind)?.label.toLowerCase()} will appear here.</EmptyState> : (
          <div className="table-wrap"><table><thead><tr><th>{kind === 'QUESTION' ? 'Question' : 'Query'}</th><th>When</th><th>{kind === 'QUESTION' ? 'Evidence' : 'Results'}</th><th>{kind === 'QUESTION' ? 'Status' : 'Filters'}</th></tr></thead>
            <tbody>{res.items.map((h) => (
              <tr key={h.id}><td>{kind === 'QUESTION' ? <Link href={`/questions/${h.id}`}>{h.text}</Link> : h.text}</td><td>{fmtDate(h.createdAt)}</td><td>{h.resultCount ?? '-'}</td>
                <td>{h.status ? <Badge tone={h.status === 'ANSWERED' ? 'ok' : h.status === 'FAILED' ? 'err' : 'warn'}>{h.status.toLowerCase().replace('_', ' ')}</Badge> : h.filters && Object.keys(h.filters).length ? <code className="small">{JSON.stringify(h.filters)}</code> : <span className="muted">none</span>}</td></tr>))}</tbody></table></div>)}
        <Pagination basePath="/history" params={{ kind }} page={res.page} totalPages={res.totalPages} />
      </div>
    );
  } catch {
    return <ErrorState message="Unable to load history." retryHref="/history" />;
  }
}
