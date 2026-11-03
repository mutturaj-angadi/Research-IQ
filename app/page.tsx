import Link from 'next/link';

export default function Landing() {
  return (
    <div className="landing stack">
      <section className="hero hero-panel">
        <div className="hero-copy">
          <span className="eyebrow"><span className="eyebrow-dot" /> RESEARCH WORKSPACE</span>
          <h1>Turn research into <span className="hero-highlight">clear answers.</span></h1>
          <p>Search academic papers by meaning, explore the evidence, and ask questions with citations you can verify.</p>
          <div className="row hero-actions">
            <Link className="btn" href="/register">Create your workspace <span aria-hidden="true">→</span></Link>
            <Link className="btn secondary" href="/login">Sign in</Link>
          </div>
          <div className="hero-trust"><span>Evidence you can inspect</span><span>PostgreSQL + pgvector</span><span>Researcher accounts</span></div>
        </div>
        <div className="hero-visual" aria-label="Research answer workflow">
          <div className="visual-top"><span className="visual-kicker">FROM QUESTION TO EVIDENCE</span><span className="visual-status"><i /> READY</span></div>
          <div className="visual-question"><span className="visual-number">01</span><div><small>YOUR QUESTION</small><strong>What does the literature show?</strong></div></div>
          <div className="visual-connector" />
          <div className="visual-evidence"><span className="evidence-icon">≋</span><div><small>RETRIEVED PASSAGES</small><strong>Relevant sections from your papers</strong><span className="evidence-lines"><i /><i /><i /></span></div></div>
          <div className="visual-connector" />
          <div className="visual-answer"><span className="answer-check">✓</span><div><small>GROUNDED RESPONSE</small><strong>Answer with source citations</strong></div><span className="citation-pill">Citations</span></div>
          <div className="visual-caption">Trace every answer back to its research source.</div>
        </div>
      </section>
      <section className="feature-section" aria-label="ResearchIQ capabilities">
        <div className="section-heading"><span className="eyebrow">A BETTER WAY TO REVIEW</span><h2>From a growing library to a grounded answer.</h2><p>ResearchIQ connects discovery, retrieval, and evidence in one focused workspace.</p></div>
        <div className="grid grid-3 feature-grid">
          <article className="card feature-card"><span className="feature-icon">⌕</span><span className="feature-index">01 / DISCOVER</span><h3>Search by meaning</h3><p className="muted">Combine precise keyword search with semantic retrieval to find relevant work even when terminology differs.</p><Link href="/register">Explore the library <span aria-hidden="true">→</span></Link></article>
          <article className="card feature-card"><span className="feature-icon">▤</span><span className="feature-index">02 / UNDERSTAND</span><h3>Read the evidence</h3><p className="muted">Review the passages, paper details, and page references that support a research question.</p><Link href="/register">See how it works <span aria-hidden="true">→</span></Link></article>
          <article className="card feature-card"><span className="feature-icon">✳</span><span className="feature-index">03 / SYNTHESIZE</span><h3>Ask with confidence</h3><p className="muted">Get answers grounded in retrieved sources, with citations that lead back to their paper passages.</p><Link href="/register">Start asking <span aria-hidden="true">→</span></Link></article>
        </div>
      </section>
      <section className="closing-banner"><div><span className="eyebrow">YOUR RESEARCH, CONNECTED</span><h2>Make the next discovery easier.</h2><p>Create an account to search papers and explore evidence.</p></div><Link className="btn" href="/register">Get started <span aria-hidden="true">→</span></Link></section>
    </div>
  );
}
