import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { LogoutButton } from '@/components/auth/LogoutButton';

export async function Navbar() {
  const user = await getCurrentUser();
  const admin = user?.roles.includes('ADMIN');
  return (
    <header className="nav">
      <div className="nav-in">
        <Link href={user ? '/dashboard' : '/'} className="brand" aria-label="ResearchIQ home"><span className="brand-mark">R</span><span>Research<span className="brand-accent">IQ</span></span></Link>
        <nav className="nav-links" aria-label="Main navigation">
          {user ? (
            <>
              <Link href="/dashboard">Dashboard</Link><Link href="/papers">Papers</Link><Link href="/search">Keyword search</Link>
              <Link href="/semantic-search">Semantic search</Link><Link href="/ask">Ask</Link><Link href="/saved">Saved</Link>
              <Link href="/history">History</Link>{admin && <Link href="/admin">Admin</Link>}
            </>
          ) : null}
        </nav>
        <div className="nav-account">
          {user ? (<><span className="nav-user" title={user.email}>{user.fullName}</span><LogoutButton /></>) : (
            <><Link className="btn secondary sm" href="/login">Log in</Link><Link className="btn sm" href="/register">Get started</Link></>
          )}
        </div>
      </div>
    </header>
  );
}
