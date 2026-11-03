import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth/AuthForm';
import { Card } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth/session';

export const metadata = { title: 'Register' };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect('/dashboard');
  return (
    <div className="auth-shell">
      <aside className="auth-aside"><span className="eyebrow">START WITH THE EVIDENCE</span><h2>Make more of every paper you read.</h2><p>Build a searchable research space and move from scattered sources to focused questions.</p><div className="auth-aside-note"><span>01</span> Search across your library <span>02</span> Keep citations in view</div></aside>
      <Card className="auth-card"><span className="eyebrow">CREATE YOUR ACCOUNT</span><h1>Join ResearchIQ</h1><p className="muted auth-intro">Set up your researcher workspace in a moment.</p><AuthForm mode="register" /><p className="small muted auth-switch">Already registered? <Link href="/login">Sign in</Link></p></Card>
    </div>
  );
}
