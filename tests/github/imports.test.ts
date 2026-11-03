import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Db } from '../../lib/db/client';
import { getRegisteredReleaseAsset, importReleaseAsset, listReleaseImports, syncReleaseAssets } from '../../lib/github/imports';
import type { GitHubAsset, GitHubReleasesService } from '../../lib/github/releases';

const importedPaper = '00000000-0000-4000-8000-000000000001';
const adminId = '00000000-0000-4000-8000-000000000002';
const asset: GitHubAsset = {
  repository: 'mutturaj-angadi/Research-IQ',
  id: 123, releaseId: 4, tag: 'v1', releaseName: 'Release 1', releaseBody: '', draft: false, prerelease: false,
  name: 'paper.pdf', size: 13, contentType: 'application/pdf',
  downloadUrl: 'https://github.com/mutturaj-angadi/Research-IQ/releases/download/v1/paper.pdf', eligible: true,
};
const result = (rows: unknown[] = [], rowCount = rows.length) => ({ rows, rowCount }) as never;

describe('GitHub asset import orchestration', () => {
  it('lists the saved repository snapshot without calling GitHub', async () => {
    const db = { query: async (sql: string, values: unknown[]) => {
      assert.match(sql, /FROM github_release_assets WHERE repository = \$1/);
      assert.deepEqual(values, ['mutturaj-angadi/Research-IQ']);
      return result([{
        asset_id: '123', release_id: '4', release_tag: 'v1', release_name: 'Release 1', release_draft: false,
        release_prerelease: false, filename: 'paper.pdf', download_url: asset.downloadUrl,
        content_type: 'application/pdf', asset_size: '13', processing_status: 'DISCOVERED', checksum: null,
        paper_id: null, processing_error: null, attempt_count: 0, updated_at: new Date('2026-01-01T00:00:00Z'),
      }]);
    } } as unknown as Db;
    const records = await listReleaseImports(db);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.id, 123);
    assert.equal(records[0]?.eligible, true);
    assert.equal(records[0]?.status, 'DISCOVERED');
    assert.equal(records[0]?.releaseBody, '');
  });

  it('resolves an import from synchronized metadata scoped to the configured repository', async () => {
    const db = { query: async (sql: string, values: unknown[]) => {
      assert.match(sql, /WHERE asset_id=\$1 AND repository=\$2/);
      assert.deepEqual(values, ['123', 'mutturaj-angadi/Research-IQ']);
      return result([{
        asset_id: '123', release_id: '4', release_tag: 'v1', release_name: 'Release 1', release_draft: false,
        release_prerelease: false, filename: 'paper.pdf', download_url: asset.downloadUrl,
        content_type: 'application/pdf', asset_size: '13',
      }]);
    } } as unknown as Db;
    const record = await getRegisteredReleaseAsset(db, 123);
    assert.equal(record.eligible, true);
    assert.equal(record.repository, 'mutturaj-angadi/Research-IQ');
  });

  it('registers discovered metadata with idempotent upserts', async () => {
    let calls = 0;
    const db = { query: async (sql: string, values: unknown[]) => {
      calls++;
      assert.match(sql, /ON CONFLICT \(asset_id\) DO UPDATE/);
      assert.equal(values.length, 24);
      assert.match(sql, /\$24\)/);
      return result([{ asset_id: '123' }, { asset_id: '124' }]);
    } } as unknown as Db;
    const github = { listAssets: async () => [asset, { ...asset, id: 124 }] } as unknown as GitHubReleasesService;
    assert.deepEqual(await syncReleaseAssets(db, adminId, github), { discovered: 2, registered: 2 });
    assert.deepEqual(await syncReleaseAssets(db, adminId, github), { discovered: 2, registered: 2 });
    assert.equal(calls, 2);
  });

  it('records processing stages, verifies embeddings, and returns an idempotent duplicate', async () => {
    let completed = false;
    const statements: string[] = [];
    const db = { query: async (sql: string) => {
      statements.push(sql);
      if (sql.startsWith('INSERT INTO github_release_assets')) return result([{ processing_status: completed ? 'COMPLETED' : 'DISCOVERED', paper_id: completed ? importedPaper : null, checksum: completed ? 'a'.repeat(64) : null }]);
      if (sql.startsWith('UPDATE github_release_assets SET processing_status = \'DOWNLOADING\'')) return result([{ asset_id: '123' }]);
      if (sql.includes('SELECT id, processing_status FROM papers WHERE file_hash')) return result([]);
      if (sql.includes('SELECT p.processing_status')) return result([{ processing_status: 'COMPLETED', chunks: '2', embeddings: '2' }]);
      if (sql.startsWith('UPDATE github_release_assets SET processing_status=\'COMPLETED\'')) { completed = true; return result([], 1); }
      return result([], 1);
    } } as unknown as Db;
    let downloads = 0;
    const github = { downloadPdf: async () => { downloads++; return { buffer: Buffer.from('%PDF-1.7'), checksum: 'a'.repeat(64) }; } } as unknown as GitHubReleasesService;
    let ingests = 0;
    const ingest = async () => { ingests++; return { paperId: importedPaper, outcome: 'INGESTED' as const, chunkCount: 2 }; };

    const first = await importReleaseAsset(db, asset, ingest, adminId, github);
    const second = await importReleaseAsset(db, asset, ingest, adminId, github);
    assert.equal(first.outcome, 'IMPORTED');
    assert.equal(second.outcome, 'DUPLICATE');
    assert.equal(first.paperId, importedPaper);
    assert.equal(ingests, 1);
    assert.equal(downloads, 1);
    assert.ok(statements.some((sql) => sql.includes("processing_status='PROCESSING'")));
    assert.ok(statements.some((sql) => sql.includes("processing_status='COMPLETED'")));
  });

  it('rejects a concurrent claim instead of downloading the same asset twice', async () => {
    const db = { query: async (sql: string) => {
      if (sql.startsWith('INSERT INTO github_release_assets')) return result([{ processing_status: 'DOWNLOADING', paper_id: null }]);
      if (sql.startsWith('UPDATE github_release_assets SET processing_status = \'DOWNLOADING\'')) return result([]);
      return result([]);
    } } as unknown as Db;
    let downloads = 0;
    const github = { downloadPdf: async () => { downloads++; throw new Error('must not download'); } } as unknown as GitHubReleasesService;
    await assert.rejects(() => importReleaseAsset(db, asset, async () => { throw new Error('must not ingest'); }, adminId, github), { code: 'DUPLICATE_RESOURCE' });
    assert.equal(downloads, 0);
  });

  it('stores a safe failure and permits a later retry', async () => {
    let status = 'DISCOVERED';
    let attempts = 0;
    let storedError: string | null = null;
    const db = { query: async (sql: string, values: unknown[] = []) => {
      if (sql.startsWith('INSERT INTO github_release_assets')) {
        return result([{ processing_status: status, paper_id: null, checksum: null }]);
      }
      if (sql.startsWith('UPDATE github_release_assets SET processing_status = \'DOWNLOADING\'')) {
        status = 'DOWNLOADING';
        attempts++;
        return result([{ asset_id: '123' }]);
      }
      if (sql.startsWith('UPDATE github_release_assets SET processing_status=\'DOWNLOADED\'')) {
        status = 'DOWNLOADED';
        return result([], 1);
      }
      if (sql.includes('SELECT id, processing_status FROM papers WHERE file_hash')) return result([]);
      if (sql.startsWith('UPDATE github_release_assets SET processing_status=\'PROCESSING\'')) {
        status = 'PROCESSING';
        return result([], 1);
      }
      if (sql.startsWith('UPDATE github_release_assets SET processing_status=\'FAILED\'')) {
        status = 'FAILED';
        storedError = String(values[1]);
        return result([], 1);
      }
      if (sql.includes('SELECT p.processing_status')) {
        return result([{ processing_status: 'COMPLETED', chunks: '2', embeddings: '2' }]);
      }
      if (sql.startsWith('UPDATE github_release_assets SET processing_status=\'COMPLETED\'')) {
        status = 'COMPLETED';
        return result([], 1);
      }
      return result([], 1);
    } } as unknown as Db;
    const github = { downloadPdf: async () => ({ buffer: Buffer.from('%PDF-1.7'), checksum: 'a'.repeat(64) }) } as unknown as GitHubReleasesService;
    let failOnce = true;
    const ingest = async () => {
      if (failOnce) {
        failOnce = false;
        throw new Error('provider key=must-not-be-stored');
      }
      return { paperId: importedPaper, outcome: 'INGESTED' as const, chunkCount: 2 };
    };

    await assert.rejects(() => importReleaseAsset(db, asset, ingest, adminId, github));
    assert.equal(status, 'FAILED');
    assert.equal(storedError, 'Import failed due to an internal processing error');
    assert.doesNotMatch(storedError, /must-not-be-stored/);

    const retried = await importReleaseAsset(db, asset, ingest, adminId, github);
    assert.equal(retried.outcome, 'IMPORTED');
    assert.equal(status, 'COMPLETED');
    assert.equal(attempts, 2);
  });
});
