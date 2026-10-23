import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { buildRetrievalQuery } from './retrieval-query';
import { aliasesOf, detectCrops, otherCropAliases } from './crop-affinity';
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
    // Crop affinity: when the question names crops, only articles about those crops are considered
    // (the crop word may differ from the article's, e.g. چاول vs دھان) and articles whose TITLE is about
    // another crop are excluded. Without a crop mention nothing changes.
    const crops = detectCrops(question);
    const cropAliases = aliasesOf(crops);
    const otherAliases = crops.length ? otherCropAliases(crops) : [];
    const matchTerms = [...new Set([...terms, ...cropAliases])];
    const rankQuery = terms.map((t) => `'${t}'`).join(' | ');
    const tsquery = matchTerms.map((t) => `'${t}'`).join(' | ');
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
          AND (cardinality($6::text[]) = 0
               OR a.doc @@ to_tsquery('simple', array_to_string(ARRAY(SELECT '''' || c || '''' FROM unnest($6::text[]) c), ' | ')))
          AND (cardinality($7::text[]) = 0
               OR NOT to_tsvector('simple', a.title) @@ to_tsquery('simple', array_to_string(ARRAY(SELECT '''' || c || '''' FROM unnest($7::text[]) c), ' | ')))
        ORDER BY CASE WHEN $9::boolean
                      THEN (SELECT count(*) FROM unnest($4::text[]) tt(term)
                             WHERE to_tsvector('simple', a.title) @@ plainto_tsquery('simple', tt.term))
                      ELSE 0 END DESC,
                 ts_rank(a.doc, to_tsquery('simple', $8)) DESC, ts_rank(a.doc, q) DESC, a.id
        LIMIT $3`,
      [
        tsquery,
        language,
        limit,
        matchTerms,
        minMatches,
        cropAliases,
        otherAliases,
        rankQuery,
        crops.length > 0,
      ],
    );
  }
}
