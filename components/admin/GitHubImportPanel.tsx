'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface Asset {
  id: number; tag: string; releaseName: string; draft: boolean; prerelease: boolean;
  releaseBody: string; name: string; size: number; contentType: string; eligible: boolean;
  status: 'DISCOVERED' | 'DOWNLOADING' | 'DOWNLOADED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  paperId: string | null; processingError: string | null; attemptCount: number;
}
const size = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export function GitHubImportPanel() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | 'all' | null>(null);
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);

  const refresh = useCallback(async (sync = false) => {
    if (sync) {
      const syncResponse = await fetch('/api/admin/github/sync', { method: 'POST' });
      const syncJson = await syncResponse.json();
      if (!syncResponse.ok) throw new Error(syncJson?.error?.message ?? 'Unable to synchronize GitHub releases');
    }
    const response = await fetch('/api/admin/github/releases');
    const json = await response.json();
    if (!response.ok) throw new Error(json?.error?.message ?? 'Unable to load GitHub releases');
    setAssets(json.data.assets as Asset[]);
  }, []);

  useEffect(() => {
    refresh().catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Unable to load saved GitHub releases'))
      .finally(() => setLoading(false));
  }, [refresh]);

  const visible = useMemo(() => assets.filter((asset) =>
    `${asset.name} ${asset.tag} ${asset.releaseName}`.toLowerCase().includes(filter.toLowerCase())), [assets, filter]);
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageAssets = visible.slice((page - 1) * pageSize, page * pageSize);
  const pendingEligible = assets.filter((a) => a.eligible && a.status !== 'COMPLETED');
  const releases = [...new Map(assets.map((asset) => [asset.tag, { tag: asset.tag, name: asset.releaseName, body: asset.releaseBody, prerelease: asset.prerelease }])).values()];

  async function importOne(asset: Asset) {
    const response = await fetch('/api/admin/github/import', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId: asset.id }),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json?.error?.message ?? 'Import failed');
    return json.data as { outcome: string; paperId: string; chunkCount: number };
  }

  async function runImport(asset: Asset) {
    setBusy(asset.id); setMessage('');
    try {
      const result = await importOne(asset);
      setMessage(`${asset.name}: ${result.outcome === 'DUPLICATE' ? 'already indexed' : `imported with ${result.chunkCount} passages`}.`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Import failed');
      await refresh().catch(() => undefined);
    } finally { setBusy(null); }
  }

  async function importAll() {
    setBusy('all'); setMessage('');
    let completed = 0;
    for (const asset of pendingEligible) {
      try {
        await importOne(asset);
        completed++;
        setMessage(`Imported ${completed} of ${pendingEligible.length} eligible PDFs...`);
      } catch (err) {
        setMessage(`${completed} imported. Stopped at ${asset.name}: ${err instanceof Error ? err.message : 'Import failed'}. You can retry failed assets.`);
        await refresh().catch(() => undefined);
        setBusy(null);
        return;
      }
    }
    setMessage(`Finished importing ${completed} eligible PDFs.`);
    await refresh().catch(() => undefined);
    setBusy(null);
  }

  if (loading) return <p role="status">Loading GitHub release assets...</p>;
  return <section className="stack">
    <div className="row">
      <label htmlFor="github-filter">Filter assets</label>
      <input id="github-filter" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} placeholder="Filename or release" />
      <button className="btn secondary" disabled={busy !== null} onClick={() => { setLoading(true); refresh(true).catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'GitHub synchronization failed')).finally(() => setLoading(false)); }}>Synchronize GitHub releases</button>
      <button className="btn" onClick={importAll} disabled={busy !== null || pendingEligible.length === 0}>
        {busy === 'all' ? 'Importing eligible PDFs...' : `Import all eligible (${pendingEligible.length})`}
      </button>
    </div>
    <p className="muted small">{assets.length} saved release assets. Eligible assets are published PDFs up to 20 MB. Imports run sequentially, with a limit of 120 attempts per administrator each hour. Start with one PDF for a presentation; retry failed assets after fixing the cause.</p>
    {releases.length > 0 && <details><summary>Release notes ({releases.length})</summary><ul>{releases.map((release) => <li key={release.tag}><strong>{release.name} ({release.tag})</strong>{release.prerelease && ' — prerelease'}<p>{release.body || 'No release description.'}</p></li>)}</ul></details>}
    {message && <p role="status" className="alert">{message}</p>}
    {visible.length === 0 ? <p>No release assets match this filter.</p> : <div className="table-wrap"><table>
      <thead><tr><th>Asset</th><th>Release</th><th>Size</th><th>Type</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>{pageAssets.map((asset) => <tr key={asset.id}>
        <td>{asset.name}{asset.processingError && <div className="small" role="alert">{asset.processingError}</div>}</td>
        <td>{asset.releaseName} <span className="muted">({asset.tag})</span>{asset.prerelease && <span className="muted"> prerelease</span>}</td>
        <td>{size(asset.size)}</td><td>{asset.contentType}</td><td>{asset.status.toLowerCase()}{asset.attemptCount > 0 ? ` (${asset.attemptCount} attempts)` : ''}</td>
        <td>{asset.paperId ? <Link href={`/papers/${asset.paperId}`}>View paper</Link> : <button className="btn" disabled={!asset.eligible || busy !== null || asset.status === 'COMPLETED'} onClick={() => runImport(asset)}>
          {busy === asset.id ? 'Importing...' : asset.status === 'FAILED' ? 'Retry' : asset.eligible ? 'Import' : 'Unavailable'}
        </button>}</td>
      </tr>)}</tbody>
    </table></div>}
    {visible.length > pageSize && <div className="row">
      <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
      <span>Page {page} of {pageCount} ({visible.length} matches)</span>
      <button className="btn" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</button>
    </div>}
  </section>;
}
