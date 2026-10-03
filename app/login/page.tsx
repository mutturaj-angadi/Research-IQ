import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth/AuthForm';
import { Card } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth/session';

export const metadata = { title: 'Log in' };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/dashboard');
  return (
    <div style={{ maxWidth: 420, margin: '2rem auto' }}>
      <Card><h1>Log in</h1><AuthForm mode="login" /><p className="small muted" style={{ marginTop: '1rem' }}>No account? <Link href="/register">Register</Link></p></Card>
    </div>
  );
}
