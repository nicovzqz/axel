"""Lista de precios para el asistente: el Excel que mantiene Axel.

Formato (una fila por prenda y por colegio):

    Colegio | Nivel | Prenda | Modelo | Línea | Detalle | 1 | 2 | 3 | ... | XXXXL | Único

- Colegio: nombre exacto de la lista COLEGIOS (una sola por fila).
- Nivel: Jardín, Primaria, Secundaria o Profesorado. Varios, separados por coma.
  Vacío = la prenda se ofrece en todos los niveles del colegio.
- Prenda: Pantalón, Buzo, Campera, Remera, Chomba, Pollera, Short, Bermuda, Calza, Equipo,
  Pullover, Chaleco, Delantal, Medias, Mochila, Morral...
- Modelo: lo que distingue esta prenda de otras del mismo tipo ("fino achupinado").
- Línea: Premium, Clásica o vacío (prendas sin línea, como el pantalón gris).
- Detalle: tela o descripción breve (opcional).
- Una columna por talle con el PRECIO DE LISTA. Vacío = no viene en ese talle.
  Accesorios con un solo precio: columna "Único".

La promoción de cada prenda se deduce sola: Premium de pantalón, buzo, campera o equipo → grupo A;
Premium de remera, chomba, short o pollera pantalón → grupo B; el resto → grupo C (ver PROMOS en app.js).

Uso:
    python scripts/lista_web.py lista_web.xlsx        (o lista_web.csv)
genera precios.js, que es lo que lee el sitio.
"""
import csv
import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

COLEGIOS = {
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
TALLES = ['1', '2', '3', '4', '5', '6', '7', '8', '10', '12', '14', '16', '18', '20', '22', '24', '26', '28', '30',
          '36', '38', '40', '42', '44', '46', '48', '50', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL', 'Único']
COLUMNAS = ['Colegio', 'Nivel', 'Prenda', 'Modelo', 'Línea', 'Detalle'] + TALLES
NIVELES = {'jardin': 'Jardín', 'primaria': 'Primaria', 'secundaria': 'Secundaria', 'profesorado': 'Profesorado'}
LINEAS = {'premium': 'Premium', 'clasica': 'Clásica'}

CATEGORIAS = [
    ('Accesorios', ('medias', 'mochila', 'morral', 'numero', 'vinilo')),
    ('Delantales', ('delantal',)),
    ('Polleras, shorts y bermudas', ('pollera', 'short', 'bermuda')),
    ('Remeras y chombas', ('remera', 'chomba', 'musculosa')),
    ('Buzos, camperas y abrigo', ('buzo', 'campera', 'chaleco', 'pullover')),
    ('Pantalones y equipos', ('pantalon', 'equipo', 'calza')),
]
TALLE_ADULTO = {'1': 'XL', '2': 'XXL', '3': 'XXXL', '4': 'XXXXL'}


def norm(s):
    s = unicodedata.normalize('NFD', str(s)).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', s).strip().lower()


def talle_col(label):
    """Etiqueta de la planilla vieja → columna: "12/XS" → 12; "1/XL", "3/XXL" → XL, XXXL."""
    label = label.strip()
    if norm(label) == 'unico':
        return 'Único'
    parts = [p.strip().upper() for p in label.split('/')]
    if len(parts) > 1 and parts[0] in TALLE_ADULTO:
        return TALLE_ADULTO[parts[0]]
    return parts[0]


def categoria(prenda):
    n = norm(prenda)
    for cat, words in CATEGORIAS:
        if any(n.startswith(w) for w in words):
            return cat
    return 'Pantalones y equipos'


def promo(prenda, modelo, linea):
    if linea != 'Premium':
        return 'C'
    n, m = norm(prenda), norm(modelo)
    if n.startswith(('remera', 'chomba', 'short')) or (n.startswith('pollera') and m.startswith('pantalon')):
        return 'B'
    if n.startswith(('pantalon', 'buzo', 'campera', 'equipo')):
        return 'A'
    return 'C'


def precio(v):
    """Acepta 58787, 58787.5, "$58.787" o "58.787,50"."""
    if v is None:
        return None
    s = str(v).strip().replace('$', '').replace(' ', '')
    if not s:
        return None
    if ',' in s:
        s = s.replace('.', '').replace(',', '.')
    elif re.fullmatch(r'\d{1,3}(\.\d{3})+', s):
        s = s.replace('.', '')
    try:
        return round(float(s))
    except ValueError:
        return None


# ---------- Escribir la plantilla ----------

def write_template(rows, path):
    """rows: dicts con las claves de COLUMNAS (talles como precio numérico)."""
    with Path(path).open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=COLUMNAS, delimiter=';')
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, '') for k in COLUMNAS})


# ---------- Leer la planilla de Axel ----------

def read_rows(path):
    path = Path(path)
    if path.suffix.lower() == '.csv':
        raw = path.read_bytes()
        # Excel en castellano guarda los CSV en Windows-1252; si no es UTF-8, se lee así.
        try:
            text = raw.decode('utf-8-sig')
        except UnicodeDecodeError:
            text = raw.decode('cp1252')
        sample = text[:4096]
        delim = ';' if sample.count(';') >= sample.count(',') else ','
        return list(csv.DictReader(text.splitlines(), delimiter=delim))
    sys.path.insert(0, str(Path(__file__).parent))
    from xlsx_lite import load, rows  # noqa: E402
    z, shared, sheets = load(str(path))
    part = sheets[0][2]
    header, out = None, []
    for _, cells in rows(z, shared, part):
        if header is None:
            header = {i: str(v).strip() for i, v in cells.items()}
            continue
        out.append({header[i]: v for i, v in cells.items() if i in header})
    return out


def build(path):
    colegio_id = {norm(v): k for k, v in COLEGIOS.items()}
    talle_cols = {norm(t): t for t in TALLES}
    productos, avisos = [], []
    for n, r in enumerate(read_rows(path), start=2):
        r = {str(k).strip(): v for k, v in r.items() if k is not None}
        if not any(str(v).strip() for v in r.values()):
            continue
        col = colegio_id.get(norm(r.get('Colegio', '')))
        if not col:
            avisos.append(f'fila {n}: colegio desconocido "{r.get("Colegio", "")}"')
            continue
        prenda = str(r.get('Prenda', '')).strip()
        modelo = str(r.get('Modelo', '')).strip()
        if not prenda:
            avisos.append(f'fila {n}: falta la prenda')
            continue
        linea = LINEAS.get(norm(r.get('Línea', r.get('Linea', ''))), '')
        niveles = []
        for part in re.split(r'[,;/]', str(r.get('Nivel', ''))):
            if norm(part) in NIVELES:
                niveles.append(NIVELES[norm(part)])
            elif norm(part):
                avisos.append(f'fila {n}: nivel desconocido "{part.strip()}"')
        talles = []
        for k, v in r.items():
            t = talle_cols.get(norm(k))
            p = precio(v) if t else None
            if t and p:
                talles.append({'t': t, 'p': p})
        talles.sort(key=lambda x: TALLES.index(x['t']))
        if not talles:
            avisos.append(f'fila {n}: {prenda} {modelo} no tiene precios')
            continue
        nombre = (prenda + ' ' + modelo).strip()
        productos.append({
            'id': f'w{n}', 'nombre': nombre[:1].upper() + nombre[1:], 'detalle': str(r.get('Detalle', '')).strip(),
            'linea': linea, 'categoria': categoria(prenda), 'promo': promo(prenda, modelo, linea),
            'colegios': [col], 'niveles': niveles, 'talles': talles,
        })
    return productos, avisos


def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent.parent / 'lista_web.csv')
    out = Path(__file__).parent.parent / 'precios.js'
    productos, avisos = build(src)
    for a in avisos:
        print('  aviso:', a, file=sys.stderr)
    data = {
        'fuente': {'archivo': src.name, 'fecha': date.today().isoformat()},
        'colegios': COLEGIOS,
        'productos': productos,
    }
    out.write_text('/* Generado por scripts/lista_web.py a partir de ' + src.name +
                   '. No editar a mano. */\nwindow.LISTA = ' + json.dumps(data, ensure_ascii=False, indent=1) + ';\n',
                   encoding='utf-8')
    con_nivel = sum(1 for p in productos if p['niveles'])
    print(f'{len(productos)} filas -> {out.name} ({con_nivel} con nivel, {len(productos) - con_nivel} para todos los niveles)')


if __name__ == '__main__':
    main()
