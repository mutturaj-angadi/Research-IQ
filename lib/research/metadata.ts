export interface DetectedMetadata {
  title?: string;
  abstract?: string;
  doi?: string;
  publicationYear?: number;
}

const DOI = /\b10\.\d{4,9}\/[^\s"<>)\]]+/i;
const YEAR = /\b(19[5-9]\d|20[0-4]\d)\b/;
const ABSTRACT = /\babstract\b[\s:.\-\u2014]*([\s\S]{80,2500}?)(?:\n\s*\n|\n\s*(?:1\.?\s+)?introduction\b|$)/i;

function titleFromFileName(fileName: string): string {
  const stem = fileName.replace(/\.pdf$/i, '').trim();
  const releaseTitle = stem.includes('__') ? stem.slice(stem.indexOf('__') + 2).replace(/_/g, ' ').trim() : '';
  if (releaseTitle.length >= 8 && releaseTitle.length <= 300) return releaseTitle;
  return stem.replace(/[_-]+/g, ' ').trim();
}

/**
 * Best-effort metadata detection from the first pages. These are heuristics (authors are not
 * detected); caller-supplied metadata always overrides them.
 */
export function detectMetadata(pages: string[], fileName: string): DetectedMetadata {
  const first = pages[0] ?? '';
  const head = pages.slice(0, 2).join('\n');
  const result: DetectedMetadata = {};

  const titleLine = first
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length >= 8 && l.length <= 300 && !/^(abstract|arxiv|https?:|www\.)/i.test(l));
  // Release filenames carry a complete title after the DOI__ separator. Prefer it over
  // the PDF's first visual line, which often ends mid-title when the title wraps.
  const hasReleaseTitle = fileName.replace(/\.pdf$/i, '').includes('__');
  result.title = (hasReleaseTitle ? titleFromFileName(fileName) : titleLine ?? titleFromFileName(fileName)).slice(0, 300);

  const doi = DOI.exec(head)?.[0].replace(/[.,;:]+$/, '').toLowerCase();
  if (doi) result.doi = doi;

  const year = YEAR.exec(first.slice(0, 1500))?.[1];
  if (year) result.publicationYear = Number(year);

  const abstract = ABSTRACT.exec(head)?.[1]?.replace(/\s+/g, ' ').trim();
  if (abstract && abstract.length >= 80) result.abstract = abstract.slice(0, 2000);

  return result;
}
