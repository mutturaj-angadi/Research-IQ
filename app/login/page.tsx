import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth/AuthForm';
import { Card } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth/session';

export const metadata = { title: 'Log in' };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/dashboard');
  return (
    <div className="auth-shell">
      <aside className="auth-aside"><span className="eyebrow">RESEARCH, CONNECTED</span><h2>Your next useful insight is closer than you think.</h2><p>Search papers by meaning, explore the supporting evidence, and keep your research work in one place.</p><div className="auth-aside-note"><span>01</span> A library built for discovery <span>02</span> Answers you can trace to sources</div></aside>
      <Card className="auth-card"><span className="eyebrow">WELCOME BACK</span><h1>Sign in to ResearchIQ</h1><p className="muted auth-intro">Continue to your research workspace.</p><AuthForm mode="login" /><p className="small muted auth-switch">No account yet? <Link href="/register">Create one</Link></p></Card>
    </div>
  );
}
