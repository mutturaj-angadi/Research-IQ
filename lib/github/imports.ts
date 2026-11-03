import type { Db } from '../db/client';
import { AppError } from '../errors';
import type { IngestResult } from '../types';
import { getReleasesConfig, GitHubReleasesService, type GitHubAsset } from './releases';

export interface GitHubImportRecord extends GitHubAsset {
  status: 'DISCOVERED' | 'DOWNLOADING' | 'DOWNLOADED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  checksum: string | null;
  paperId: string | null;
  processingError: string | null;
  attemptCount: number;
  updatedAt: string | null;
}

/** Idempotently register/update discovered metadata in bounded multi-row writes. */
export async function syncReleaseAssets(db: Db, actorId: string, github = new GitHubReleasesService()): Promise<{ discovered: number; registered: number }> {
  const assets = await github.listAssets();
  let registered = 0;
  for (let offset = 0; offset < assets.length; offset += 100) {
    const batch = assets.slice(offset, offset + 100);
    const values: unknown[] = [];
    const tuples = batch.map((asset, index) => {
      const base = index * 12;
      values.push(asset.repository, String(asset.id), String(asset.releaseId), asset.tag, asset.releaseName, asset.draft,
        asset.prerelease, asset.name, asset.downloadUrl, asset.contentType, asset.size, actorId);
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12})`;
    });
    const result = await db.query(
      `INSERT INTO github_release_assets
         (repository, asset_id, release_id, release_tag, release_name, release_draft, release_prerelease, filename, download_url, content_type, asset_size, last_synced_by)
       VALUES ${tuples.join(',')}
       ON CONFLICT (asset_id) DO UPDATE SET
         repository=EXCLUDED.repository,
         release_tag=EXCLUDED.release_tag, release_name=EXCLUDED.release_name,
         release_draft=EXCLUDED.release_draft, release_prerelease=EXCLUDED.release_prerelease,
         filename=EXCLUDED.filename, download_url=EXCLUDED.download_url,
         content_type=EXCLUDED.content_type, asset_size=EXCLUDED.asset_size,
         last_synced_by=EXCLUDED.last_synced_by, updated_at=now()
       WHERE github_release_assets.repository=EXCLUDED.repository AND github_release_assets.release_id=EXCLUDED.release_id
       RETURNING asset_id`, values);
    registered += result.rowCount ?? result.rows.length;
  }
  return { discovered: assets.length, registered };
}

/** Resolve only previously synchronized metadata, avoiding one GitHub API call per imported asset. */
export async function getRegisteredReleaseAsset(db: Db, assetId: number): Promise<GitHubAsset> {
  const config = getReleasesConfig();
  const repository = `${config.owner}/${config.repo}`;
  const result = await db.query<{
    asset_id: string; release_id: string; release_tag: string; release_name: string; checksum: string | null;
    release_draft: boolean; release_prerelease: boolean; filename: string; download_url: string;
    content_type: string; asset_size: string;
  }>(`SELECT asset_id, release_id, release_tag, release_name, checksum, release_draft, release_prerelease,
             filename, download_url, content_type, asset_size
      FROM github_release_assets WHERE asset_id=$1 AND repository=$2`, [String(assetId), repository]);
  const row = result.rows[0];
  if (!row) throw new AppError('NOT_FOUND', 'GitHub release asset was not found; refresh releases and try again');
  const size = Number(row.asset_size);
  const eligible = !row.release_draft && row.filename.toLowerCase().endsWith('.pdf') &&
    row.content_type.toLowerCase().split(';')[0] === 'application/pdf' && size > 0 && size <= config.maxAssetBytes;
  if (!eligible) throw new AppError('VALIDATION_ERROR', 'This release asset is not an eligible PDF');
  return {
    repository, id: Number(row.asset_id), releaseId: Number(row.release_id), tag: row.release_tag,
    releaseName: row.release_name, releaseBody: '', draft: row.release_draft, prerelease: row.release_prerelease,
    name: row.filename, size, contentType: row.content_type, downloadUrl: row.download_url, eligible,
  };
}

export async function listReleaseImports(db: Db): Promise<GitHubImportRecord[]> {
  // The admin listing must remain available when GitHub's API is rate limited. The
  // explicit sync action refreshes this snapshot; rendering the page is DB-only.
  const config = getReleasesConfig();
  const repository = `${config.owner}/${config.repo}`;
  const rows = await db.query<{
    asset_id: string; release_id: string; release_tag: string; release_name: string; release_draft: boolean;
    release_prerelease: boolean; filename: string; download_url: string; content_type: string; asset_size: string;
    processing_status: GitHubImportRecord['status']; checksum: string | null; paper_id: string | null;
    processing_error: string | null; attempt_count: number; updated_at: Date;
  }>(`SELECT asset_id, release_id, release_tag, release_name, release_draft, release_prerelease,
             filename, download_url, content_type, asset_size, processing_status, checksum, paper_id,
             processing_error, attempt_count, updated_at
      FROM github_release_assets WHERE repository = $1 ORDER BY release_name DESC, filename`, [repository]);
  return rows.rows.map((row) => {
    const size = Number(row.asset_size);
    const eligible = !row.release_draft && row.filename.toLowerCase().endsWith('.pdf') &&
      row.content_type.toLowerCase().split(';')[0] === 'application/pdf' && size > 0 && size <= config.maxAssetBytes;
    return {
      repository, id: Number(row.asset_id), releaseId: Number(row.release_id), tag: row.release_tag,
      releaseName: row.release_name, releaseBody: '', draft: row.release_draft, prerelease: row.release_prerelease,
      name: row.filename, size, contentType: row.content_type, downloadUrl: row.download_url, eligible,
      status: row.processing_status, checksum: row.checksum, paperId: row.paper_id,
      processingError: row.processing_error, attemptCount: row.attempt_count,
      updatedAt: row.updated_at?.toISOString() ?? null,
    };
  });
}

type Ingest = (input: { buffer: Uint8Array; fileName: string; mimeType: string }) => Promise<IngestResult>;

function publicFailure(err: unknown): string {
  return err instanceof AppError ? err.message.slice(0, 500) : 'Import failed due to an internal processing error';
}

export async function importReleaseAsset(db: Db, asset: GitHubAsset, ingest: Ingest, actorId: string, github = new GitHubReleasesService()): Promise<{
  outcome: 'IMPORTED' | 'DUPLICATE'; paperId: string; checksum: string; chunkCount: number;
}> {
  const registration = await db.query(
    `INSERT INTO github_release_assets
       (repository, asset_id, release_id, release_tag, release_name, release_draft, release_prerelease, filename, download_url, content_type, asset_size)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (asset_id) DO UPDATE SET
       repository = EXCLUDED.repository,
       release_tag = EXCLUDED.release_tag, release_name = EXCLUDED.release_name,
       release_draft = EXCLUDED.release_draft, release_prerelease = EXCLUDED.release_prerelease,
       filename = EXCLUDED.filename, download_url = EXCLUDED.download_url,
       content_type = EXCLUDED.content_type, asset_size = EXCLUDED.asset_size, updated_at = now()
     WHERE github_release_assets.repository = EXCLUDED.repository AND github_release_assets.release_id = EXCLUDED.release_id
       RETURNING processing_status, paper_id, checksum`,
    [asset.repository, String(asset.id), String(asset.releaseId), asset.tag, asset.releaseName, asset.draft, asset.prerelease, asset.name,
      asset.downloadUrl, asset.contentType, asset.size],
  );
  if (!registration.rowCount) throw new AppError('DUPLICATE_RESOURCE', 'GitHub asset metadata conflicts with an existing import');
  const existingStatus = registration.rows[0]?.processing_status as GitHubImportRecord['status'] | undefined;
  const existingPaper = registration.rows[0]?.paper_id as string | null | undefined;
  const existingChecksum = registration.rows[0]?.checksum as string | null | undefined;
  if (existingStatus === 'COMPLETED' && existingPaper) {
    const [paper] = (await db.query<{ processing_status: string; chunks: string; embeddings: string }>(
      `SELECT p.processing_status, count(c.id)::text AS chunks, count(e.chunk_id)::text AS embeddings
       FROM papers p LEFT JOIN paper_chunks c ON c.paper_id = p.id LEFT JOIN chunk_embeddings e ON e.chunk_id = c.id
       WHERE p.id = $1 GROUP BY p.id`, [existingPaper])).rows;
    if (paper?.processing_status === 'COMPLETED' && Number(paper.chunks) > 0 && paper.chunks === paper.embeddings) {
      return { outcome: 'DUPLICATE', paperId: existingPaper, checksum: existingChecksum ?? '', chunkCount: Number(paper.chunks) };
    }
  }

  const claimed = await db.query(
    `UPDATE github_release_assets SET processing_status = 'DOWNLOADING', processing_error = NULL,
       attempt_count = attempt_count + 1, last_attempt_at = now(), last_attempt_by = $2, updated_at = now()
     WHERE asset_id = $1 AND processing_status <> 'COMPLETED'
       AND (processing_status NOT IN ('DOWNLOADING','DOWNLOADED','PROCESSING') OR last_attempt_at < now() - interval '30 minutes' OR last_attempt_at IS NULL)
     RETURNING asset_id`, [String(asset.id), actorId],
  );
  if (!claimed.rowCount) throw new AppError('DUPLICATE_RESOURCE', 'This GitHub asset is already being processed');

  try {
    const downloaded = await github.downloadPdf(asset);
    await db.query(`UPDATE github_release_assets SET processing_status='DOWNLOADED', checksum=$2, updated_at=now() WHERE asset_id=$1`, [String(asset.id), downloaded.checksum]);

    const duplicate = await db.query<{ id: string; processing_status: string }>(
      `SELECT id, processing_status FROM papers WHERE file_hash = $1`, [downloaded.checksum]);
    if (duplicate.rows[0]?.processing_status === 'COMPLETED') {
      const link = await db.query<{ chunks: string; embeddings: string }>(
        `SELECT count(c.id)::text AS chunks, count(e.chunk_id)::text AS embeddings
         FROM papers p LEFT JOIN paper_chunks c ON c.paper_id=p.id LEFT JOIN chunk_embeddings e ON e.chunk_id=c.id
         WHERE p.id=$1 GROUP BY p.id`, [duplicate.rows[0].id]);
      const counts = link.rows[0];
      if (counts && Number(counts.chunks) > 0 && counts.chunks === counts.embeddings) {
        await db.query(`UPDATE github_release_assets SET processing_status='COMPLETED', paper_id=$2, processed_at=now(), updated_at=now() WHERE asset_id=$1`, [String(asset.id), duplicate.rows[0].id]);
        return { outcome: 'DUPLICATE', paperId: duplicate.rows[0].id, checksum: downloaded.checksum, chunkCount: Number(counts.chunks) };
      }
    }

    await db.query(`UPDATE github_release_assets SET processing_status='PROCESSING', updated_at=now() WHERE asset_id=$1`, [String(asset.id)]);
    const result = await ingest({ buffer: downloaded.buffer, fileName: asset.name, mimeType: 'application/pdf' });
    const [paper] = (await db.query<{ processing_status: string; chunks: string; embeddings: string }>(
      `SELECT p.processing_status, count(c.id)::text AS chunks, count(e.chunk_id)::text AS embeddings
       FROM papers p LEFT JOIN paper_chunks c ON c.paper_id = p.id LEFT JOIN chunk_embeddings e ON e.chunk_id = c.id
       WHERE p.id = $1 GROUP BY p.id`, [result.paperId])).rows;
    if (paper?.processing_status !== 'COMPLETED' || Number(paper.chunks) === 0 || paper.chunks !== paper.embeddings) {
      throw new AppError('PDF_PROCESSING_ERROR', 'Ingestion did not persist all paper embeddings');
    }
    await db.query(
      `UPDATE github_release_assets SET processing_status='COMPLETED', paper_id=$2, checksum=$3,
         processing_error=NULL, processed_at=now(), updated_at=now() WHERE asset_id=$1`,
      [String(asset.id), result.paperId, downloaded.checksum],
    );
    return { outcome: result.outcome === 'DUPLICATE' ? 'DUPLICATE' : 'IMPORTED', paperId: result.paperId, checksum: downloaded.checksum, chunkCount: result.chunkCount };
  } catch (err) {
    await db.query(
      `UPDATE github_release_assets SET processing_status='FAILED', processing_error=$2, updated_at=now() WHERE asset_id=$1`,
      [String(asset.id), publicFailure(err)],
    );
    throw err;
  }
}
