import { CategoryManager } from '@/components/admin/CategoryManager';
import { ErrorState } from '@/components/ui';
import { requirePageUser } from '@/lib/auth/session';
import { researchiq } from '@/lib/services/researchiq';

export const metadata = { title: 'Categories' };

export default async function AdminCategories() {
  await requirePageUser('categories:manage');
  try {
    const res = await researchiq.listCategories({ pageSize: 50 });
    return <div className="stack"><h1>Categories</h1><CategoryManager categories={res.items} />{res.totalPages > 1 && <p className="small muted">Showing the first 50 of {res.total} categories.</p>}</div>;
  } catch {
    return <ErrorState message="Unable to load categories." retryHref="/admin/categories" />;
  }
}
