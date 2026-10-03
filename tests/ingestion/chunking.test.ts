import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chunkPages } from '../../lib/research/chunking';

const opts = { chunkSize: 400, overlap: 80 };
const para = (n: number, tag = 'x') =>
  Array.from({ length: n }, (_, i) => `Sentence ${tag}${i} describes retrieval augmented generation for evidence.`).join(' ');

const pages = [
  `Attention Is All You Need\n\nAbstract\n${para(3, 'a')}\n\n1 Introduction\n${para(4, 'b')}`,
  `${para(6, 'c')}\n\n2 Methods\n${para(5, 'd')}`,
  `3 Results\n${para(2, 'e')}\n\nReferences\n[1] A. Author. Some cited work. 2019.\n\n[2] B. Author. Other work. 2020.`,
];

describe('chunkPages', () => {
  it('is deterministic', () => {
    assert.deepEqual(chunkPages(pages, opts), chunkPages(pages, opts));
  });

  it('never exceeds the chunk size and numbers chunks sequentially', () => {
    const chunks = chunkPages(pages, opts);
    assert.ok(chunks.length > 3);
    chunks.forEach((c, i) => {
      assert.ok(c.content.length <= opts.chunkSize, `chunk ${i} has ${c.content.length} chars`);
      assert.equal(c.chunkIndex, i);
    });
  });

  it('keeps section and page metadata', () => {
    const chunks = chunkPages(pages, opts);
    assert.equal(chunks[0]?.section, null); // title text before the first heading
    const abstract = chunks.find((c) => c.section === 'Abstract');
    assert.equal(abstract?.pageNumber, 1);
    const methods = chunks.find((c) => c.section === 'Methods');
    assert.equal(methods?.pageNumber, 2);
    const results = chunks.find((c) => c.section === 'Results');
    assert.equal(results?.pageNumber, 3);
  });

  it('never crosses a section boundary', () => {
    for (const c of chunkPages(pages, opts)) {
      if (c.section === 'Methods') assert.ok(!c.content.includes('Introduction'));
    }
  });

  it('skips the reference list', () => {
    const all = chunkPages(pages, opts).map((c) => c.content).join(' ');
    assert.ok(!all.includes('A. Author'));
  });

  it('overlaps consecutive chunks of one section', () => {
    const intro = chunkPages(pages, opts).filter((c) => c.section === 'Introduction');
    assert.ok(intro.length >= 2);
    const tailWords = (intro[0] as { content: string }).content.split(' ').slice(-3).join(' ');
    assert.ok((intro[1] as { content: string }).content.includes(tailWords));
  });

  it('splits a single huge paragraph without losing text', () => {
    const huge = Array.from({ length: 2000 }, (_, i) => `w${i}`).join(' ');
    const chunks = chunkPages([huge], opts);
    assert.ok(chunks.every((c) => c.content.length <= opts.chunkSize));
    assert.ok(chunks.length > 5);
  });

  it('drops duplicate chunk content', () => {
    const repeated = [`${para(2, 'r')}\n\nIntroduction\n${para(2, 'r')}`, `Introduction\n${para(2, 'r')}`];
    const hashes = chunkPages(repeated, opts).map((c) => c.contentHash);
    assert.equal(new Set(hashes).size, hashes.length);
  });

  it('returns no chunks for empty pages and rejects bad options', () => {
    assert.deepEqual(chunkPages(['', ' '], opts), []);
    assert.throws(() => chunkPages(pages, { chunkSize: 100, overlap: 0 }), { code: 'VALIDATION_ERROR' });
    assert.throws(() => chunkPages(pages, { chunkSize: 400, overlap: 300 }), { code: 'VALIDATION_ERROR' });
  });
});
