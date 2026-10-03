import type { Filters } from '../validation/schemas';

export interface FilterClause {
  sql: string;
  params: unknown[];
}

/**
 * Builds " AND ..." predicates over papers aliased as `p`.
 * Every user-supplied value is a bound parameter ($n); only constant SQL text is concatenated.
 * `firstParam` is the number of the first placeholder this clause may use.
 */
export function buildPaperFilterClause(filters: Filters, firstParam: number): FilterClause {
  const parts: string[] = [];
  const params: unknown[] = [];
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${firstParam + params.length - 1}`;
  };

  if (filters.yearFrom !== undefined) parts.push(`p.publication_year >= ${bind(filters.yearFrom)}`);
  if (filters.yearTo !== undefined) parts.push(`p.publication_year <= ${bind(filters.yearTo)}`);
  if (filters.venue !== undefined) parts.push(`lower(p.venue) = lower(${bind(filters.venue)})`);
  if (filters.paperIds !== undefined) parts.push(`p.id = ANY(${bind(filters.paperIds)}::uuid[])`);
  if (filters.categoryIds !== undefined) {
    parts.push(
      `EXISTS (SELECT 1 FROM paper_categories pc WHERE pc.paper_id = p.id AND pc.category_id = ANY(${bind(filters.categoryIds)}::int[]))`,
    );
  }
  if (filters.authorId !== undefined) {
    parts.push(`EXISTS (SELECT 1 FROM paper_authors pa WHERE pa.paper_id = p.id AND pa.author_id = ${bind(filters.authorId)}::uuid)`);
  }

  return { sql: parts.map((p) => ` AND ${p}`).join(''), params };
}
