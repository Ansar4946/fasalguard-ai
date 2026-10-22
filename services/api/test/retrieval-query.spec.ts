import {
  buildRetrievalQuery,
  MAX_QUERY_TERMS,
  STOP_WORDS,
} from '../src/domain/assistant/retrieval-query';

describe('buildRetrievalQuery', () => {
  it('drops English stop words and keeps distinct meaningful terms', () => {
    const q = buildRetrievalQuery('Why are my wheat leaves turning yellow?');
    expect(q.terms).toEqual(['wheat', 'leaves', 'turning', 'yellow']);
    expect(q.minMatches).toBe(1);
  });

  it('drops 1-2 character tokens and de-duplicates', () => {
    const q = buildRetrievalQuery('is it ok to go? wheat Wheat WHEAT');
    expect(q.terms).toEqual(['wheat']);
    expect(q.minMatches).toBe(1);
  });

  it('requires one match for up to four terms and two for five or more', () => {
    expect(buildRetrievalQuery('wheat irrigation').minMatches).toBe(1);
    expect(buildRetrievalQuery('wheat irrigation timing soil water').minMatches).toBe(2);
    expect(buildRetrievalQuery('wheat irrigation timing soil').minMatches).toBe(1);
  });

  it('handles Urdu: removes Urdu stop words, keeps crop words', () => {
    const q = buildRetrievalQuery('میری گندم کے پتے پیلے کیوں ہو رہے ہیں؟');
    expect(q.terms).toEqual(['گندم', 'پتے', 'پیلے', 'رہے'].filter((t) => !STOP_WORDS.has(t)));
    expect(q.terms).toContain('گندم');
    expect(q.minMatches).toBe(1);
    expect(q.terms).not.toContain('کیوں');
    expect(q.terms).not.toContain('میری');
  });

  it('returns no terms (abstain) when only stop words or short tokens remain', () => {
    for (const text of ['what is the', 'کیا ہے یہ؟', 'a b c', '', '   ?!']) {
      expect(buildRetrievalQuery(text)).toEqual({ terms: [], minMatches: 0 });
    }
  });

  it('keeps off-topic questions to few terms so the min-match rule can reject them', () => {
    expect(buildRetrievalQuery('what is the capital of France').terms).toEqual([
      'capital',
      'france',
    ]);
    expect(buildRetrievalQuery('tell me a joke').terms).toEqual(['joke']);
  });

  it('is bounded and never emits tsquery syntax', () => {
    const many = Array.from({ length: 50 }, (_, i) => `term${i}`).join(' ');
    expect(buildRetrievalQuery(many).terms).toHaveLength(MAX_QUERY_TERMS);
    expect(buildRetrievalQuery(`wheat' | !(x) & y:* <-> z`).terms).toEqual(['wheat']);
  });
});
