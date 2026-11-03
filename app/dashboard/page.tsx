import Link from 'next/link';
import { Card, EmptyState, ErrorState } from '@/components/ui';
import { requirePageUser } from '@/lib/auth/session';
import { getDashboard, type DashboardData } from '@/lib/services/library';
import { flat, fmtDate, type SearchParams } from '@/lib/ui/params';

export const metadata = { title: 'Dashboard' };

const Stat = ({ label, value }: { label: string; value: number }) => (
  <Card className="metric-card"><div className="metric-value">{value}</div><div className="muted small">{label}</div></Card>
);

export default async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser('dashboard:own');
  const sp = await flat(searchParams);
  let d: DashboardData;
  try {
    d = await getDashboard(user.id, user.roles.includes('ADMIN'));
  } catch {
    return <ErrorState message="Unable to load your dashboard." retryHref="/dashboard" />;
  }
  return (
    <div className="stack dashboard-page">
      <header className="page-heading">
        <div><span className="eyebrow">YOUR RESEARCH OVERVIEW</span><h1>Welcome back, {user.fullName}</h1><p>Pick up where you left off or explore your paper library.</p></div>
        <div className="row"><Link className="btn secondary" href="/papers">Browse papers</Link><Link className="btn" href="/ask">Ask ResearchIQ <span aria-hidden="true">→</span></Link></div>
      </header>
      {sp.denied && <div className="alert warn" role="alert">You do not have permission to access that page.</div>}
      <section className="grid grid-4" aria-label="Library">
        <Stat label="Papers in library" value={d.totals.papers} /><Stat label="Completed papers" value={d.totals.completedPapers} />
        <Stat label="Your saved papers" value={d.mine.saved} /><Stat label="Your keyword searches" value={d.mine.keywordSearches} />
        <Stat label="Your semantic searches" value={d.mine.semanticSearches} /><Stat label="Questions you asked" value={d.mine.questions} />
      </section>
      {d.system && (
        <section className="grid grid-4" aria-label="System">
          <Stat label="Users" value={d.system.users} /><Stat label="Searches (7 days)" value={d.system.searches7d} />
          <Stat label="Questions (7 days)" value={d.system.questions7d} /><Stat label="Failed papers" value={d.system.failedPapers} />
        </section>
      )}
      <div className="grid grid-2">
        <Card><h2>Recent searches</h2>
          {d.recentSearches.length === 0 ? <EmptyState title="No searches yet">Try a <Link href="/semantic-search">semantic search</Link>.</EmptyState> : (
            <ul>{d.recentSearches.map((s) => <li key={s.id}>{s.text} <span className="badge">{s.type.toLowerCase()}</span> <span className="small muted">{fmtDate(s.createdAt)}</span></li>)}</ul>)}
        </Card>
        <Card><h2>Recent questions</h2>
          {d.recentQuestions.length === 0 ? <EmptyState title="No questions yet">Head to <Link href="/ask">Ask ResearchIQ</Link>.</EmptyState> : (
            <ul>{d.recentQuestions.map((q) => <li key={q.id}><Link href={`/questions/${q.id}`}>{q.text}</Link> <span className="small muted">{fmtDate(q.createdAt)}</span></li>)}</ul>)}
        </Card>
      </div>
    </div>
  );
}
