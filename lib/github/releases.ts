import { createHash } from 'node:crypto';
import { AppError } from '../errors';
import { MAX_UPLOAD_BYTES } from '../limits';

const API = 'https://api.github.com';
const MAX_REDIRECTS = 4;
const REDIRECT_HOSTS = new Set([
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com',
]);

export interface GitHubAsset {
  repository: string;
  id: number;
  releaseId: number;
  tag: string;
  releaseName: string;
  releaseBody: string;
  draft: boolean;
  prerelease: boolean;
  name: string;
  size: number;
  contentType: string;
  downloadUrl: string;
  eligible: boolean;
}

interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  assets: Array<{
    id: number;
    name: string;
    size: number;
    content_type: string;
    browser_download_url: string;
  }>;
}

export interface ReleasesConfig { owner: string; repo: string; token?: string; maxAssetBytes: number }
export type Fetcher = typeof fetch;

export function getReleasesConfig(env: Record<string, string | undefined> = process.env): ReleasesConfig {
  const owner = env.GITHUB_OWNER ?? 'mutturaj-angadi';
  const repo = env.GITHUB_REPO ?? 'Research-IQ';
  const pipelineMaxMb = MAX_UPLOAD_BYTES / (1024 * 1024);
  const maxMb = Number(env.GITHUB_RELEASE_MAX_ASSET_SIZE_MB ?? String(pipelineMaxMb));
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) {
    throw new AppError('INTERNAL_ERROR', 'Invalid GitHub repository configuration');
  }
  if (!Number.isInteger(maxMb) || maxMb < 1 || maxMb > pipelineMaxMb) {
    throw new AppError('INTERNAL_ERROR', 'Invalid GitHub asset size configuration');
  }
  return { owner, repo, token: env.GITHUB_TOKEN || undefined, maxAssetBytes: maxMb * 1024 * 1024 };
}

function safeAssetUrl(raw: string, owner: string, repo: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new AppError('VALIDATION_ERROR', 'GitHub returned an invalid asset URL'); }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port ||
      !url.pathname.startsWith(`/${owner}/${repo}/releases/download/`)) {
    throw new AppError('VALIDATION_ERROR', 'GitHub returned an untrusted asset URL');
  }
  return url.toString();
}

function hasNextPage(link: string | null): boolean {
  return Boolean(link?.split(',').some((part) => /;\s*rel="next"/.test(part)));
}

export class GitHubReleasesService {
  constructor(
    private readonly config = getReleasesConfig(),
    private readonly fetcher: Fetcher = fetch,
    private readonly apiTimeoutMs = 15_000,
    private readonly downloadTimeoutMs = 60_000,
  ) {}

  private headers(extra?: HeadersInit): Headers {
    const headers = new Headers({ Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ResearchIQ' });
    if (this.config.token) headers.set('Authorization', `Bearer ${this.config.token}`);
    new Headers(extra).forEach((v, k) => headers.set(k, v));
    return headers;
  }

  async listAssets(): Promise<GitHubAsset[]> {
    const releases: GitHubRelease[] = [];
    let page = 1;
    while (page <= 100) {
      const response = await this.fetcher(`${API}/repos/${this.config.owner}/${this.config.repo}/releases?per_page=100&page=${page}`, {
        headers: this.headers(), signal: AbortSignal.timeout(this.apiTimeoutMs),
      });
      if (!response.ok) {
        if (response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) {
          const retry = Number(response.headers.get('retry-after'));
          const wait = Number.isFinite(retry) && retry > 0 ? ` Try again in ${Math.ceil(retry)} seconds.` : ' Try again later.';
          throw new AppError('RATE_LIMITED', `GitHub API rate limit reached.${wait}`);
        }
        throw new AppError('INTERNAL_ERROR', `GitHub Releases request failed (${response.status})`);
      }
      const body: unknown = await response.json();
      if (!Array.isArray(body)) throw new AppError('INTERNAL_ERROR', 'GitHub returned an invalid releases response');
      releases.push(...body as GitHubRelease[]);
      if (!hasNextPage(response.headers.get('link'))) break;
      page++;
    }
    if (page > 100) throw new AppError('INTERNAL_ERROR', 'GitHub returned too many release pages');

    return releases.flatMap((release) => {
      if (!Number.isSafeInteger(release.id) || typeof release.tag_name !== 'string' || !release.tag_name ||
          typeof release.draft !== 'boolean' || typeof release.prerelease !== 'boolean' || !Array.isArray(release.assets)) return [];
      return release.assets.flatMap((asset) => {
      if (!Number.isSafeInteger(asset.id) || typeof asset.name !== 'string' ||
          !Number.isSafeInteger(asset.size) || asset.size < 0 || typeof asset.browser_download_url !== 'string') return [];
      let downloadUrl: string;
      try { downloadUrl = safeAssetUrl(asset.browser_download_url, this.config.owner, this.config.repo); } catch { return []; }
      const contentType = typeof asset.content_type === 'string' ? asset.content_type : 'application/octet-stream';
      const eligible = !release.draft && asset.name.toLowerCase().endsWith('.pdf') &&
        contentType.toLowerCase().split(';')[0] === 'application/pdf' && asset.size > 0 && asset.size <= this.config.maxAssetBytes;
      return [{
        repository: `${this.config.owner}/${this.config.repo}`, id: asset.id, releaseId: release.id, tag: release.tag_name, releaseName: release.name ?? release.tag_name,
        releaseBody: release.body ?? '', draft: release.draft, prerelease: release.prerelease,
        name: asset.name, size: asset.size, contentType, downloadUrl, eligible,
      }];
    });
    });
  }

  async findAsset(assetId: number): Promise<GitHubAsset> {
    const asset = (await this.listAssets()).find((item) => item.id === assetId);
    if (!asset) throw new AppError('NOT_FOUND', 'GitHub release asset was not found');
    if (!asset.eligible) throw new AppError('VALIDATION_ERROR', 'This release asset is not an eligible PDF');
    return asset;
  }

  async downloadPdf(asset: GitHubAsset): Promise<{ buffer: Buffer; checksum: string }> {
    if (!asset.eligible || asset.size > this.config.maxAssetBytes) throw new AppError('PAYLOAD_TOO_LARGE', 'The release asset exceeds the configured size limit');
    let current = safeAssetUrl(asset.downloadUrl, this.config.owner, this.config.repo);
    let response: Response;
    for (let redirects = 0; ; redirects++) {
      response = await this.fetcher(current, { redirect: 'manual', signal: AbortSignal.timeout(this.downloadTimeoutMs) });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      if (redirects >= MAX_REDIRECTS) throw new AppError('INTERNAL_ERROR', 'GitHub asset download redirected too many times');
      const location = response.headers.get('location');
      if (!location) throw new AppError('INTERNAL_ERROR', 'GitHub asset download returned an invalid redirect');
      const next = new URL(location, current);
      if (next.protocol !== 'https:' || !REDIRECT_HOSTS.has(next.hostname) || next.username || next.password || next.port) {
        throw new AppError('VALIDATION_ERROR', 'GitHub asset download redirected to an untrusted host');
      }
      current = next.toString();
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => undefined);
      throw new AppError('INTERNAL_ERROR', `GitHub asset download failed (${response.status})`);
    }
    const responseType = (response.headers.get('content-type') ?? '').toLowerCase().split(';')[0].trim();
    if (!['application/pdf', 'application/octet-stream'].includes(responseType)) {
      await response.body.cancel().catch(() => undefined);
      throw new AppError('PDF_PROCESSING_ERROR', 'GitHub returned an unexpected asset content type');
    }
    const length = response.headers.get('content-length');
    if (length !== null && (!/^(0|[1-9]\d*)$/.test(length) || Number(length) > this.config.maxAssetBytes)) {
      await response.body.cancel();
      throw new AppError('PAYLOAD_TOO_LARGE', 'The release asset exceeds the configured size limit');
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > this.config.maxAssetBytes || bytes > asset.size) {
          await reader.cancel();
          throw new AppError('PAYLOAD_TOO_LARGE', 'The downloaded release asset exceeds its declared size');
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    if (buffer.byteLength !== asset.size) throw new AppError('PDF_PROCESSING_ERROR', 'The downloaded release asset size did not match GitHub metadata');
    if (buffer.byteLength < 5 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new AppError('PDF_PROCESSING_ERROR', 'The release asset is not a valid PDF');
    }
    return { buffer, checksum: createHash('sha256').update(buffer).digest('hex') };
  }
}
