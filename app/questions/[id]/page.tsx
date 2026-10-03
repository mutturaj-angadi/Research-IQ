import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { EvidenceCard } from '@/components/evidence/EvidenceCard';
import { Card, ErrorState } from '@/components/ui';
import { requirePageUser } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { getQuestion } from '@/lib/services/library';
import { researchiq } from '@/lib/services/researchiq';
import { fmtDate } from '@/lib/ui/params';
import { uuidSchema } from '@/lib/validation/schemas';

export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser('history:read-own');
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  try {
    const q = await getQuestion(id, user.id, user.roles.includes('ADMIN'));
    const evidence = q.status === 'ANSWERED' && q.answerId ? await researchiq.getAnswerEvidence(user, q.answerId) : [];
    return (
      <div className="stack">
        <p><Link href="/history?kind=QUESTION">← History</Link></p>
        <h1>{q.question}</h1><p className="small muted">Asked {fmtDate(q.createdAt)}</p>
        {q.status === 'ANSWERED' ? (<>
          <Card className="answer"><h2>Answer</h2><p style={{ whiteSpace: 'pre-wrap' }}>{q.answer}</p></Card>
          <h2>Evidence ({evidence.length})</h2>{evidence.map((e) => <EvidenceCard key={e.chunkId} item={e} />)}
        </>) : q.status === 'NO_EVIDENCE'
          ? <div className="alert warn">ResearchIQ could not find sufficient evidence to answer this question confidently.</div>
          : <div className="alert err">No answer was produced for this question.</div>}
      </div>
    );
  } catch (err) {
    if (err instanceof AppError && err.code === 'NOT_FOUND') notFound();
    if (err instanceof AppError && err.code === 'FORBIDDEN') redirect('/dashboard?denied=1');
    return <ErrorState message="Unable to load this question." retryHref={`/questions/${id}`} />;
  }
}
