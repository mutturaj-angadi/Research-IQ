import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth/AuthForm';
import { Card } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth/session';

export const metadata = { title: 'Register' };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect('/dashboard');
  return (
    <div style={{ maxWidth: 420, margin: '2rem auto' }}>
      <Card><h1>Create account</h1><AuthForm mode="register" /><p className="small muted" style={{ marginTop: '1rem' }}>Already registered? <Link href="/login">Log in</Link></p></Card>
    </div>
  );
}
