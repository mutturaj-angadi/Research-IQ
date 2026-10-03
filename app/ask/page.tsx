import { AskClient } from '@/components/qa/AskClient';
import { requirePageUser } from '@/lib/auth/session';

export const metadata = { title: 'Ask ResearchIQ' };

export default async function AskPage() {
  await requirePageUser('qa:ask');
  return <div className="stack"><div><h1>Ask ResearchIQ</h1><p className="muted">Ask a research question. Answers are built only from passages retrieved from the paper library, and every source is shown.</p></div><AskClient /></div>;
}
