# Parse the HSE "List of GPs on the GMS Scheme" (PDF saved as text) into JSON.
# Usage: python3 scripts/parse-gms-list.py List_of_GPs_on_the_GMS_Scheme.txt out.json
# then post-process into src/data/gms-gps.json (see src/lib/gms.ts).
import re, json, sys
src, out = sys.argv[1], sys.argv[2]
lines = [l.rstrip() for l in open(src, encoding='utf-8', errors='replace').read().replace('\r', '').split('\n')]
SKIP = re.compile(r'^(List of GPs on the GMS Scheme|\(\*\) In the case|at the surgery\.|Page \d+ of \d+|GP Number GP Name Address|Process \(\*\)|Publication Date|\s*$)')
region = area = None
recs, cur = [], None
END = re.compile(r'\s(Online|Paper)\s*$')
def flush():
    global cur
    if cur:
        recs.append(cur); cur = None
for l in lines:
    if SKIP.match(l): continue
    m = re.match(r'^(Rho|CHO|HSE)\b.*?-\s*\d+\s+(.*)$', l)
    if m and not re.match(r'^\d{4,6}\s', l):
        flush(); region = m.group(2).strip(); continue
    m = re.match(r'^(\d{1,2})\s+([A-Za-z][A-Za-z .,/&\'-]+)$', l)
    if m and not cur and not END.search(l):
        area = m.group(2).strip(); continue
    m = re.match(r'^(\d{4,6})\s+(.*)$', l)
    if m:
        flush(); cur = {'gms': m.group(1), 'text': m.group(2), 'area': area, 'region': region}
    elif cur is not None:
        if l.strip() in ('Online', 'Paper'):
            cur['process'] = l.strip(); flush(); continue
        cur['text'] += ' ' + l.strip()
    if cur is not None:
        e = END.search(cur['text'])
        if e:
            cur['process'] = e.group(1); cur['text'] = cur['text'][:e.start()]; flush()
flush()

PREFIX = {'O', "O'", 'MC', 'MAC', 'DE', 'DI', 'VAN', 'VON', 'NI', 'NIC', 'UI', 'LE', 'LA', 'DA', 'DEL', 'ST', 'ST.'}
def split(text):
    t = text.strip()
    t = re.sub(r'^DR\s*\.?\s*', '', t, flags=re.I)
    toks = t.split()
    i, name = 0, []
    def take_person():
        nonlocal i
        # first name (+ optional initial) + surname (+ prefixes)
        if i < len(toks): name.append(toks[i]); i += 1
        while i < len(toks) and re.fullmatch(r'[A-Z]\.?', toks[i]): name.append(toks[i]); i += 1
        while i < len(toks) and toks[i].upper().rstrip('.') in PREFIX: name.append(toks[i]); i += 1
        if i < len(toks): name.append(toks[i].rstrip(',')); trailing_comma = toks[i].endswith(','); i += 1
    take_person()
    while i < len(toks) and toks[i] in ('&', 'AND', '+'):
        name.append(toks[i]); i += 1
        if i < len(toks) and re.fullmatch(r'DR\.?', toks[i], re.I): i += 1
        take_person()
    addr = ' '.join(toks[i:]).strip(' ,')
    return ' '.join(name), addr

def tc(s):
    small = {'and', 'of', 'the', 'on', 'in'}
    def w(x, first):
        if re.search(r'\d', x) or (len(x) <= 3 and re.fullmatch(r'[A-Z]+', x) and x in ('GP', 'HSE', 'PCC', 'MRCGP', 'D6W', 'SC', 'CTR', 'UK')): return x
        lo = x.lower()
        if not first and lo in small: return lo
        out = lo.capitalize()
        out = re.sub(r"(['\-])([a-z])", lambda m: m.group(1) + m.group(2).upper(), out)
        out = re.sub(r'^(Mc|O\')([a-z])', lambda m: m.group(1) + m.group(2).upper(), out)
        return out
    return ' '.join(w(x, i == 0) for i, x in enumerate(s.split()))

data = []
for r in recs:
    n, a = split(r['text'])
    data.append({'gms': r['gms'], 'name': 'Dr ' + tc(n), 'address': tc(a).replace(' Co. ', ' Co. ').replace(' Co ', ' Co. '), 'area': r['area'], 'raw': r['text']})
json.dump(data, open(out, 'w'), ensure_ascii=False)
print('records', len(data))
import random; random.seed(3)
for d in random.sample(data, 12): print(d['gms'], '|', d['name'], '|', d['address'], '|', d['area'])
print('no address:', sum(1 for d in data if len(d['address']) < 8))
print('long names (>5 words):', sum(1 for d in data if len(d['name'].split()) > 5))
