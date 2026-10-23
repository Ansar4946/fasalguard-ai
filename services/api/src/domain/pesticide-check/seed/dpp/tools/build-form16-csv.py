"""Rebuilds dpp-form16-notified.csv from the DPP .xls (kept OUTSIDE the repo).
Usage: PYTHONPATH=<dir with xlrd> python -I build-form16-csv.py <dpp-form16.xls> <coordinator-extracted.csv> <out.csv>
Joins sheet '139 Product (Notified)' to 'With Classification' by exact normalised text first,
then by difflib similarity >= 0.85 (join_method records which), plus one manual pairing (serial 74)."""
import csv, difflib, re, sys
import xlrd

xls, base_csv, out_csv = sys.argv[1:4]
norm = lambda t: re.sub(r'[^a-z0-9]', '', t.lower())
sheet = xlrd.open_workbook(xls).sheet_by_name('With Classification')
cls = {}
for i in range(7, sheet.nrows):
    v = sheet.row_values(i)
    if v[1] and v[1] != 'Total' and isinstance(v[0], float):
        cls[norm(v[1])] = {'text': v[1].strip(), 'category': v[2].strip(), 'uses': v[3].strip(), 'who': v[19].strip()}
MANUAL = {'74': norm('Fluroxypyr + MCPA 30% WP (5% + 25%)')}
rows = list(csv.DictReader(open(base_csv, encoding='utf-8')))
for r in rows:
    key = norm(r['product_text'])
    m, how = None, 'none'
    if r['serial'] in MANUAL and MANUAL[r['serial']] in cls:
        m, how = cls[MANUAL[r['serial']]], 'manual'
    elif key in cls:
        m, how = cls[key], 'exact'
    else:
        c = difflib.get_close_matches(key, list(cls), n=1, cutoff=0.85)
        if c:
            m, how = cls[c[0]], 'fuzzy'
    r['join_method'] = how
    r['classification_text'] = m['text'] if m else ''
    if m:
        for k, mk in (('category', 'category'), ('uses', 'uses'), ('who_class', 'who')):
            if not r.get(k) and m[mk]:
                r[k] = m[mk]
fields = list(rows[0].keys())
with open(out_csv, 'w', encoding='utf-8', newline='') as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    w.writerows(rows)
print(len(rows), 'rows;', sum(1 for r in rows if r['who_class']), 'with who_class;',
      {h: sum(1 for r in rows if r['join_method'] == h) for h in ('exact', 'fuzzy', 'manual', 'none')})
