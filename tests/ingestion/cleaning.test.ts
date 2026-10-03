import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanPages } from '../../lib/research/cleaning';
import { detectMetadata } from '../../lib/research/metadata';

describe('cleanPages', () => {
  it('removes running headers and page numbers but keeps page positions', () => {
    const bodies = ['Alpha result one.', 'Beta result two.', 'Gamma result three.', 'Delta result four.'];
    const seconds = ['Epsilon follows.', 'Zeta follows.', 'Eta follows.', 'Theta follows.'];
    const pages = bodies.map((b, i) => `Journal of Tests 2024\n${b}\n${seconds[i]}\n${i + 1}`);
    const cleaned = cleanPages(pages);
    assert.equal(cleaned.length, 4);
    cleaned.forEach((p, i) => assert.equal(p, `${bodies[i]}\n${seconds[i]}`));
  });

  it('re-joins hyphenated words and folds ligatures', () => {
    const [page] = cleanPages(['The ef-\nficient \uFB01lter works.']);
    assert.equal(page, 'The efficient filter works.');
  });

  it('keeps empty pages as empty strings', () => {
    assert.deepEqual(cleanPages(['text', '']), ['text', '']);
  });
});

describe('detectMetadata', () => {
  const abstract = 'We study retrieval of evidence from papers. '.repeat(4).trim();
  const pages = [`Evidence Retrieval for Research Papers\nAuthors here 2021\nAbstract\n${abstract}\n\n1 Introduction\nText.\nhttps://doi.org/10.1000/xyz123.`];

  it('detects title, doi, year and abstract', () => {
    const m = detectMetadata(pages, 'file.pdf');
    assert.equal(m.title, 'Evidence Retrieval for Research Papers');
    assert.equal(m.doi, '10.1000/xyz123');
    assert.equal(m.publicationYear, 2021);
    assert.ok(m.abstract?.startsWith('We study retrieval'));
  });

  it('falls back to the file name for the title', () => {
    assert.equal(detectMetadata([''], 'my_great-paper.pdf').title, 'my great paper');
  });
});
