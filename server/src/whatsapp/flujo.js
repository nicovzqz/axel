// Conversación del bot de WhatsApp: el mismo recorrido que el chat de la web (assets/bot.js),
// adaptado a los mensajes de WhatsApp (botones de hasta 3 opciones, listas de hasta 10).
// Es una función pura sobre un "estado" serializable: no sabe nada de Meta ni de la base,
// así se puede probar simulando mensajes. registrar() guarda el cliente (lo inyecta index.js).
const crypto = require('crypto');

const SCHOOL_ORDER = ['cjh', 'ib', 'sj', 'lm', 'isa', 'rd', 'jn', 'ijh', 'aguer', 'prof', 'jb', 'el', 'as'];
/* Qué pregunta cada colegio y en qué orden (guía de Axel). El teléfono no se pide: lo da WhatsApp. */
const COLEGIO_PREGUNTAS = {
  rd: {orden: ['nombre', 'talle', 'anio', 'nivel'], niveles: ['Primaria', 'Secundaria']},
  jn: {orden: ['nombre', 'anio', 'talle'], fijo: 'Jardín'},
  jb: {orden: ['nombre', 'anio', 'talle'], fijo: 'Jardín'},
  ijh: {orden: ['nombre', 'talle', 'anio']},
  aguer: {orden: ['nombre', 'talle', 'anio']},
  prof: {orden: ['nombre', 'talle', 'anio'], fijo: 'Profesorado'}
};
const PREGUNTAS_COMUNES = {orden: ['nombre', 'talle', 'anio', 'nivel'], niveles: ['Jardín', 'Primaria', 'Secundaria']};
const preguntas = id => COLEGIO_PREGUNTAS[id] || PREGUNTAS_COMUNES;
const SALAS = ['Sala de 3', 'Sala de 4', 'Sala de 5'];
const GRADOS = ['1º', '2º', '3º', '4º', '5º', '6º'];
const ORDEN_LETRAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'];
const LIMITE = 4;
const VENTANA_MS = 72 * 60 * 60 * 1000;
const PIE = 'Escribí volver, menú o persona cuando quieras';

const normal = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const corta = (s, n) => (s.length <= n ? s : s.slice(0, n - 1) + '…');
const has = (q, ...words) => words.some(w => new RegExp('\\b' + w).test(q));

function crearFlujo(datos, {registrar = () => {}, ahora = () => new Date()} = {}) {
  const {PROMOS, PROMO_ORDER, SIN_PROMO, SEIS_PAGOS, WHATSAPP, LOCAL, LISTA, SCHOOLS, PRODUCTS} = datos;

  /* ---------- Precios y promos (mismas reglas que assets/app.js) ---------- */
  const hoyAR = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Argentina/Buenos_Aires'}).format(ahora());
  const activePromo = g => (PROMOS[g] && hoyAR() <= PROMOS[g].vence ? PROMOS[g] : null);
  const descuentos = g => activePromo(g) || SIN_PROMO;
  const pesos = n => '$' + Math.round(n).toLocaleString('es-AR');
  const fecha = iso => iso.split('-').reverse().slice(0, 2).join('/');
  function precios(lista, g) {
    const d = descuentos(g);
    return {
      lista,
      efectivo: Math.round(lista * (100 - d.efectivo) / 100),
      tresPagos: Math.round(lista * (100 - d.tresPagos) / 100),
      seisPagos: Math.round(lista * (100 - SEIS_PAGOS.descuento) / 100)
    };
  }
  const lineaDe = p => (p.linea === 'Clásica' ? 'Clásica' : p.linea === 'Premium' && p.promo !== 'C' ? 'Premium' : '');
  const tipoDe = p => (p.categoria === 'Accesorios' ? 'Accesorios' : p.nombre.split(' ')[0]);
  const talleTxt = t => (t === 'Único' ? 'talle único' : 'talle ' + t);
  function tallekey(label) {
    const [num, letras] = String(label).toUpperCase().split('/').map(s => s.trim());
    return letras && /^\d$/.test(num) ? letras : num;
  }

  /* ---------- Mensajes ---------- */
  const texto = t => ({tipo: 'texto', texto: t});
  const botones = (t, lista) => ({tipo: 'botones', texto: t, pie: PIE, botones: lista.slice(0, 3)});
  /* Lista con página: si hay más de 10 opciones, muestra 9 y "Ver más". */
  function lista(t, filas, e, boton = 'Ver opciones') {
    const pagina = e.pagina || 0;
    const inicio = pagina * 9;
    const resto = filas.length - inicio;
    let visibles = filas.slice(inicio, inicio + (resto > 10 ? 9 : 10));
    if (resto > 10) visibles = [...visibles, {id: 'mas:' + (pagina + 1), titulo: 'Ver más opciones'}];
    if (pagina > 0) visibles = [{id: 'mas:' + (pagina - 1), titulo: 'Opciones anteriores'}, ...visibles].slice(0, 10);
    return {tipo: 'lista', texto: t, pie: PIE, boton, filas: visibles.map(f => ({...f, titulo: corta(f.titulo, 24), descripcion: f.descripcion ? corta(f.descripcion, 72) : undefined}))};
  }
  const filaColegio = (prefijo, id) => ({id: prefijo + id, titulo: SCHOOLS[id], descripcion: SCHOOLS[id].length > 24 ? SCHOOLS[id] : undefined});

  /* ---------- Datos del pedido ---------- */
  function productosDelColegio(ctx) {
    return LISTA.productos.filter(p => p.colegios.includes(ctx.colegio) &&
      (!ctx.nivel || !p.niveles || !p.niveles.length || p.niveles.includes(ctx.nivel)));
  }
  const prendasDelPedido = ctx => productosDelColegio(ctx).filter(p => p.categoria !== 'Accesorios');
  function talleIndex(p, talle) {
    if (p.talles.length === 1) return 0;
    return talle ? p.talles.findIndex(t => tallekey(t.t) === talle) : -1;
  }
  function precioEnTalle(p, ctx) {
    if (!ctx.talle) return Math.min(...p.talles.map(t => t.p));
    const i = talleIndex(p, ctx.talle);
    return i >= 0 ? p.talles[i].p : null;
  }
  function tallesDisponibles(ctx) {
    const set = new Set(prendasDelPedido(ctx).flatMap(p => p.talles.map(t => tallekey(t.t))));
    const nums = [...set].filter(t => /^\d+$/.test(t)).sort((a, b) => a - b);
    const letras = [...set].filter(t => !/^\d+$/.test(t) && t !== 'ÚNICO').sort((a, b) => ORDEN_LETRAS.indexOf(a) - ORDEN_LETRAS.indexOf(b));
    return [...nums, ...letras];
  }
  function totales(cart) {
    return cart.reduce((a, it) => {
      const p = PRODUCTS[it.id];
      const pr = precios(p.talles[it.ti].p, p.promo);
      a.lista += pr.lista * it.qty;
      a.efectivo += pr.efectivo * it.qty;
      a.tresPagos += pr.tresPagos * it.qty;
      a.seisPagos += pr.seisPagos * it.qty;
      return a;
    }, {lista: 0, efectivo: 0, tresPagos: 0, seisPagos: 0});
  }
  function datosPresupuesto(ctx) {
    const t = totales(ctx.cart);
    return {
      presupuesto: ctx.cart.map(it => {
        const p = PRODUCTS[it.id];
        return {prenda: p.nombre, linea: lineaDe(p) || null, talle: p.talles[it.ti].t, cantidad: it.qty, precio_lista: p.talles[it.ti].p};
      }),
      total_lista: t.lista, total_efectivo: t.efectivo, total_3_pagos: t.tresPagos, total_6_pagos: t.seisPagos
    };
  }
  function detalle(ctx) {
    return ctx.cart.map(it => {
      const p = PRODUCTS[it.id];
      return `• ${it.qty} × ${p.nombre}, ${talleTxt(p.talles[it.ti].t)}`;
    }).join('\n');
  }
  /* Link a WhatsApp del local con el pedido ya escrito. */
  function linkLocal(e, extra, n = 0) {
    const c = e.ctx;
    const partes = [c.nombre ? `Hola, soy ${c.nombre}.` : 'Hola.'];
    if (c.colegio) partes.push(`Consulto por uniformes de ${SCHOOLS[c.colegio]}${[c.nivel, c.anio].filter(Boolean).length ? ', ' + [c.nivel, c.anio].filter(Boolean).join(' ') : ''}${c.talle ? ', talle ' + c.talle : ''}.`);
    if (extra) partes.push(extra);
    return `https://wa.me/${WHATSAPP[n]}?text=${encodeURIComponent(partes.join(' '))}`;
  }

  /* ---------- Pasos: qué se muestra en cada uno ---------- */
  const R = {
    menu(e) {
      return [lista('¡Hola! Soy el asistente automático de *Uniformes M*. Te ayudo con precios, talles, promociones, horarios y cómo llegar. ¿Qué necesitás?', [
        {id: 'm:presupuesto', titulo: 'Necesito presupuesto'},
        {id: 'm:colegios', titulo: 'Colegios', descripcion: 'Con qué colegios trabajamos'},
        {id: 'm:horario', titulo: 'Horario'},
        {id: 'm:llegar', titulo: 'Cómo llegar'},
        {id: 'm:promos', titulo: 'Promociones'},
        {id: 'm:canal', titulo: 'Promos exclusivas', descripcion: 'Seguinos en nuestro canal'},
        {id: 'm:persona', titulo: 'Atención personalizada'}
      ], e, 'Ver menú')];
    },
    colegios(e) {
      return [lista('Trabajamos con estas instituciones. Elegí la tuya:', SCHOOL_ORDER.map(id => filaColegio('cv:', id)), e, 'Ver colegios')];
    },
    colegioElegido(e, id) {
      return [botones(`Hacemos los uniformes de *${SCHOOLS[id]}*. ¿Necesitás presupuesto?`, [
        {id: 'p:si', titulo: 'Necesito presupuesto'}, {id: 'nav:volver', titulo: 'Volver'}, {id: 'nav:menu', titulo: 'Menú'}
      ])];
    },
    colegio(e) {
      return [lista('¿De qué colegio?', SCHOOL_ORDER.map(id => filaColegio('col:', id)), e, 'Ver colegios')];
    },
    nombre() {
      return [texto('Contame, ¿cuál es tu nombre?')];
    },
    talle(e) {
      const tl = tallesDisponibles(e.ctx);
      const ejemplos = ['8', '12', '16', '44', 'XL'].filter(t => tl.includes(t)).slice(0, 3);
      return [texto(`¿Qué talle usa? Escribilo, por ejemplo *${(ejemplos.length ? ejemplos : tl.slice(0, 3)).join('*, *')}*.\nSi no lo sabés, escribí *no sé*.`)];
    },
    anio(e) {
      const q = preguntas(e.ctx.colegio);
      const opciones = q.fijo === 'Jardín' ? SALAS : q.fijo === 'Profesorado' ? GRADOS.slice(0, 4)
        : (q.niveles || []).includes('Jardín') ? [...SALAS, ...GRADOS] : GRADOS;
      return [lista(q.fijo === 'Jardín' ? '¿Qué sala?' : '¿Qué año de curso?', opciones.map(a => ({id: 'anio:' + a, titulo: a})), e, 'Elegir')];
    },
    nivel(e) {
      const q = preguntas(e.ctx.colegio);
      const niveles = q.niveles.filter(n => n !== 'Jardín');
      return [botones('¿Qué nivel?', niveles.map(n => ({id: 'niv:' + n, titulo: n})))];
    },
    lista(e) {
      const ctx = e.ctx;
      const tipos = new Map();
      prendasDelPedido(ctx).forEach(p => {
        const precio = precioEnTalle(p, ctx);
        if (precio == null) return;
        const tipo = p.nombre.split(' ')[0];
        const t = tipos.get(tipo) || {Premium: [], Clásica: [], '': []};
        t[lineaDe(p)].push(precio);
        tipos.set(tipo, t);
      });
      const fmt = arr => `${arr.length > 1 || !ctx.talle ? 'desde ' : ''}${pesos(Math.min(...arr))}`;
      const filas = [...tipos].map(([tipo, t]) => {
        const partes = [];
        if (t.Premium.length) partes.push('Premium ' + fmt(t.Premium));
        if (t['Clásica'].length) partes.push('Clásica ' + fmt(t['Clásica']));
        if (!partes.length) partes.push(fmt(t['']));
        return `• *${tipo}*: ${partes.join(' · ')}`;
      });
      const titulo = [SCHOOLS[ctx.colegio], [ctx.nivel, ctx.anio].filter(Boolean).join(' '), ctx.talle ? 'talle ' + ctx.talle : 'todos los talles'].join(' · ');
      const hay = l => prendasDelPedido(ctx).some(p => lineaDe(p) === l);
      return [
        texto(`*${(ctx.nombre || '').split(' ')[0]}, tu presupuesto en precio de lista*\n_${titulo}_\n\n${filas.join('\n') || 'No tenemos ese talle cargado; igual podés armar el presupuesto y te mostramos los talles de cada prenda.'}`),
        lista('*Armemos tu presupuesto*: elegí las prendas y te sumo todo con la promoción aplicada. También podés ver cada línea con sus promociones.', [
          {id: 'a:armar', titulo: 'Armar mi presupuesto'},
          ...(hay('Clásica') ? [{id: 'linea:Clásica', titulo: 'Línea Clásica'}] : []),
          ...(hay('Premium') ? [{id: 'linea:Premium', titulo: 'Línea Premium'}] : []),
          {id: 'a:reserva', titulo: 'Reserva'},
          {id: 'p:otro', titulo: 'Quiero otro presupuesto'},
          {id: 'm:persona', titulo: 'Atención personalizada'}
        ], e)
      ];
    },
    linea(e, linea) {
      const ctx = e.ctx;
      const tipos = new Map();
      prendasDelPedido(ctx).filter(p => lineaDe(p) === linea).forEach(p => {
        const precio = precioEnTalle(p, ctx);
        if (precio == null) return;
        const tipo = p.nombre.split(' ')[0];
        const actual = tipos.get(tipo);
        if (!actual || precio < actual.lista) tipos.set(tipo, {...precios(precio, p.promo), n: (actual ? actual.n : 0) + 1});
        else actual.n++;
      });
      const filas = [...tipos].map(([tipo, r]) => `• *${tipo}*: ${r.n > 1 || !ctx.talle ? 'desde ' : ''}${pesos(r.lista)} de lista · ${pesos(r.efectivo)} efectivo · ${pesos(r.tresPagos)} en 3 pagos`);
      const grupos = [...new Set(prendasDelPedido(ctx).filter(p => lineaDe(p) === linea).map(p => p.promo))];
      const promos = grupos.map(g => {
        const p = activePromo(g);
        const d = descuentos(g);
        const pct = v => (v ? v + '% off' : 'precio de lista');
        return `_${p ? p.nombre + ' (hasta el ' + fecha(p.vence) + ')' : 'Línea ' + linea}_: efectivo o transferencia ${pct(d.efectivo)} · 3 pagos ${pct(d.tresPagos)} · 6 pagos ${pct(SEIS_PAGOS.descuento)}`;
      });
      const otra = linea === 'Premium' ? 'Clásica' : 'Premium';
      return [
        texto(`*Línea ${linea}*${ctx.talle ? ' · talle ' + ctx.talle : ''}\n\n${filas.join('\n')}\n\n${promos.join('\n')}\n\nCon otros medios de pago, precio de lista.`),
        lista('¿Seguimos?', [
          {id: 'a:armar', titulo: 'Armar mi presupuesto'},
          ...(prendasDelPedido(ctx).some(p => lineaDe(p) === otra) ? [{id: 'linea:' + otra, titulo: 'Ver línea ' + otra}] : []),
          {id: 'a:reserva', titulo: 'Reserva'},
          {id: 'p:otro', titulo: 'Quiero otro presupuesto'},
          {id: 'm:persona', titulo: 'Atención personalizada'}
        ], e)
      ];
    },
    prendas(e, arg = {}) {
      const tipos = [...new Set(productosDelColegio(e.ctx).map(tipoDe))];
      const filas = tipos.map(t => ({id: 'tipo:' + t, titulo: t}));
      if (e.ctx.cart.length) filas.unshift({id: 'r:ver', titulo: 'Ver mi presupuesto'});
      return [lista(arg.otra ? '¿Qué otra prenda sumamos?' : '¿Qué prendas necesitás? Elegí una y después te pregunto el modelo y la cantidad.', filas, e, 'Ver prendas')];
    },
    variante(e, tipo) {
      const opciones = productosDelColegio(e.ctx).filter(p => tipoDe(p) === tipo);
      return [lista(`¿Qué ${tipo === 'Accesorios' ? 'accesorio' : tipo.toLowerCase()}?`, opciones.map(p => {
        const precio = precioEnTalle(p, e.ctx);
        const linea = lineaDe(p);
        return {id: 'var:' + p.id, titulo: p.nombre, descripcion: [linea, precio != null && e.ctx.talle ? pesos(precio) + ' de lista' : '', p.nombre.length > 24 ? p.nombre : ''].filter(Boolean).join(' · ')};
      }), e, 'Ver modelos')];
    },
    talleItem(e, id) {
      const p = PRODUCTS[id];
      return [lista(e.ctx.talle ? `Esa prenda no viene en talle ${e.ctx.talle}. ¿Qué talle querés?` : '¿En qué talle?',
        p.talles.map((t, ti) => ({id: `ti:${id}:${ti}`, titulo: t.t, descripcion: pesos(t.p) + ' de lista'})), e, 'Ver talles')];
    },
    cantidad(e, {id, ti}) {
      const p = PRODUCTS[id];
      return [botones(`*${p.nombre}*, ${talleTxt(p.talles[ti].t)}: ${pesos(p.talles[ti].p)} de lista.\n¿Cuántas? También podés escribir el número.`,
        [1, 2, 3].map(n => ({id: 'cant:' + n, titulo: String(n)})))];
    },
    agregado(e, {id, ti, qty}) {
      const p = PRODUCTS[id];
      const n = e.ctx.cart.reduce((a, it) => a + it.qty, 0);
      return [botones(`Listo, agregué *${qty} × ${p.nombre}* (${talleTxt(p.talles[ti].t)}). Llevás ${n} ${n === 1 ? 'prenda' : 'prendas'}.`, [
        {id: 'r:ver', titulo: 'Ver presupuesto'}, {id: 'r:otra', titulo: 'Agregar otra prenda'}
      ])];
    },
    resumen(e) {
      const ctx = e.ctx;
      const t = totales(ctx.cart);
      const vence = ctx.cart.map(it => activePromo(PRODUCTS[it.id].promo)).filter(Boolean).map(p => p.vence).sort();
      registrar(lead(e, 'presupuesto', datosPresupuesto(ctx)));
      const filas = ctx.cart.map(it => {
        const p = PRODUCTS[it.id];
        const tl = p.talles[it.ti];
        return `• ${it.qty} × ${p.nombre} (${talleTxt(tl.t)}${lineaDe(p) ? ' · ' + lineaDe(p) : ''}): ${pesos(tl.p * it.qty)}`;
      });
      return [
        texto([
          `*Tu presupuesto*\n_${SCHOOLS[ctx.colegio]}${ctx.nivel ? ' · ' + [ctx.nivel, ctx.anio].filter(Boolean).join(' ') : ''}_`,
          filas.join('\n'),
          `Precio de lista: ${pesos(t.lista)}\n*Efectivo o transferencia: ${pesos(t.efectivo)}*${t.lista > t.efectivo ? ` (ahorrás ${pesos(t.lista - t.efectivo)})` : ''}\nEn 3 pagos: ${pesos(t.tresPagos)} (3 de ${pesos(t.tresPagos / 3)})\nEn 6 pagos: ${pesos(t.seisPagos)} (6 de ${pesos(t.seisPagos / 6)})`,
          `${vence.length ? `Promoción válida hasta el ${fecha(vence[0])}. ` : ''}Confirmamos stock al reservar.`
        ].join('\n\n')),
        lista('¿Cómo seguimos?', [
          {id: 'rv:retiro', titulo: 'Reservo y retiro', descripcion: 'Retirás en el local de Villa Ballester'},
          {id: 'rv:envio', titulo: 'Reservo con envío', descripcion: 'Solo efectivo o transferencia'},
          {id: 'r:otra', titulo: 'Agregar otra prenda'},
          {id: 'r:quitar', titulo: 'Quitar una prenda'},
          {id: 'p:otro', titulo: 'Quiero otro presupuesto'},
          {id: 'm:persona', titulo: 'Atención personalizada'}
        ], e)
      ];
    },
    quitar(e) {
      return [lista('¿Cuál quitamos?', e.ctx.cart.map((it, i) => {
        const p = PRODUCTS[it.id];
        return {id: 'q:' + i, titulo: `${it.qty} × ${p.nombre}`, descripcion: talleTxt(p.talles[it.ti].t)};
      }), e, 'Ver prendas')];
    },
    reserva(e) {
      return [lista('¿Cómo preferís recibirlo?', [
        {id: 'rv:retiro', titulo: 'Reservo y retiro', descripcion: 'Retirás en el local de Villa Ballester'},
        {id: 'rv:envio', titulo: 'Reservo con envío', descripcion: 'Solo efectivo o transferencia'}
      ], e)];
    },
    reservaFin(e, modo) {
      const ctx = e.ctx;
      const conCart = ctx.cart && ctx.cart.length;
      registrar(lead(e, 'reserva', {reserva: modo === 'retiro' ? 'Retira en el local' : 'Envío (efectivo o transferencia)', ...(conCart ? datosPresupuesto(ctx) : {})}));
      const pedido = (modo === 'retiro' ? 'Quiero reservar y retirar en el local.' : 'Quiero reservar y que me lo envíen (pago en efectivo o transferencia).') +
        (conCart ? '\n' + detalle(ctx) : '');
      const intro = modo === 'retiro'
        ? `*Reservá y retirá*\nTe esperamos en ${LOCAL.direccion}.\n${LOCAL.horarios}`
        : '*Reservá y te lo mandamos*\nCon envío, el pago es solo en efectivo o por transferencia.';
      return [
        texto(`${intro}\n\nPara confirmar la reserva, escribile a una persona del local con tu pedido ya armado:\n${linkLocal(e, pedido, 0)}\n\nU otro número: ${linkLocal(e, pedido, 1)}`),
        botones('¿Algo más?', [{id: 'nav:menu', titulo: 'Menú'}, {id: 'p:otro', titulo: 'Otro presupuesto'}])
      ];
    },
    horario() {
      return [botones(`*Horario*\n${LOCAL.horarios}`, [{id: 'm:llegar', titulo: 'Cómo llegar'}, {id: 'm:presupuesto', titulo: 'Necesito presupuesto'}, {id: 'nav:menu', titulo: 'Menú'}])];
    },
    llegar() {
      return [botones(`*Cómo llegar*\n${LOCAL.direccion}\n${LOCAL.mapa}`, [{id: 'm:horario', titulo: 'Horario'}, {id: 'm:presupuesto', titulo: 'Necesito presupuesto'}, {id: 'nav:menu', titulo: 'Menú'}])];
    },
    promos() {
      const live = PROMO_ORDER.filter(g => activePromo(g)).map(g => PROMOS[g]);
      const cuerpo = live.length
        ? '*Promociones vigentes*\n' + live.map(p => `• ${p.nombre}: *${p.efectivo}% off* en efectivo o transferencia${p.tresPagos ? `, ${p.tresPagos}% off en 3 pagos` : ''}. Hasta el ${fecha(p.vence)}.`).join('\n')
        : `*Descuento por pago*\n${SIN_PROMO.efectivo}% off pagando en efectivo o transferencia.`;
      return [botones(cuerpo, [{id: 'm:presupuesto', titulo: 'Necesito presupuesto'}, {id: 'nav:menu', titulo: 'Menú'}])];
    },
    canal() {
      return [botones('*Promociones exclusivas*\nSeguinos en Instagram y enterate antes que nadie:\nhttps://www.instagram.com/uniformescolegialesm/', [{id: 'nav:menu', titulo: 'Menú'}])];
    },
    persona(e) {
      return [texto(`Te atiende una persona del local. Escribile acá, con tu consulta ya armada:\n${linkLocal(e, 'Quiero atención personalizada.', 0)}\n\nU otro número: ${linkLocal(e, 'Quiero atención personalizada.', 1)}\n\nPara volver al menú, escribí *menú*.`)];
    },
    limite(e) {
      return [texto(`Ya armaste 4 presupuestos. Para seguir, te ayudamos a elegir en persona:\n${linkLocal(e, 'Necesito ayuda para elegir las prendas.', 0)}`)];
    }
  };

  /* ---------- Navegación ---------- */
  function lead(e, etapa, extra = {}) {
    const c = e.ctx;
    return {
      sesion: c.sesion, etapa, nombre: c.nombre || null, telefono: e.telefono,
      colegio: c.colegio ? SCHOOLS[c.colegio] : null, nivel: c.nivel || null, anio: c.anio || null,
      talle: c.talle === undefined ? null : c.talle || 'No sabe', origen: 'whatsapp', ...extra
    };
  }
  function mostrar(e, out) {
    const actual = e.pila[e.pila.length - 1] || {paso: 'menu'};
    out.push(...R[actual.paso](e, actual.arg));
  }
  function ir(e, out, paso, arg) {
    e.pagina = 0;
    e.pila.push({paso, arg});
    if (e.pila.length > 30) e.pila = e.pila.slice(-30);
    mostrar(e, out);
  }
  function reemplazar(e, out, paso, arg) {
    e.pagina = 0;
    e.pila[e.pila.length - 1] = {paso, arg};
    mostrar(e, out);
  }
  function inicio(e, out) {
    e.pila = [];
    e.ctx = {};
    ir(e, out, 'menu');
  }
  function volver(e, out) {
    e.pila.pop();
    e.pagina = 0;
    if (!e.pila.length) return inicio(e, out);
    mostrar(e, out);
  }
  function intentos(e) {
    const now = ahora().getTime();
    e.intentos = (e.intentos || []).filter(t => now - t < VENTANA_MS);
    return e.intentos;
  }
  function presupuesto(e, out, colegio) {
    if (intentos(e).length >= LIMITE) return ir(e, out, 'limite');
    e.ctx = {nombre: e.ctx.nombre, colegio, cart: [], sesion: crypto.randomUUID()};
    if (!colegio) return ir(e, out, 'colegio');
    avanzar(e, out);
  }
  /* Siguiente dato que falta del colegio; con todo completo, los precios. Cuenta una vez por presupuesto. */
  function avanzar(e, out) {
    const falta = preguntas(e.ctx.colegio).orden.find(k => e.ctx[k] === undefined);
    if (falta) return ir(e, out, falta);
    if (!e.ctx.contado) {
      if (intentos(e).length >= LIMITE) return ir(e, out, 'limite');
      e.intentos.push(ahora().getTime());
      e.ctx.contado = true;
      registrar(lead(e, 'datos'));
    }
    ir(e, out, 'lista');
  }
  function agregar(e, out, id, ti, qty) {
    const found = e.ctx.cart.find(it => it.id === id && it.ti === ti);
    if (found) found.qty += qty;
    else e.ctx.cart.push({id, ti, qty});
    ir(e, out, 'agregado', {id, ti, qty});
  }
  function elegirVariante(e, out, id) {
    const p = PRODUCTS[id];
    if (!p) return mostrar(e, out);
    const i = talleIndex(p, e.ctx.talle);
    if (i >= 0) return ir(e, out, 'cantidad', {id, ti: i});
    ir(e, out, 'talleItem', id);
  }

  /* ---------- Texto libre ---------- */
  function buscarColegio(q) {
    const alias = {
      cjh: ['colegio jose hernandez'], ijh: ['instituto jose hernandez'], prof: ['profesorado'], ib: ['instituto ballester'],
      sj: ['san joaquin', 'joaquin'], lm: ['merced'], isa: ['santa ana', 'isa'], rd: ['ruben dario', 'dario'], jn: ['nenelandya'],
      aguer: ['aguer'], jb: ['belen'], el: ['lamarca'], as: ['alfonsina', 'storni']
    };
    const hits = Object.entries(alias).filter(([, al]) => al.some(a => new RegExp('\\b' + a + '\\b').test(q))).map(([id]) => id);
    return hits.length === 1 ? hits[0] : '';
  }
  /* Preguntas sueltas en cualquier momento; devuelve true si las respondió. */
  function textoLibre(e, out, q) {
    if (has(q, 'colegios', 'instituciones', 'trabajan con')) { ir(e, out, 'colegios'); return true; }
    if (has(q, 'horario', 'abren', 'abierto', 'cierran', 'atienden')) { ir(e, out, 'horario'); return true; }
    if (has(q, 'direccion', 'donde', 'ubicacion', 'como llego', 'llegar', 'mapa')) { ir(e, out, 'llegar'); return true; }
    if (has(q, 'promo', 'descuento', 'oferta', 'cuota', 'tarjeta')) { ir(e, out, 'promos'); return true; }
    const colegio = buscarColegio(q);
    if (colegio || has(q, 'presupuesto', 'precio', 'cuanto', 'cuesta', 'valor', 'uniforme')) { presupuesto(e, out, colegio); return true; }
    return false;
  }

  /* ---------- Respuestas a lo que manda la persona ---------- */
  function manejarOpcion(e, out, id) {
    const [tipo, ...resto] = id.split(':');
    const valor = resto.join(':');
    const actual = (e.pila[e.pila.length - 1] || {}).paso;
    switch (tipo) {
      case 'mas': e.pagina = Number(valor) || 0; return mostrar(e, out);
      case 'm': return valor === 'presupuesto' ? presupuesto(e, out) : ir(e, out, valor);
      case 'cv': return ir(e, out, 'colegioElegido', valor);
      case 'p':
        if (valor === 'si') return presupuesto(e, out, (e.pila[e.pila.length - 1] || {}).arg);
        return presupuesto(e, out);
      case 'col': return presupuesto(e, out, valor);
      case 'anio': {
        const q = preguntas(e.ctx.colegio);
        e.ctx.anio = valor;
        if (q.fijo) e.ctx.nivel = q.fijo;
        else if (SALAS.includes(valor)) e.ctx.nivel = 'Jardín';
        else if (!q.niveles) e.ctx.nivel = '';
        return avanzar(e, out);
      }
      case 'niv': e.ctx.nivel = valor; return avanzar(e, out);
      case 'linea': return ir(e, out, 'linea', valor);
      case 'a': return valor === 'armar' ? ir(e, out, 'prendas') : ir(e, out, 'reserva');
      case 'tipo': {
        const opciones = productosDelColegio(e.ctx).filter(p => tipoDe(p) === valor);
        if (opciones.length === 1) return elegirVariante(e, out, opciones[0].id);
        return ir(e, out, 'variante', valor);
      }
      case 'var': return elegirVariante(e, out, valor);
      case 'ti': {
        const [pid, ti] = valor.split(':');
        return ir(e, out, 'cantidad', {id: pid, ti: Number(ti)});
      }
      case 'cant': {
        const arg = (e.pila[e.pila.length - 1] || {}).arg;
        return agregar(e, out, arg.id, arg.ti, Number(valor));
      }
      case 'r':
        if (valor === 'ver') return e.ctx.cart && e.ctx.cart.length ? ir(e, out, 'resumen') : ir(e, out, 'prendas');
        if (valor === 'otra') return ir(e, out, 'prendas', {otra: true});
        return ir(e, out, 'quitar');
      case 'q': e.ctx.cart.splice(Number(valor), 1); return e.ctx.cart.length ? ir(e, out, 'resumen') : ir(e, out, 'prendas');
      case 'rv': return ir(e, out, 'reservaFin', valor);
      case 'nav':
        if (valor === 'menu') return inicio(e, out);
        if (valor === 'volver') return volver(e, out);
        return ir(e, out, 'persona');
      default:
        out.push(texto('No reconocí esa opción.'));
        return actual ? mostrar(e, out) : inicio(e, out);
    }
  }

  function manejarTexto(e, out, original) {
    const q = normal(original);
    const actual = e.pila[e.pila.length - 1] || {paso: 'menu'};
    if (/^(menu|inicio|hola|buenas|buen dia|buenas tardes|buenas noches|empezar)\b/.test(q) && q.length < 25) return inicio(e, out);
    if (/^(volver|atras)\b/.test(q)) return volver(e, out);
    if (has(q, 'persona', 'humano', 'asesor', 'vendedor', 'atencion personalizada')) return ir(e, out, 'persona');

    if (actual.paso === 'nombre' && !textoLibreParece(q)) {
      const nombre = original.replace(/\s+/g, ' ').trim().slice(0, 60);
      if (nombre.length < 2) { out.push(texto('¿Me decís tu nombre?')); return; }
      e.ctx.nombre = nombre.toLowerCase().replace(/(^|\s)\p{L}/gu, c => c.toUpperCase());
      return avanzar(e, out);
    }
    if (actual.paso === 'talle') {
      if (/^no s/.test(q)) { e.ctx.talle = ''; return avanzar(e, out); }
      const pedido = q.replace(/talle/g, '').replace(/\s+/g, '').toUpperCase();
      const tl = tallesDisponibles(e.ctx);
      if (tl.includes(pedido)) { e.ctx.talle = pedido; return avanzar(e, out); }
      if (!textoLibre(e, out, q)) out.push(texto(`No tenemos el talle "${original.trim()}" para este colegio. Los talles son: ${tl.join(', ')}. Escribí uno o *no sé*.`));
      return;
    }
    if (actual.paso === 'cantidad' && /^\d{1,2}$/.test(q) && Number(q) >= 1 && Number(q) <= 50) {
      return agregar(e, out, actual.arg.id, actual.arg.ti, Number(q));
    }
    if (textoLibre(e, out, q)) return;
    out.push(texto('No entendí. Elegí una de las opciones o escribí *menú* para empezar de nuevo.'));
    mostrar(e, out);
  }
  const textoLibreParece = q => q.includes('?') || q.split(' ').length > 4 ||
    has(q, 'horario', 'direccion', 'donde', 'precio', 'cuanto', 'presupuesto', 'promo', 'colegios');

  /* entrada: {tipo: 'texto', texto} | {tipo: 'opcion', id}. Devuelve el estado nuevo y los mensajes a enviar. */
  function procesar(estadoPrevio, entrada, {telefono} = {}) {
    const e = estadoPrevio ? JSON.parse(JSON.stringify(estadoPrevio)) : {pila: [], ctx: {}, intentos: [], pagina: 0};
    e.telefono = telefono;
    const out = [];
    if (!estadoPrevio || !e.pila.length) {
      if (entrada.tipo === 'texto' && textoLibre(e, out, normal(entrada.texto))) return {estado: e, mensajes: out};
      inicio(e, out);
      return {estado: e, mensajes: out};
    }
    if (entrada.tipo === 'opcion') manejarOpcion(e, out, entrada.id);
    else manejarTexto(e, out, entrada.texto || '');
    return {estado: e, mensajes: out};
  }

  return {procesar};
}

module.exports = {crearFlujo};
