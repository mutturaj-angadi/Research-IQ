import Link from 'next/link';
import { Card } from '@/components/ui';

export default function Landing() {
  return (
    <div>
      <section className="hero">
        <h1>Find what research actually says.</h1>
        <p>ResearchIQ turns a library of papers into a searchable, question-answering knowledge base. Every answer is grounded in passages retrieved from the papers themselves, with the page and section to check.</p>
        <div className="row" style={{ marginTop: '1rem' }}>
          <Link className="btn" href="/register">Create an account</Link>
          <Link className="btn secondary" href="/login">Log in</Link>
        </div>
      </section>
      <section className="grid grid-2" aria-label="Capabilities">
        <Card><h2>The problem</h2><p className="muted">Keyword search misses papers that use different words for the same idea, and generic AI answers cannot be traced back to a source.</p></Card>
        <Card><h2>Semantic search</h2><p className="muted">Questions and paper passages are converted into vectors and compared with pgvector cosine similarity, so &quot;neural retrieval for question answering&quot; finds relevant text even without matching words.</p></Card>
        <Card><h2>Evidence-grounded Q&amp;A</h2><p className="muted">The answer is generated only from retrieved passages. If the evidence is not strong enough, ResearchIQ says so instead of guessing.</p>
          <div className="pipeline" aria-label="Pipeline"><span className="step">Question</span><span className="arrow">→</span><span className="step">Semantic retrieval</span><span className="arrow">→</span><span className="step">Evidence</span><span className="arrow">→</span><span className="step">Answer</span></div></Card>
        <Card><h2>Built on PostgreSQL</h2><p className="muted">A normalised relational schema, full-text search, vector indexes, transactions, triggers and views, with role-based access for researchers and admins.</p></Card>
      </section>
    </div>
  );
}
