import { Badge, EmptyState, ErrorState, Pagination } from '@/components/ui';
import { requirePageUser } from '@/lib/auth/session';
import { listUsers } from '@/lib/services/users';
import { flat, fmtDate, type SearchParams } from '@/lib/ui/params';
import { paginationSchema } from '@/lib/validation/schemas';

export const metadata = { title: 'Users' };

export default async function AdminUsers({ searchParams }: { searchParams: SearchParams }) {
  await requirePageUser('users:read');
  const p = paginationSchema.safeParse(await flat(searchParams));
  try {
    const res = await listUsers(p.success ? p.data : {});
    return (
      <div className="stack"><h1>Users ({res.total})</h1>
        {res.items.length === 0 ? <EmptyState title="No users" /> : (
          <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>{res.items.map((u) => <tr key={u.id}><td>{u.fullName}</td><td>{u.email}</td><td>{u.roles.map((r) => <Badge key={r}>{r.toLowerCase()}</Badge>)}</td>
              <td><Badge tone={u.isActive ? 'ok' : 'err'}>{u.isActive ? 'active' : 'disabled'}</Badge></td><td>{fmtDate(u.createdAt)}</td></tr>)}</tbody></table></div>)}
        <Pagination basePath="/admin/users" params={{}} page={res.page} totalPages={res.totalPages} />
      </div>
    );
  } catch {
    return <ErrorState message="Unable to load users." retryHref="/admin/users" />;
  }
}
