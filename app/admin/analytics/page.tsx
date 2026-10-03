import Link from 'next/link';
import { Card, EmptyState, ErrorState } from '@/components/ui';
import { requirePageUser } from '@/lib/auth/session';
import { getAnalytics } from '@/lib/services/library';

export const metadata = { title: 'Analytics' };

const Kv = ({ data }: { data: Record<string, number> }) => Object.keys(data).length === 0 ? <p className="muted small">No data yet.</p> : (
  <ul>{Object.entries(data).map(([k, v]) => <li key={k}>{k.toLowerCase().replace('_', ' ')}: <strong>{v}</strong></li>)}</ul>);

export default async function AdminAnalytics() {
  await requirePageUser('analytics:system');
  try {
    const a = await getAnalytics();
    const max = Math.max(1, ...a.activityByDay.map((d) => d.keyword + d.semantic + d.questions));
    const empty = a.activityByDay.every((d) => d.keyword + d.semantic + d.questions === 0);
    return (
      <div className="stack"><h1>Analytics</h1>
        <div className="grid grid-2">
          <Card><h2>Papers by status</h2><Kv data={a.papersByStatus} /></Card><Card><h2>Users by role</h2><Kv data={a.usersByRole} /></Card>
          <Card><h2>Answers by outcome</h2><Kv data={a.answersByStatus} /></Card>
          <Card><h2>Top categories</h2>{a.topCategories.length === 0 ? <p className="muted small">No categories.</p> : <ul>{a.topCategories.map((c) => <li key={c.name}>{c.name}: <strong>{c.papers}</strong></li>)}</ul>}</Card>
        </div>
        <Card><h2>Activity, last 14 days</h2>
          {empty ? <EmptyState title="No activity yet" /> : (
            <div className="table-wrap"><table><thead><tr><th>Day</th><th>Keyword</th><th>Semantic</th><th>Questions</th><th><span className="sr-only">Volume</span></th></tr></thead>
              <tbody>{a.activityByDay.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.keyword}</td><td>{d.semantic}</td><td>{d.questions}</td><td style={{ width: '35%' }}><div className="bar" style={{ width: `${((d.keyword + d.semantic + d.questions) / max) * 100}%` }} aria-hidden="true" /></td></tr>)}</tbody></table></div>)}
        </Card>
        <div className="grid grid-2">
          <Card><h2>Most retrieved papers</h2>{a.mostRetrievedPapers.length === 0 ? <p className="muted small">No searches yet.</p> : <ol>{a.mostRetrievedPapers.map((p) => <li key={p.paperId}><Link href={`/papers/${p.paperId}`}>{p.title}</Link> ({p.retrievals})</li>)}</ol>}</Card>
          <Card><h2>Most cited as evidence</h2>{a.mostCitedPapers.length === 0 ? <p className="muted small">No answers yet.</p> : <ol>{a.mostCitedPapers.map((p) => <li key={p.paperId}><Link href={`/papers/${p.paperId}`}>{p.title}</Link> ({p.citations})</li>)}</ol>}</Card>
        </div>
      </div>
    );
  } catch {
    return <ErrorState message="Unable to load analytics." retryHref="/admin/analytics" />;
  }
}
