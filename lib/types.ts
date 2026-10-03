/** Application-level DTOs returned to Member 2. Raw database rows never leave lib/. */
export type Role = 'ADMIN' | 'RESEARCHER';

export interface AuthContext {
  userId: string;
  roles: Role[];
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SemanticSearchResult {
  paperId: string;
  paperTitle: string;
  chunkId: string;
  /** Cosine similarity in [-1, 1]; higher is closer. */
  similarity: number;
  /** First 500 characters of the stored chunk text (real text, never generated). */
  snippet: string;
  /** Full stored chunk text. */
  content: string;
  pageNumber: number | null;
  section: string | null;
  authors: string[];
  publicationYear: number | null;
  venue: string | null;
}

export interface SemanticSearchResponse {
  query: string;
  topK: number;
  results: SemanticSearchResult[];
  /** True when nothing relevant was retrieved. */
  noEvidence: boolean;
}

export interface PaperSearchHit {
  paperId: string;
  title: string;
  authors: string[];
  publicationYear: number | null;
  venue: string | null;
  doi: string | null;
  rank: number;
  snippet: string;
}

export interface PaperDetail {
  paperId: string;
  title: string;
  abstract: string | null;
  publicationYear: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  language: string;
  citationCount: number;
  processingStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  authors: { authorId: string; name: string; order: number }[];
  categories: { categoryId: number; name: string }[];
  stats: { chunkCount: number; embeddedChunkCount: number; timesRetrieved: number; timesCitedAsEvidence: number; timesSaved: number };
  createdAt: string;
}

export interface EvidenceItem {
  rank: number;
  relevanceScore: number;
  paperId: string;
  paperTitle: string;
  chunkId: string;
  pageNumber: number | null;
  section: string | null;
  snippet: string;
  authors: string[];
}

export interface AskResponse {
  questionId: string;
  answerId: string;
  status: 'ANSWERED' | 'NO_EVIDENCE' | 'FAILED';
  answer: string;
  evidence: EvidenceItem[];
}

export interface HistoryItem {
  kind: 'SEARCH' | 'QUESTION';
  id: string;
  text: string;
  createdAt: string;
  resultCount: number | null;
}

export interface PaperListItem {
  paperId: string;
  title: string;
  authors: string;
  publicationYear: number | null;
  venue: string | null;
  doi: string | null;
  processingStatus: string;
  categoryCount: number;
  chunkCount: number;
}

export interface CategoryItem {
  categoryId: number;
  name: string;
  paperCount: number;
}

export interface AuthorItem {
  authorId: string;
  name: string;
  paperCount: number;
}

export interface IngestResult {
  paperId: string;
  outcome: 'INGESTED' | 'REPROCESSED' | 'DUPLICATE';
  chunkCount: number;
}
