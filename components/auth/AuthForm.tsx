'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Field } from '@/components/ui';

type Mode = 'login' | 'register';
interface ApiError { error?: { message?: string; details?: { path: string; message: string }[] } }

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null); setFields({});
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const res = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = (await res.json()) as ApiError;
      if (!res.ok) {
        setError(json.error?.message ?? 'Authentication failed.');
        setFields(Object.fromEntries((json.error?.details ?? []).map((d) => [d.path, d.message])));
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={busy}>
      {error && <div className="alert err" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}
      {mode === 'register' && <Field label="Full name" name="fullName" autoComplete="name" required error={fields.fullName} />}
      <Field label="Email" name="email" type="email" autoComplete="email" required error={fields.email} />
      <Field label="Password" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required error={fields.password} />
      {mode === 'register' && <Field label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" required error={fields.confirmPassword} />}
      {mode === 'register' && <p className="small muted">At least 10 characters with upper case, lower case and a digit.</p>}
      <button className="btn" type="submit" disabled={busy}>{busy ? (mode === 'login' ? 'Signing in...' : 'Creating account...') : mode === 'login' ? 'Log in' : 'Create account'}</button>
    </form>
  );
}
