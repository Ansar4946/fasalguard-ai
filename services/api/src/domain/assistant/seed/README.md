# Assistant demo knowledge (DEMO - not expert-reviewed)

`demo-knowledge.json` holds 24 short articles (12 topics x Urdu and English) for WHEAT, COTTON and RICE.
They exist only so the grounded assistant has something to retrieve and cite during the demo.

**Every article is labelled `DEMO - not expert-reviewed`** in its title and in a `Source:` line
stored at the top of its content. They are NOT expert-reviewed, NOT region-specific and must not be
presented as agronomic advice.

## Content rules (enforced by `test/demo-knowledge.spec.ts` and by the seed itself)

- General good practice only: scouting habits, seed-bed preparation, balanced nutrition in general
  terms, irrigation timing in general terms, stubble handling, record keeping, when to call an expert.
- No doses, no digits, no units, no percentages, no product or brand names, no chemical names, no
  treatment recommendations, no region-specific numbers.
- Every article ends with a "consult an agriculture expert" line (Urdu: `زرعی ماہر سے مشورہ کریں۔`).

## Seeding

```
cd services/api
DATABASE_URL=postgresql://... npm run seed:demo-knowledge        # ts-node
DATABASE_URL=postgresql://... npm run seed:demo-knowledge:prod   # node dist/... after `npm run build`
```

- Idempotent: rows are matched by (title, language). A re-run reports `unchanged`; edited content or
  a retired row is restored and its `version` bumped. No duplicates, even if run concurrently.
- Rows are inserted as `status = 'APPROVED'` (retrieval only reads APPROVED rows) with a dedicated
  suspended, passwordless author user `demo-knowledge-seed@fasalguard.invalid`.
- `DEMO_KNOWLEDGE_FILE=/path/to/file.json` seeds a different file with the same shape.

## Replacing the demo with expert-approved content

1. Retire the demo rows: `UPDATE knowledge_articles SET status='RETIRED' WHERE title LIKE 'DEMO - not expert-reviewed%';`
   (retired rows are never retrieved, and existing citations keep working).
2. Have an agriculture expert author and approve real articles through the knowledge admin flow
   (`knowledge-admin.service.ts`), so authorship and review are recorded.
3. Do not reuse the DEMO label on reviewed content, and do not run the demo seed again afterwards
   (it would re-approve the demo rows).

## Notes

- Retrieval uses the PostgreSQL `simple` full-text configuration with OR terms: no stemming and no
  stop-word removal, and a question is answered only from articles in its own language.
