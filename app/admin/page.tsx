import { Card, ErrorState } from '@/components/ui';
import { requirePageUser } from '@/lib/auth/session';
import { getAnalytics, getDashboard } from '@/lib/services/library';

export const metadata = { title: 'Admin' };

export default async function AdminHome() {
  const user = await requirePageUser('analytics:system');
  try {
    const [d, a] = await Promise.all([getDashboard(user.id, true), getAnalytics()]);
    const s = d.system!;
    return (
      <div className="stack"><h1>Admin overview</h1>
        <div className="grid grid-4">
          {([['Users', s.users], ['Papers', d.totals.papers], ['Completed', a.papersByStatus.COMPLETED ?? 0], ['Failed', s.failedPapers],
            ['Pending / processing', (a.papersByStatus.PENDING ?? 0) + (a.papersByStatus.PROCESSING ?? 0)], ['Searches (7d)', s.searches7d], ['Questions (7d)', s.questions7d]] as [string, number][])
            .map(([l, v]) => <Card key={l}><div className="stat">{v}</div><div className="muted small">{l}</div></Card>)}
        </div>
      </div>
    );
  } catch {
    return <ErrorState message="Unable to load admin overview." retryHref="/admin" />;
  }
}
