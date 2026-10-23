/** Pure text helpers shared by the scoring engine, the seed script and the unit tests. */

/** Lowercase and strip everything that is not a letter or digit (punctuation, spaces, symbols). */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * pg_trgm-compatible trigram set for a single already-normalised word (no spaces): the word is
 * padded with two leading spaces and one trailing space, exactly as PostgreSQL does.
 */
export function trigrams(normalized: string): Set<string> {
  const out = new Set<string>();
  if (!normalized) return out;
  const padded = `  ${normalized} `;
  for (let i = 0; i + 3 <= padded.length; i += 1) out.add(padded.slice(i, i + 3));
  return out;
}

/** Same value PostgreSQL's similarity() returns for two normalised strings (0..1). */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / (ta.size + tb.size - shared);
}

/** Fuzzy "same ingredient" test on normalised names: equal, one contains the other, or very similar. */
export function ingredientsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 5 && nb.length >= 5 && (na.includes(nb) || nb.includes(na))) return true;
  return trigramSimilarity(na, nb) >= 0.6;
}
