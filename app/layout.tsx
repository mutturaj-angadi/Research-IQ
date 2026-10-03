import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ResearchIQ', template: '%s | ResearchIQ' },
  description: 'AI-powered research paper intelligence: semantic search and evidence-grounded question answering.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <Navbar />
        <main id="main" className="container">{children}</main>
      </body>
    </html>
  );
}
