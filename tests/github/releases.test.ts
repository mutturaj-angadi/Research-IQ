import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { getReleasesConfig, GitHubReleasesService, type Fetcher, type GitHubAsset } from '../../lib/github/releases';

const config = { owner: 'mutturaj-angadi', repo: 'Research-IQ', maxAssetBytes: 1024 };
const release = (assets: unknown[], id = 1) => ({ id, tag_name: `v${id}`, name: `Release ${id}`, body: '', draft: false, prerelease: false, assets });
const asset = (over: Record<string, unknown> = {}) => ({
  id: 10, name: 'paper.pdf', size: 13, content_type: 'application/pdf',
  browser_download_url: 'https://github.com/mutturaj-angadi/Research-IQ/releases/download/v1/paper.pdf', ...over,
});
const json = (body: unknown, headers?: HeadersInit) => new Response(JSON.stringify(body), { status: 200, headers });

describe('GitHubReleasesService', () => {
  it('never configures a download limit above the existing ingestion limit', () => {
    assert.equal(getReleasesConfig({}).maxAssetBytes, 20 * 1024 * 1024);
    assert.throws(() => getReleasesConfig({ GITHUB_RELEASE_MAX_ASSET_SIZE_MB: '21' }), { code: 'INTERNAL_ERROR' });
  });

  it('paginates releases and filters unsupported, draft, and oversized assets', async () => {
    const calls: string[] = [];
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input); calls.push(url);
      if (url.endsWith('page=1')) return json([release([asset(), asset({ id: 11, name: 'notes.txt' }), asset({ id: 12, content_type: 'application/octet-stream' }), asset({ id: 13, size: 1025 })])], { link: '<https://api.github.com/page=2>; rel="next"' });
      return json([release([asset({ id: 14 })], 2), release([asset({ id: 15 })], 3)]);
    }) as Fetcher;
    const service = new GitHubReleasesService(config, fetcher);
    const items = await service.listAssets();
    assert.equal(calls.length, 2);
    assert.equal(items.length, 6);
    assert.equal(items.filter((item) => item.eligible).length, 3);
    assert.equal(items.find((item) => item.id === 11)?.eligible, false);
  });

  it('ignores an asset whose metadata URL does not belong to the configured repository', async () => {
    const fetcher = (async () => json([release([asset({ browser_download_url: 'https://attacker.example/file.pdf' })])])) as Fetcher;
    assert.deepEqual(await new GitHubReleasesService(config, fetcher).listAssets(), []);
  });

  it('reports GitHub API rate limits without exposing response details', async () => {
    const fetcher = (async () => new Response('{"message":"private server detail"}', {
      status: 403, headers: { 'x-ratelimit-remaining': '0', 'retry-after': '12' },
    })) as Fetcher;
    await assert.rejects(() => new GitHubReleasesService(config, fetcher).listAssets(), {
      code: 'RATE_LIMITED', message: 'GitHub API rate limit reached. Try again in 12 seconds.',
    });
  });

  it('downloads a bounded PDF and returns a SHA-256 checksum', async () => {
    const data = Buffer.from('%PDF-1.7\npaper');
    const pdfAsset = { repository: 'mutturaj-angadi/Research-IQ', id: 1, releaseId: 2, tag: 'v1', releaseName: 'v1', releaseBody: '', draft: false, prerelease: false,
      name: 'paper.pdf', size: data.length, contentType: 'application/pdf', downloadUrl: 'https://github.com/mutturaj-angadi/Research-IQ/releases/download/v1/paper.pdf', eligible: true } satisfies GitHubAsset;
    const fetcher = (async () => new Response(data, { status: 200, headers: { 'content-length': String(data.length), 'content-type': 'application/pdf' } })) as Fetcher;
    const result = await new GitHubReleasesService(config, fetcher).downloadPdf(pdfAsset);
    assert.deepEqual(result.buffer, data);
    assert.equal(result.checksum, createHash('sha256').update(data).digest('hex'));
  });

  it('rejects oversized streamed bodies even without a useful content length', async () => {
    const data = Buffer.from('%PDF-' + 'x'.repeat(1020));
    const pdfAsset = { repository: 'mutturaj-angadi/Research-IQ', id: 1, releaseId: 2, tag: 'v1', releaseName: 'v1', releaseBody: '', draft: false, prerelease: false,
      name: 'paper.pdf', size: 1024, contentType: 'application/pdf', downloadUrl: 'https://github.com/mutturaj-angadi/Research-IQ/releases/download/v1/paper.pdf', eligible: true } satisfies GitHubAsset;
    const fetcher = (async () => new Response(data, { status: 200, headers: { 'content-type': 'application/pdf' } })) as Fetcher;
    await assert.rejects(() => new GitHubReleasesService(config, fetcher).downloadPdf(pdfAsset), { code: 'PAYLOAD_TOO_LARGE' });
  });

  it('rejects invalid PDF signatures and untrusted redirects', async () => {
    const pdfAsset = { repository: 'mutturaj-angadi/Research-IQ', id: 1, releaseId: 2, tag: 'v1', releaseName: 'v1', releaseBody: '', draft: false, prerelease: false,
      name: 'paper.pdf', size: 4, contentType: 'application/pdf', downloadUrl: 'https://github.com/mutturaj-angadi/Research-IQ/releases/download/v1/paper.pdf', eligible: true } satisfies GitHubAsset;
    const invalid = (async () => new Response('nope', { status: 200, headers: { 'content-type': 'application/pdf' } })) as Fetcher;
    await assert.rejects(() => new GitHubReleasesService(config, invalid).downloadPdf(pdfAsset), { code: 'PDF_PROCESSING_ERROR' });
    const redirect = (async () => new Response(null, { status: 302, headers: { location: 'https://attacker.example/paper.pdf' } })) as Fetcher;
    await assert.rejects(() => new GitHubReleasesService(config, redirect).downloadPdf(pdfAsset), { code: 'VALIDATION_ERROR' });
  });

  it('aborts a stalled asset download at the configured timeout', async () => {
    const pdfAsset = { repository: 'mutturaj-angadi/Research-IQ', id: 1, releaseId: 2, tag: 'v1', releaseName: 'v1', releaseBody: '', draft: false, prerelease: false,
      name: 'paper.pdf', size: 13, contentType: 'application/pdf', downloadUrl: 'https://github.com/mutturaj-angadi/Research-IQ/releases/download/v1/paper.pdf', eligible: true } satisfies GitHubAsset;
    const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return reject(new Error('Missing timeout signal'));
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })) as Fetcher;
    await assert.rejects(() => new GitHubReleasesService(config, fetcher, 15_000, 1).downloadPdf(pdfAsset), { name: 'TimeoutError' });
  });
});
