"""Minimal stdlib xlsx reader: dumps sheet names and non-empty rows."""
import sys, zipfile, re, json
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
RID = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'


def col_idx(ref):
    letters = re.match(r'[A-Z]+', ref).group()
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1


def load(path):
    z = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in root.findall('m:si', NS):
            shared.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    target = {r.get('Id'): r.get('Target') for r in rels}
    sheets = []
    for s in wb.find('m:sheets', NS):
        t = target[s.get(RID)].lstrip('/')
        if not t.startswith('xl/'):
            t = 'xl/' + t
        sheets.append((s.get('name'), s.get('state', 'visible'), t))
    return z, shared, sheets


def rows(z, shared, part):
    for _, el in ET.iterparse(z.open(part)):
        if el.tag != '{%s}row' % NS['m']:
            continue
        out = {}
        for c in el.findall('m:c', NS):
            v = c.find('m:v', NS)
            t = c.get('t')
            if t == 'inlineStr':
                val = ''.join(x.text or '' for x in c.iter('{%s}t' % NS['m']))
            elif v is None:
                continue
            elif t == 's':
                val = shared[int(v.text)]
            else:
                val = v.text
            if str(val).strip() != '':
                out[col_idx(c.get('r'))] = val
        if out:
            yield int(el.get('r')), out
        el.clear()


if __name__ == '__main__':
    path, mode = sys.argv[1], sys.argv[2]
    z, shared, sheets = load(path)
    if mode == 'list':
        for name, state, part in sheets:
            n = 0
            first = None
            for r, cells in rows(z, shared, part):
                n += 1
                first = first or (r, cells)
            print(json.dumps([name, state, n, first], ensure_ascii=False)[:300])
    elif mode == 'dump':
        wanted = sys.argv[3]
        limit = int(sys.argv[4]) if len(sys.argv) > 4 else 10**9
        for name, state, part in sheets:
            if name == wanted:
                for i, (r, cells) in enumerate(rows(z, shared, part)):
                    if i >= limit:
                        break
                    print(r, json.dumps(cells, ensure_ascii=False))
