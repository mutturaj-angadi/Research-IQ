import Link from 'next/link';
import type { ReactNode } from 'react';
import { requirePageUser } from '@/lib/auth/session';

/** Server-side guard for the whole /admin tree: non-admins are redirected before anything renders. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requirePageUser('users:read');
  return (
    <div className="stack">
      <nav className="admin-tabs" aria-label="Admin"><span className="admin-tabs-label">ADMINISTRATION</span><Link href="/admin">Overview</Link><Link href="/admin/users">Users</Link><Link href="/admin/papers">Papers</Link><Link href="/admin/github">GitHub imports</Link>
        <Link href="/admin/categories">Categories</Link><Link href="/admin/processing">Processing</Link><Link href="/admin/analytics">Analytics</Link></nav>
      {children}
    </div>
  );
}
