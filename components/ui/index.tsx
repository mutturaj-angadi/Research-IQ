import Link from 'next/link';
import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function Badge({ children, tone }: { children: ReactNode; tone?: 'ok' | 'warn' | 'err' }) {
  return <span className={`badge ${tone ?? ''}`}>{children}</span>;
}

export const statusTone = (s: string): 'ok' | 'warn' | 'err' | undefined =>
  s === 'COMPLETED' ? 'ok' : s === 'FAILED' ? 'err' : s === 'PROCESSING' || s === 'PENDING' ? 'warn' : undefined;

export function Spinner({ label = 'Loading...' }: { label?: string }) {
  return <span role="status" className="muted"><span className="spinner" aria-hidden="true" /> {label}</span>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3>{children && <p className="small">{children}</p>}</div>;
}

export function ErrorState({ message, retryHref }: { message: string; retryHref?: string }) {
  return (
    <div className="alert err" role="alert">
      <strong>{message}</strong>
      {retryHref && <> <Link href={retryHref}>Try again</Link></>}
    </div>
  );
}

export function Field({ label, name, type = 'text', error, ...rest }: { label: string; name: string; type?: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `f-${name}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-err` : undefined} {...rest} />
      {error && <div id={`${id}-err`} className="field-err" role="alert">{error}</div>}
    </div>
  );
}

/** Server-side pagination controls built from the current query string. */
export function Pagination({ basePath, params, page, totalPages }: { basePath: string; params: Record<string, string | undefined>; page: number; totalPages: number }) {
  if (totalPages <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    q.set('page', String(p));
    return `${basePath}?${q.toString()}`;
  };
  return (
    <nav className="pager" aria-label="Pagination">
      {page > 1 ? <Link className="btn secondary sm" href={href(page - 1)}>Previous</Link> : <span />}
      <span className="small muted">Page {page} of {totalPages}</span>
      {page < totalPages ? <Link className="btn secondary sm" href={href(page + 1)}>Next</Link> : <span />}
    </nav>
  );
}
