import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { searchTerms } from './grounding';
import type {
  AssistantLanguage,
  RetrievedSource,
} from './providers/agriculture-assistant.provider';

const DOCUMENT = `to_tsvector('simple', a.title || ' ' || a.content)`;

/** Bounded PostgreSQL full-text retrieval over APPROVED knowledge in the requested language. */
@Injectable()
export class KnowledgeRetrievalService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async retrieve(
    question: string,
    language: AssistantLanguage,
    limit: number,
  ): Promise<RetrievedSource[]> {
    const terms = searchTerms(question);
    if (!terms.length) return [];
    const tsquery = terms.map((t) => `'${t}'`).join(' | ');
    return this.db.query<RetrievedSource[]>(
      `SELECT a.id, a.title, a.version AS revision, a.language_code AS "languageCode",
              left(a.content, 1500) AS excerpt
         FROM knowledge_articles a, to_tsquery('simple', $1) q
        WHERE a.status = 'APPROVED' AND a.language_code = $2
          AND ${DOCUMENT} @@ q
        ORDER BY ts_rank(${DOCUMENT}, q) DESC, a.id
        LIMIT $3`,
      [tsquery, language, limit],
    );
  }
}
