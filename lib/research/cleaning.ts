const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00AD]/g;
const PAGE_NUMBER_LINE = /^(?:page\s+)?\d{1,4}(?:\s+of\s+\d{1,4})?$/i;
const REPEAT_THRESHOLD = 0.6;
const MAX_HEADER_FOOTER_LENGTH = 80;

function normalizePage(text: string): string {
  return text
    .normalize('NFKC') // folds ligatures such as "ﬁ" into "fi"
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/([a-z])-\n(?=[a-z])/g, '$1') // re-join words hyphenated across lines
    .split('\n')
    .map((line) => line.trim())
    .join('\n');
}

function repeatKey(line: string): string {
  return line.toLowerCase().replace(/\d+/g, '#');
}

const ZONE_LINES = 2;

/** Indices of the first and last non-empty lines of a page, where headers and footers live. */
function zoneIndices(lines: string[]): Set<number> {
  const nonEmpty = lines.map((l, i) => (l === '' ? -1 : i)).filter((i) => i >= 0);
  return new Set([...nonEmpty.slice(0, ZONE_LINES), ...nonEmpty.slice(-ZONE_LINES)]);
}

/** Short lines in the header/footer zone that recur on most pages are running headers/footers. */
function findRepeatedLines(pages: string[]): Set<string> {
  const repeated = new Set<string>();
  if (pages.length < 3) return repeated;
  const counts = new Map<string, number>();
  for (const page of pages) {
    const lines = page.split('\n');
    const zone = zoneIndices(lines);
    const seen = new Set<string>();
    lines.forEach((line, i) => {
      if (zone.has(i) && line.length <= MAX_HEADER_FOOTER_LENGTH) seen.add(repeatKey(line));
    });
    for (const key of seen) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of counts) {
    if (count / pages.length >= REPEAT_THRESHOLD) repeated.add(key);
  }
  return repeated;
}

/** Normalises raw per-page text and strips headers, footers and page numbers. Page positions are preserved. */
export function cleanPages(rawPages: string[]): string[] {
  const normalized = rawPages.map(normalizePage);
  const repeated = findRepeatedLines(normalized);
  return normalized.map((page) => {
    const lines = page.split('\n');
    const zone = zoneIndices(lines);
    return lines
      .filter((line, i) => !PAGE_NUMBER_LINE.test(line) && !(zone.has(i) && repeated.has(repeatKey(line))))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  });
}
