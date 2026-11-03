import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Pool } from 'pg';
import type { AnswerGenerator } from '../../lib/ai/answerGenerator';
import { EvidenceService } from '../../lib/evidence/retrieval';
import type { SemanticSearchResult } from '../../lib/types';

const ownerId = '00000000-0000-4000-8000-000000000001';
const paperId = '00000000-0000-4000-8000-000000000002';
const chunkId = '00000000-0000-4000-8000-000000000003';
const questionId = '00000000-0000-4000-8000-000000000004';
const answerId = '00000000-0000-4000-8000-000000000005';

const result = (rows: unknown[] = []) => ({ rows, rowCount: rows.length }) as never;
const source: SemanticSearchResult = {
  paperId,
  paperTitle: 'Inter-Satellite Link Configuration',
  chunkId,
  similarity: 0.84,
  snippet: 'Distance and line of sight constrain link feasibility.',
  content: 'Distance and line of sight constrain link feasibility. Snapshot methods omit satellite motion.',
  pageNumber: 3,
  section: 'Feasibility',
  authors: ['A. Researcher'],
  publicationYear: 2026,
  venue: null,
};

function createDb() {
  const statements: { sql: string; values: unknown[] }[] = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      statements.push({ sql, values });
      if (sql.startsWith('INSERT INTO questions')) return result([{ id: questionId }]);
      if (sql.startsWith('INSERT INTO answers')) return result([{ id: answerId }]);
      return result();
    },
    release: () => undefined,
  };
  const db = {
    connect: async () => client,
    query: async (sql: string, values: unknown[] = []) => {
      statements.push({ sql, values });
      if (sql.includes('SELECT q.user_id')) return result([{ user_id: ownerId }]);
      return result();
    },
  } as unknown as Pool;
  return { db, statements };
}

function service(generator: AnswerGenerator, db = createDb()) {
  const search = {
    search: async () => ({ query: 'question', topK: 1, results: [source], noEvidence: false }),
  } as never;
  return { evidence: new EvidenceService({ db: db.db, search, generator: () => generator }), ...db };
}

describe('RAG answer persistence and evidence ownership', () => {
  it('persists a successful answer with citations tied to the retrieved chunk', async () => {
    let prompt = '';
    const generator: AnswerGenerator = {
      model: 'gemini-3.8-flash',
      generate: async (_question, sources) => {
        prompt = JSON.stringify(sources);
        return 'Distance and line of sight constrain feasibility [1].';
      },
    };
    const svc = service(generator);
    const answer = await svc.evidence.askWithEvidence({ question: 'What constrains links?' }, { userId: ownerId, roles: ['RESEARCHER'] });
    const savedAnswer = svc.statements.find((entry) => entry.sql.startsWith('INSERT INTO answers'));
    const savedEvidence = svc.statements.find((entry) => entry.sql.includes('INSERT INTO answer_evidence'));

    assert.equal(answer.status, 'ANSWERED');
    assert.equal(answer.answerId, answerId);
    assert.equal(answer.evidence[0]?.paperId, paperId);
    assert.equal(answer.evidence[0]?.chunkId, chunkId);
    assert.match(prompt, new RegExp(chunkId));
    assert.equal(savedAnswer?.values[2], 'ANSWERED');
    assert.deepEqual(savedEvidence?.values, [answerId, [chunkId], [1], [0.84]]);
  });

  it('records a generation failure safely without attaching unsupported evidence', async () => {
    const generator: AnswerGenerator = {
      model: 'gemini-3.8-flash',
      generate: async () => { throw new Error('provider key=must-not-be-persisted'); },
    };
    const svc = service(generator);
    const answer = await svc.evidence.askWithEvidence({ question: 'What constrains links?' }, { userId: ownerId, roles: ['RESEARCHER'] });
    const savedAnswer = svc.statements.find((entry) => entry.sql.startsWith('INSERT INTO answers'));

    assert.equal(answer.status, 'FAILED');
    assert.equal(answer.answer, 'The answer could not be generated.');
    assert.deepEqual(answer.evidence, []);
    assert.equal(savedAnswer?.values[2], 'FAILED');
    assert.equal(String(savedAnswer?.values[1]).includes('must-not-be-persisted'), false);
    assert.equal(svc.statements.some((entry) => entry.sql.includes('INSERT INTO answer_evidence')), false);
  });

  it('fails closed for a model citation that is not in the retrieved source list', async () => {
    const generator: AnswerGenerator = { model: 'test', generate: async () => 'Claim [99].' };
    const svc = service(generator);
    const answer = await svc.evidence.askWithEvidence({ question: 'What constrains links?' }, { userId: ownerId, roles: ['RESEARCHER'] });
    assert.equal(answer.status, 'NO_EVIDENCE');
    assert.deepEqual(answer.evidence, []);
    assert.equal(svc.statements.some((entry) => entry.sql.includes('INSERT INTO answer_evidence')), false);
  });

  it('enforces answer ownership before returning persisted evidence', async () => {
    const generator: AnswerGenerator = { model: 'test', generate: async () => 'unused' };
    const svc = service(generator);
    await assert.rejects(
      svc.evidence.getAnswerEvidence(answerId, { userId: '00000000-0000-4000-8000-000000000099', roles: ['RESEARCHER'] }),
      { code: 'FORBIDDEN' },
    );
  });
});
