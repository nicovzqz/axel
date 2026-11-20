// API de clientes del asistente de Uniformes M.
//   POST /api/leads         el chat guarda o actualiza un presupuesto (público, con límites)
//   GET  /api/leads         lista para controlar ingresos (requiere ADMIN_TOKEN)
//   GET  /api/leads.csv     lo mismo en CSV para abrir con Excel
//   GET  /api/resumen       ingresos por día (requiere ADMIN_TOKEN)
//   GET  /api/salud         chequeo de vida
const fs = require('fs');
const path = require('path');
const express = require('express');
const {Pool} = require('pg');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
if (ADMIN_TOKEN.length < 16) {
  console.error('ADMIN_TOKEN falta o es muy corto (mínimo 16 caracteres).');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL.');
  process.exit(1);
}

// Base local (Docker) sin SSL; Supabase u otra base remota, con SSL.
// Se quita sslmode de la URL para que mande esta configuración.
const dbUrl = new URL(process.env.DATABASE_URL);
const local = ['db', 'localhost', '127.0.0.1'].includes(dbUrl.hostname);
dbUrl.searchParams.delete('sslmode');
const pool = new Pool({connectionString: dbUrl.toString(), ssl: local ? false : {rejectUnauthorized: false}, max: 5});

const app = express();
app.disable('x-powered-by');
// Render (y cualquier proxy) manda la IP real del visitante en X-Forwarded-For.
app.set('trust proxy', 1);
app.use(express.json({limit: '20kb'}));

// CORS: solo los orígenes del sitio.
app.use((req, res, next) => {
  const origin = req.get('Origin');
  if (origin && ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Límite simple por IP para el endpoint público: 60 envíos cada 10 minutos.
const hits = new Map();
function limite(req, res, next) {
  const now = Date.now();
  const ip = req.ip;
  const list = (hits.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
  if (list.length >= 60) return res.status(429).json({error: 'Demasiados envíos, probá más tarde.'});
  list.push(now);
  hits.set(ip, list);
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) if (!list.some(t => now - t < 10 * 60 * 1000)) hits.delete(ip);
}, 60 * 1000).unref();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ETAPAS = ['contacto', 'datos', 'presupuesto', 'pdf', 'reserva', 'whatsapp'];
const texto = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const entero = v => (Number.isInteger(v) && v >= 0 && v < 1e10 ? v : null);

function validar(b) {
  if (!b || typeof b !== 'object') return 'Datos inválidos.';
  if (!UUID.test(b.sesion || '')) return 'Sesión inválida.';
  if (!ETAPAS.includes(b.etapa)) return 'Etapa inválida.';
  const tel = String(b.telefono || '').replace(/\D/g, '');
  if (tel.length < 8 || tel.length > 13) return 'Teléfono inválido.';
  if (b.presupuesto != null && (!Array.isArray(b.presupuesto) || b.presupuesto.length > 60)) return 'Presupuesto inválido.';
  return null;
}
function limpiarPresupuesto(lista) {
  if (!Array.isArray(lista)) return null;
  return lista.map(it => ({
    prenda: texto(it.prenda, 120), linea: texto(it.linea, 20), talle: texto(String(it.talle ?? ''), 12),
    cantidad: entero(it.cantidad), precio_lista: entero(it.precio_lista)
  }));
}

app.post('/api/leads', limite, async (req, res) => {
  const b = req.body;
  const error = validar(b);
  if (error) return res.status(400).json({error});
  const presupuesto = limpiarPresupuesto(b.presupuesto);
  try {
    // Una fila por sesión: cada envío completa o actualiza lo que ya había.
    await pool.query(`
      INSERT INTO leads (sesion, etapa, nombre, telefono, colegio, nivel, anio, talle, presupuesto,
        total_lista, total_efectivo, total_3_pagos, total_6_pagos, reserva, descargo_pdf, abrio_whatsapp, origen)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      ON CONFLICT (sesion) DO UPDATE SET
        actualizado = now(),
        etapa = EXCLUDED.etapa,
        nombre = coalesce(EXCLUDED.nombre, leads.nombre),
        telefono = coalesce(EXCLUDED.telefono, leads.telefono),
        colegio = coalesce(EXCLUDED.colegio, leads.colegio),
        nivel = coalesce(EXCLUDED.nivel, leads.nivel),
        anio = coalesce(EXCLUDED.anio, leads.anio),
        talle = coalesce(EXCLUDED.talle, leads.talle),
        presupuesto = coalesce(EXCLUDED.presupuesto, leads.presupuesto),
        total_lista = coalesce(EXCLUDED.total_lista, leads.total_lista),
        total_efectivo = coalesce(EXCLUDED.total_efectivo, leads.total_efectivo),
        total_3_pagos = coalesce(EXCLUDED.total_3_pagos, leads.total_3_pagos),
        total_6_pagos = coalesce(EXCLUDED.total_6_pagos, leads.total_6_pagos),
        reserva = coalesce(EXCLUDED.reserva, leads.reserva),
        descargo_pdf = leads.descargo_pdf OR EXCLUDED.descargo_pdf,
        abrio_whatsapp = leads.abrio_whatsapp OR EXCLUDED.abrio_whatsapp`,
    [b.sesion, b.etapa, texto(b.nombre, 80), String(b.telefono).replace(/\D/g, ''), texto(b.colegio, 120),
      texto(b.nivel, 30), texto(b.anio, 20), texto(b.talle, 12), presupuesto ? JSON.stringify(presupuesto) : null,
      entero(b.total_lista), entero(b.total_efectivo), entero(b.total_3_pagos), entero(b.total_6_pagos),
      texto(b.reserva, 60), b.descargo_pdf === true, b.abrio_whatsapp === true, texto(b.origen, 80)]);
    res.status(204).end();
  } catch (e) {
    console.error('Error guardando lead:', e.message);
    res.status(500).json({error: 'No se pudo guardar.'});
  }
});

// ---------- Consultas para controlar ingresos (con token) ----------
// Express 4 no atrapa errores de funciones async: sin esto, una falla de la base tumba el proceso.
const seguro = fn => (req, res, next) => fn(req, res, next).catch(e => {
  console.error('Error consultando:', e.message);
  res.status(500).json({error: 'No se pudo consultar.'});
});
function admin(req, res, next) {
  const token = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '') || req.query.token;
  if (token !== ADMIN_TOKEN) return res.status(401).json({error: 'No autorizado.'});
  next();
}
async function listar(req) {
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde || '') ? req.query.desde : '1970-01-01';
  const {rows} = await pool.query(
    `SELECT id, creado, actualizado, nombre, telefono, colegio, nivel, anio, talle, etapa, presupuesto,
            total_lista, total_efectivo, total_3_pagos, total_6_pagos, reserva, descargo_pdf, abrio_whatsapp, origen
       FROM leads WHERE creado >= $1::date ORDER BY creado DESC LIMIT 5000`, [desde]);
  return rows;
}
app.get('/api/leads', admin, seguro(async (req, res) => res.json(await listar(req))));
app.get('/api/leads.csv', admin, seguro(async (req, res) => {
  const rows = await listar(req);
  const cols = ['creado', 'nombre', 'telefono', 'colegio', 'nivel', 'anio', 'talle', 'etapa', 'prendas',
    'total_lista', 'total_efectivo', 'total_3_pagos', 'total_6_pagos', 'reserva', 'descargo_pdf', 'abrio_whatsapp'];
  const cell = v => {
    const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lineas = rows.map(r => cols.map(c => cell(c === 'prendas'
    ? (r.presupuesto || []).map(p => `${p.cantidad} x ${p.prenda} (${p.talle})`).join(' | ')
    : r[c])).join(';'));
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="clientes-uniformes-m.csv"');
  // Marca BOM al principio: Excel abre el CSV con acentos correctos.
  res.send(String.fromCharCode(0xfeff) + [cols.join(';'), ...lineas].join('\r\n'));
}));
app.get('/api/resumen', admin, seguro(async (req, res) => {
  const {rows} = await pool.query('SELECT * FROM resumen_diario LIMIT 90');
  res.json(rows);
}));
app.get('/api/salud', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ok: true});
  } catch (e) {
    res.status(503).json({ok: false});
  }
});

// Crea o actualiza la tabla y la vista al arrancar (en Supabase no hay otro paso de instalación).
async function prepararBase() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'init.sql'), 'utf8');
  await pool.query(sql);
}
prepararBase()
  .then(() => app.listen(PORT, () => console.log(`API de Uniformes M escuchando en el puerto ${PORT}`)))
  .catch(e => {
    console.error('No se pudo preparar la base de datos:', e.message);
    process.exit(1);
  });
