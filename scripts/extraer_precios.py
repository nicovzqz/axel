"""Genera precios.js para el armador de presupuestos a partir de la lista de Excel.

Lee solo los precios de lista por talle de una hoja (por defecto la más nueva,
"junio 2026 0,6"). No toca las hojas de costos.

Uso:
    python scripts/extraer_precios.py LISTAPRECIODELOSCOLEGIOS2025B.xlsx "junio 2026 0,6"
"""
import json
import re
import sys
import unicodedata
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from xlsx_lite import load, rows  # noqa: E402

SCHOOLS = {
    'cjh': 'Colegio José Hernández',
    'ib': 'Instituto Ballester',
    'sj': 'San Joaquín School',
    'lm': 'Colegio Nuestra Señora de la Merced de Villa Ballester',
    'isa': 'Instituto Santa Ana',
    'rd': 'Colegio Rubén Darío',
    'jn': 'Jardín Nenelandya',
    'ijh': 'Instituto José Hernández',
    'aguer': 'Colegio Fernando Aguer',
    'prof': 'Profesorado de Educación Física del Instituto José Hernández',
    'jb': 'Jardín Belén',
    'el': 'Instituto Emilio Lamarca',
    'as': 'Complejo Educacional Alfonsina Storni',
}
ALL = list(SCHOOLS)

# Filas que abren la sección de cada colegio (texto normalizado de la columna A o B).
SECTION_MARKERS = [
    ('instituto santa ana', ['isa']),
    ('instituto jh', ['ijh', 'aguer', 'prof']),
    ('ijh/p/aguer', ['ijh', 'aguer', 'prof']),
    ('emilio lamarca', ['el']),
    ('la merced nuevo', ['lm']),
    ('instituto ballester', ['ib']),
    ('alfonsina storni', ['as']),
    ('ruben dario', ['rd', 'jn']),
    ('jardin belen', ['jb']),
    ('san jaquin', ['sj']),
    ('san joaquin', ['sj']),
    ('col jh', ['cjh']),
    ('deportes', ['cjh']),
]

# Prendas genéricas: a qué colegios corresponden (según las marcas de la planilla
# y las prendas sin precio que cada colegio lista en su sección).
GENERIC_TARGETS = {
    'pant gris|gabardina inta': ['el', 'lm', 'ib', 'isa', 'sj'],
    'pant gris|sarga de inta': ['el', 'lm', 'ib', 'isa', 'sj'],
    'pant dama|sarga inta': ['el', 'lm', 'ib', 'isa', 'sj'],
    'bermuda|clases gris': ['lm', 'ib', 'isa', 'sj'],
    'pollera|gris sarga': ['ib', 'el'],
    'pollera kilt|azul arciel': ['as'],
    'short|gabadina azul': ['as'],
    'pollera pant|algodon/lycra': ['lm', 'ib', 'isa', 'rd', 'jn', 'jb', 'sj'],
    'pollera pant as|azul arciel tapa': ['as'],
    'calza|corta': ['cjh', 'isa', 'el', 'as', 'aguer', 'ijh', 'sj', 'ib', 'lm'],
}
ACCESSORY_TARGETS = {'mochila': ['isa', 'lm'], 'morral': ['as']}

# Correcciones de ortografía, por palabra completa (clave sin acentos).
TYPO = {'micrfibra': 'microfibra', 'terminca': 'térmica', 'forreria': 'forrería',
        'exclente': 'excelente', 'antipillin': 'antipilling', 'antipiling': 'antipilling',
        'polyester': 'poliéster', 'polyeste': 'poliéster', 'poliester': 'poliéster',
        'algodon': 'algodón', 'pique': 'piqué', 'optico': 'óptico', 'mas': 'más',
        'termico': 'térmico', 'gabadina': 'gabardina', 'pantalon': 'pantalón',
        'basquet': 'básquet', 'rustico': 'rústico', 'clasico': 'clásico', 'clasica': 'clásica',
        'escoces': 'escocés', 'jardin': 'jardín', 'unico': 'único', 'desforma': 'deforma'}
DESC_SKIP = ('nike', 'competencia', 'descuento', 'descueto', 'clases', 'gym', 'nuevo', 'nueva',
             'capucha', 'estampada', 'bordada', 'secundaria', 'primaria', 'verde', 'negro',
             'aguer', 'ijh', 'acetato', 'comun', 'común')


def norm(s):
    s = unicodedata.normalize('NFD', str(s)).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', s).strip().lower()


def is_num(s):
    try:
        float(s)
        return True
    except (TypeError, ValueError):
        return False


def is_header(d):
    vals = [norm(d.get(k, '')) for k in (2, 3, 4)]
    return any(v in ('p.lista', 'efc', '30off', 'tarjeta') for v in vals)


SIZE_RE = re.compile(r'^(\d+([.,]\d+)?|\d+ ?/ ?[a-z0-9]+|x{0,4}[sml]|x{1,4}l|unico)$')


def fix(text):
    t = re.sub(r'\s+', ' ', str(text)).strip().lower()
    return re.sub(r'[a-záéíóúñ]+', lambda m: TYPO.get(norm(m.group()), m.group()), t)


NAME_WORDS = [
    (r'^pant\b', 'pantalón'), (r'^camp gim\b', 'campera de gimnasia'),
    (r'\bgym\b', 'de gimnasia'), (r'^equipo 1p$', 'equipo de gimnasia'),
    (r'\bm larga\b', 'manga larga'), (r'\bbask\b', 'de básquet'), (r'\bprim\b', 'primaria'),
    (r'\bnuevo\b', ''), (r'\bpol\b', 'poliéster'), (r'\bpollera pant\b', 'pollera pantalón'),
    (r'\bas$', ''), (r'\bpant\b', 'pantalón'), (r'^super fino$', 'pantalón súper fino'),
    (r'^pantalón dama\b', 'pantalón de dama'), (r'^remera/musculosa$', 'remera o musculosa'),
]
VARIANT_DROP = {'antes', 'nuevo', 'nueva', 'premium', 'clasico', 'clasica', 'liquidacion', 'as',
                'ijh/prof', 'aguer', 'aguer/ijh', 'equipo cuenta como 1 prenda', 'con capucha',
                'capucha', 'todos los deportes'}


def pretty(name, variant):
    n = norm(name)
    for pat, rep in NAME_WORDS:
        n = re.sub(pat, rep, n)
    v = fix(variant)
    if norm(variant) in VARIANT_DROP or 'nike' in norm(variant):
        v = ''
    if norm(variant) == 'tela vieja':
        v = '(tela anterior)'
    if norm(variant) in ('con capucha', 'capucha'):
        v = 'con capucha'
    full = re.sub(r'\s+', ' ', (n + ' ' + v).strip())
    full = fix(full)
    return full[:1].upper() + full[1:]


def category(n):
    if re.search(r'\b(medias|mochila|morral|vinilo)\b', n):
        return 'Accesorios'
    if 'delantal' in n:
        return 'Delantales'
    if re.search(r'\b(pollera|short|bermuda)\b', n):
        return 'Polleras, shorts y bermudas'
    if re.search(r'\b(remera|chomba|musculosa)\b', n):
        return 'Remeras y chombas'
    if re.search(r'\b(buzo|campera|camp|chaleco|pullover)\b', n):
        return 'Buzos, camperas y abrigo'
    return 'Pantalones y equipos'


def promo_group(n, premium):
    """A: pantalones, buzos y camperas Premium. B: remeras, chombas, shorts y polleras
    pantalón Premium. C: demás prendas (ver PROMOS en precios.js)."""
    if not premium or re.search(r'\b(gris|dama|sarga|gabardina|kilt|hockey|escocesa)\b', n):
        return 'C'
    if re.search(r'\b(remera|chomba|short)\b', n) or 'pollera pant' in n:
        return 'B'
    if re.search(r'\b(pant|buzo|campera|camp|equipo)\b', n) or n == 'super fino':
        return 'A'
    return 'C'


def extract(path, sheet):
    z, shared, sheets = load(path)
    part = next(p for name, _, p in sheets if name == sheet)
    date_cell = None
    products = []
    current = ['cjh']
    mode = 'school'
    last_desc = {}
    prod = None

    def close():
        if prod and prod['sizes']:
            products.append(prod)

    for r, cells in rows(z, shared, part):
        d = {k: v for k, v in cells.items() if k <= 6}
        c0, c1 = d.get(0, ''), d.get(1, '')
        n0, n1 = norm(c0), norm(c1)
        if r == 1 and is_num(c0):
            date_cell = date(1899, 12, 30) + timedelta(days=int(float(c0)))
            continue

        if n0 == 'genericos':
            close(); prod = None; mode = 'generic'
            continue
        if n0 == 'deportes':
            close(); prod = None; mode = 'school'; current = ['cjh']
            continue

        if is_header(d):
            close()
            name_n = norm(c0)
            if not c0.strip():
                mode = 'accessory' if mode != 'generic' else mode
                prod = None
                continue
            key = name_n + '|' + n1
            if mode == 'generic':
                targets = GENERIC_TARGETS.get(key)
                if targets is None:
                    print('  sin destino, se omite:', key, file=sys.stderr)
                    prod = None
                    continue
            else:
                targets = list(current)
                if set(current) == {'ijh', 'aguer', 'prof'}:
                    if n1 == 'aguer':
                        targets = ['aguer']
                    elif n1 == 'ijh/prof':
                        targets = ['ijh', 'prof']
                    elif n1 == 'aguer/ijh':
                        targets = ['aguer', 'ijh']
            desc = '' if mode == 'generic' else last_desc.get('text', '')
            allt = norm(' '.join([c0, c1, last_desc.get('raw', '')]))
            premium = 'clasic' not in allt
            prod = {'nombre': pretty(c0, c1), 'clave': name_n, 'detalle': desc,
                    'linea': 'Premium' if premium else 'Clásica', 'colegios': targets,
                    'categoria': category(name_n), 'promo': promo_group(name_n, premium),
                    'sizes': [], 'fila': r}
            last_desc = {}
            continue

        # Fila de colores de la calza: es una marca, no una descripción.
        if mode == 'generic' and n0 in ('azul', 'verde'):
            continue

        # Filas sueltas de accesorios: nombre propio y un solo precio.
        if mode == 'accessory' and c0.strip() and is_num(d.get(2)):
            name_n = norm(c0)
            targets = next((t for k, t in ACCESSORY_TARGETS.items() if k in name_n), ALL)
            products.append({'nombre': pretty(c0, c1 if name_n == 'medias' else ''),
                             'clave': name_n, 'detalle': '', 'linea': '', 'colegios': targets,
                             'categoria': 'Accesorios', 'promo': 'C',
                             'sizes': [['Único', round(float(d[2]))]], 'fila': r})
            continue
        if n0 == 'vinilo' and is_num(d.get(2)):
            close(); prod = None
            products.append({'nombre': 'Número de vinilo, ' + fix(d.get(3, '')), 'clave': 'vinilo',
                             'detalle': 'Para remeras y musculosas deportivas', 'linea': '',
                             'colegios': ['cjh'], 'categoria': 'Accesorios', 'promo': 'C',
                             'sizes': [['Único', round(float(d[2]))]], 'fila': r})
            continue

        if prod is not None and SIZE_RE.match(n0.replace(' ', '')) and is_num(d.get(2)):
            prod['sizes'].append([c0.strip().upper().replace(' ', ''), round(float(d[2]))])
            continue

        # Cualquier otra fila: marca de sección o descripción de tela.
        if prod is not None:
            close(); prod = None
        if mode == 'school' or mode == 'accessory':
            for marker, ids in SECTION_MARKERS:
                if n0.startswith(marker) or (not n0 and n1.startswith(marker)):
                    current = ids
                    mode = 'school'
                    break
        parts = [fix(d[k]) for k in (1, 2, 3) if k in d and not is_num(d[k])]
        parts = [p for p in parts if p and not any(s in p for s in DESC_SKIP)]
        uniq = []
        for p in parts:
            if p not in uniq:
                uniq.append(p)
        last_desc = {'text': ', '.join(uniq)[:120],
                     'raw': ' '.join(str(d[k]) for k in (1, 2, 3, 4) if k in d)}
    close()

    # Mismo nombre dos veces en un colegio: se distingue por la tela.
    seen = {}
    for p in products:
        for s in p['colegios']:
            seen.setdefault((s, p['nombre']), []).append(p)
    for (_, _), group in seen.items():
        if len(group) > 1:
            for i, p in enumerate(group):
                if p['detalle'] and p['detalle'] not in p['nombre']:
                    p['nombre_extra'] = p['detalle'].split(', ')[0]
    return date_cell, products


def main():
    path = sys.argv[1]
    sheet = sys.argv[2] if len(sys.argv) > 2 else 'junio 2026 0,6'
    out = Path(sys.argv[3]) if len(sys.argv) > 3 else Path(__file__).parent.parent / 'precios.js'
    fecha, products = extract(path, sheet)
    data = {
        'fuente': {'archivo': Path(path).name, 'hoja': sheet,
                   'fecha': fecha.isoformat() if fecha else None},
        'colegios': SCHOOLS,
        'productos': [{
            'id': f"p{p['fila']}", 'nombre': p['nombre'] + (f" ({p['nombre_extra']})" if p.get('nombre_extra') else ''),
            'detalle': p['detalle'], 'linea': p['linea'], 'categoria': p['categoria'],
            'promo': p['promo'], 'colegios': p['colegios'],
            'talles': [{'t': t, 'p': v} for t, v in p['sizes']],
        } for p in products],
    }
    js = ('/* Generado por scripts/extraer_precios.py. No editar a mano: '
          'volvé a correr el script cuando cambie la lista. */\n'
          'window.LISTA = ' + json.dumps(data, ensure_ascii=False, indent=1) + ';\n')
    out.write_text(js, encoding='utf-8')
    print(f'{len(products)} prendas, hoja "{sheet}" ({fecha}) -> {out}')


if __name__ == '__main__':
    main()
