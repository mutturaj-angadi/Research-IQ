import { GitHubImportPanel } from '@/components/admin/GitHubImportPanel';
import { requirePageUser } from '@/lib/auth/session';

export const metadata = { title: 'GitHub release imports' };

export default async function GitHubImportsPage() {
  await requirePageUser('papers:upload');
  return <div className="stack"><h1>GitHub release imports</h1>
    <p className="muted">Import published PDF assets from the configured GitHub repository. Each asset is checked and processed through the existing PDF ingestion pipeline.</p>
    <GitHubImportPanel />
  </div>;
}
