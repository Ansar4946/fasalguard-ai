import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { buildRetrievalQuery } from './retrieval-query';
import type {
  AssistantLanguage,
  RetrievedSource,
} from './providers/agriculture-assistant.provider';

const DOCUMENT = `to_tsvector('simple', k.title || ' ' || k.content)`;

/** Bounded PostgreSQL full-text retrieval over APPROVED knowledge in the requested language. */
@Injectable()
export class KnowledgeRetrievalService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async retrieve(
    question: string,
    language: AssistantLanguage,
    limit: number,
  ): Promise<RetrievedSource[]> {
    const { terms, minMatches } = buildRetrievalQuery(question);
    if (!terms.length) return [];
    const tsquery = terms.map((t) => `'${t}'`).join(' | ');
    // A row must contain at least `minMatches` DISTINCT meaningful terms, so a single incidental
    // word in an off-topic question no longer retrieves unrelated articles.
    return this.db.query<RetrievedSource[]>(
      `SELECT a.id, a.title, a.version AS revision, a.language_code AS "languageCode",
              left(a.content, 1500) AS excerpt
         FROM (SELECT k.*, ${DOCUMENT} AS doc FROM knowledge_articles k
                WHERE k.status = 'APPROVED' AND k.language_code = $2) a,
              to_tsquery('simple', $1) q,
              LATERAL (SELECT count(*)::int AS n FROM unnest($4::text[]) AS t(term)
                        WHERE a.doc @@ plainto_tsquery('simple', t.term)) m
        WHERE a.doc @@ q AND m.n >= $5
        ORDER BY ts_rank(a.doc, q) DESC, a.id
        LIMIT $3`,
      [tsquery, language, limit, terms, minMatches],
    );
  }
}
