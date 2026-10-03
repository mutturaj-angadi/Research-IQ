import Link from 'next/link';
export default function NotFound() {
  return <div className="empty"><h2>Page not found</h2><p><Link href="/">Back to ResearchIQ</Link></p></div>;
}
