import { AppError } from '../errors';
import { sha256Hex } from './upload';

export interface ChunkOptions {
  /** Maximum characters per chunk. */
  chunkSize: number;
  /** Characters repeated at the start of the next chunk of the same section. */
  overlap: number;
}

export interface TextChunk {
  chunkIndex: number;
  section: string | null;
  /** Page on which the first new text of the chunk appears (1-based). */
  pageNumber: number;
  content: string;
  /** Rough estimate (characters / 4), not a tokenizer count. */
  tokenEstimate: number;
  contentHash: string;
}

const KNOWN_HEADING =
  /^(?:\d{1,2}(?:\.\d{1,2}){0,2}\.?\s+)?(abstract|introduction|related work|background|preliminaries|methods?|methodology|approach|model architecture|model|experiments?|experimental setup|results|evaluation|discussion|limitations|conclusions?|references|bibliography|acknowledg(?:e)?ments?|appendix)$/i;
const NUMBERED_HEADING = /^\d{1,2}(?:\.\d{1,2}){0,2}\.?\s+[A-Z][A-Za-z0-9 ,:\-]{2,70}$/;
const NUMBER_PREFIX = /^\d{1,2}(?:\.\d{1,2}){0,2}\.?\s+/;
const SKIPPED_SECTION = /^(references|bibliography)$/i;

interface TextUnit {
  section: string | null;
  page: number;
  text: string;
}

function isHeading(line: string): boolean {
  return line.length <= 80 && !line.endsWith('.') && (KNOWN_HEADING.test(line) || NUMBERED_HEADING.test(line));
}

function hardSplit(text: string, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/)) {
    if (word.length > max) {
      if (cur) out.push(cur);
      cur = '';
      for (let i = 0; i < word.length; i += max) out.push(word.slice(i, i + max));
    } else if (cur && cur.length + 1 + word.length > max) {
      out.push(cur);
      cur = word;
    } else {
      cur = cur ? `${cur} ${word}` : word;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Splits an over-long paragraph on sentence boundaries, falling back to word boundaries. */
function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let cur = '';
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (sentence.length > max) {
      if (cur) out.push(cur);
      cur = '';
      out.push(...hardSplit(sentence, max));
    } else if (cur && cur.length + 1 + sentence.length > max) {
      out.push(cur);
      cur = sentence;
    } else {
      cur = cur ? `${cur} ${sentence}` : sentence;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function buildUnits(pages: string[], maxUnit: number): TextUnit[] {
  const units: TextUnit[] = [];
  let section: string | null = null;
  pages.forEach((pageText, pageIdx) => {
    let paragraph: string[] = [];
    const flushParagraph = () => {
      if (paragraph.length === 0) return;
      const text = paragraph.join(' ').replace(/\s+/g, ' ').trim();
      paragraph = [];
      if (text === '' || (section !== null && SKIPPED_SECTION.test(section))) return;
      for (const piece of splitLong(text, maxUnit)) units.push({ section, page: pageIdx + 1, text: piece });
    };
    for (const line of pageText.split('\n')) {
      if (line === '') flushParagraph();
      else if (isHeading(line)) {
        flushParagraph();
        section = line.replace(NUMBER_PREFIX, '').trim();
      } else paragraph.push(line);
    }
    flushParagraph();
  });
  return units;
}

function overlapTail(content: string, overlap: number): string {
  if (overlap <= 0 || content.length <= overlap) return '';
  const slice = content.slice(-overlap);
  const space = slice.indexOf(' ');
  return space >= 0 ? slice.slice(space + 1) : slice;
}

/**
 * Deterministic chunker: identical input and options always yield identical chunks.
 * Chunks never cross a section boundary, never exceed chunkSize, and skip reference lists.
 */
export function chunkPages(pages: string[], options: ChunkOptions): TextChunk[] {
  if (options.chunkSize < 200 || options.overlap < 0 || options.overlap * 2 > options.chunkSize) {
    throw new AppError('VALIDATION_ERROR', 'Invalid chunking options');
  }
  const chunks: TextChunk[] = [];
  const seen = new Set<string>();
  let current: { section: string | null; page: number; text: string } | null = null;
  let tail = '';
  let tailSection: string | null = null;

  const flush = () => {
    if (!current) return;
    const content = current.text.trim();
    const contentHash = sha256Hex(content);
    if (content !== '' && !seen.has(contentHash)) {
      seen.add(contentHash);
      chunks.push({
        chunkIndex: chunks.length,
        section: current.section,
        pageNumber: current.page,
        content,
        tokenEstimate: Math.max(1, Math.ceil(content.length / 4)),
        contentHash,
      });
    }
    tail = overlapTail(content, options.overlap);
    tailSection = current.section;
    current = null;
  };

  for (const unit of buildUnits(pages, options.chunkSize)) {
    if (current && (current.section !== unit.section || current.text.length + 1 + unit.text.length > options.chunkSize)) flush();
    if (!current) {
      const carry: string = tail !== '' && tailSection === unit.section && tail.length + 1 + unit.text.length <= options.chunkSize ? tail : '';
      current = { section: unit.section, page: unit.page, text: carry ? `${carry} ${unit.text}` : unit.text };
    } else {
      current.text += ` ${unit.text}`;
    }
  }
  flush();
  return chunks;
}
