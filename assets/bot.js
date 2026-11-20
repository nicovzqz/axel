/* Asistente de respuesta automática de Uniformes M (sigue la guía de Axel, guianico.docx).
   Menú → presupuesto guiado por colegio (nombre, talle, año, nivel) → precios de lista por línea
   (Clásica y Premium) con sus promociones → armado del presupuesto → reserva, PDF y WhatsApp.
   Usa reglas fijas, no IA. Depende de app.js (LISTA, PROMOS, prices, etc.), que se carga antes. */
(() => {
  const INFO = {
    direccion: 'Almirante Brown 3091, Villa Ballester (entre Artigas y Agüer)',
    horarios: 'Lunes a viernes de 9:30 a 13:30 y de 15:30 a 19:30. Sábados de 10 a 14.',
    mapa: 'https://maps.app.goo.gl/UkL2oTv5u8oP5boS9'
  };
  /* "Seguinos en nuestro canal": por ahora Instagram. Cambiar por el link del canal de WhatsApp. */
  const CANAL = {nombre: 'Instagram', url: 'https://www.instagram.com/uniformescolegialesm/'};
  /* Límite de presupuestos: desde el 5º, atención personalizada. Se reinicia a las 72 horas. */
  const LIMITE = 4;
  const VENTANA_MS = 72 * 60 * 60 * 1000;
  const INTENTOS_KEY = 'um-bot-intentos';

  /* Qué pregunta cada colegio y en qué orden (guía de Axel).
     niveles: opciones de "Nivel"; fijo: nivel que se asume sin preguntar. */
  const COLEGIO_PREGUNTAS = {
    rd: {orden: ['nombre', 'talle', 'anio', 'nivel'], niveles: ['Primaria', 'Secundaria']},
    jn: {orden: ['nombre', 'anio', 'talle'], fijo: 'Jardín'},
    jb: {orden: ['nombre', 'anio', 'talle'], fijo: 'Jardín'},
    ijh: {orden: ['nombre', 'talle', 'anio']},
    aguer: {orden: ['nombre', 'talle', 'anio']},
    prof: {orden: ['nombre', 'talle', 'anio'], fijo: 'Profesorado'}
  };
  const PREGUNTAS_COMUNES = {orden: ['nombre', 'talle', 'anio', 'nivel'], niveles: ['Jardín', 'Primaria', 'Secundaria']};
  /* El teléfono se pide siempre, justo después del nombre. */
  function preguntas(id) {
    const q = COLEGIO_PREGUNTAS[id] || PREGUNTAS_COMUNES;
    return {...q, orden: q.orden.flatMap(k => k === 'nombre' ? ['nombre', 'telefono'] : [k])};
  }
  const SALAS = ['Sala de 3', 'Sala de 4', 'Sala de 5'];
  const GRADOS = ['1º', '2º', '3º', '4º', '5º', '6º'];

  const ORDEN_LETRAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'];
  const ALIAS = {
    cjh: ['colegio jose hernandez', 'col jh', 'cjh'], ijh: ['instituto jose hernandez', 'ijh'],
    prof: ['profesorado'], ib: ['instituto ballester'], sj: ['san joaquin', 'joaquin'], lm: ['merced'],
    isa: ['santa ana', 'isa'], rd: ['ruben dario', 'dario'], jn: ['nenelandya'],
    aguer: ['fernando aguer', 'colegio aguer', 'aguer'], jb: ['belen'], el: ['lamarca'], as: ['alfonsina', 'storni']
  };

  let open = false;
  let started = false;
  let ctx = {};          // colegio, nombre, talle, anio, nivel, cart
  let history = [];      // pasos visitados, para "Volver"
  let expect = null;     // 'nombre' cuando se espera texto

  /* ---------- Interfaz ---------- */
  const root = document.createElement('div');
  root.className = 'bot';
  const ICON = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z"/></svg>'
  };
  /* Pasos que forman parte de "precios y armado" para la barra de progreso. */
  const SUBPASO = {linea: 'lista', prendas: 'lista', variante: 'lista', talleItem: 'lista', cantidad: 'lista', agregado: 'lista'};
  root.innerHTML = `
    <button class="bot-fab" type="button" aria-expanded="false" aria-controls="bot-panel">
      ${ICON.chat}<span>Pedí tu presupuesto</span>
    </button>
    <section class="bot-panel" id="bot-panel" role="dialog" aria-label="Chat de Uniformes M" hidden>
      <header class="bot-head">
        <button type="button" class="bot-icon" data-nav="back" aria-label="Volver" title="Volver">${ICON.back}</button>
        <div class="bot-id">
          <span class="bot-avatar" aria-hidden="true">M</span>
          <div><strong>Uniformes M</strong><small><i aria-hidden="true"></i>Responde al instante</small></div>
        </div>
        <button type="button" class="bot-icon" data-nav="home" aria-label="Volver al inicio" title="Inicio">${ICON.home}</button>
        <button type="button" class="bot-icon bot-close" aria-label="Cerrar chat" title="Cerrar">${ICON.close}</button>
      </header>
      <div class="bot-progress" hidden><span></span><small></small></div>
      <div class="bot-log" role="log" aria-live="polite"></div>
      <div class="bot-chips"></div>
      <div class="bot-foot">
        <button type="button" class="bot-human" data-nav="human">${ICON.wa}Atención personalizada</button>
        <form class="bot-form">
          <input type="text" maxlength="60" placeholder="Escribí tu consulta…" aria-label="Tu mensaje" autocomplete="off">
          <button type="submit" aria-label="Enviar">${ICON.send}</button>
        </form>
      </div>
    </section>`;
  document.body.append(root);
  const fab = root.querySelector('.bot-fab');
  const panel = root.querySelector('.bot-panel');
  const log = root.querySelector('.bot-log');
  const chipsBox = root.querySelector('.bot-chips');
  const input = root.querySelector('input');
  const backBtn = root.querySelector('[data-nav="back"]');
  const progress = root.querySelector('.bot-progress');

  /* En escritorio el chat se acomoda debajo del menú y desde donde empieza la ilustración del buzo. */
  function ubicarPanel() {
    const header = document.querySelector('header');
    const arte = document.querySelector('.hero-art');
    const top = header ? Math.round(header.getBoundingClientRect().bottom) : 87;
    const izquierda = arte ? Math.round(arte.getBoundingClientRect().left) - 60 : innerWidth * 0.48;
    root.style.setProperty('--bot-top', Math.max(0, top) + 'px');
    root.style.setProperty('--bot-left', Math.max(0, Math.min(izquierda, innerWidth - 440)) + 'px');
  }
  addEventListener('resize', () => { if (open) ubicarPanel(); });

  function toggle(force) {
    open = force ?? !open;
    if (open) { ubicarPanel(); despertarAPI(); }
    panel.hidden = !open;
    fab.setAttribute('aria-expanded', String(open));
    root.classList.toggle('is-open', open);
    /* En el teléfono el chat ocupa la pantalla: la página de atrás no scrollea. */
    document.documentElement.classList.toggle('bot-lock', open);
    if (open && !started) { started = true; home(); }
    if (open) setTimeout(() => input.focus(), 50);
  }
  fab.onclick = () => toggle();
  root.querySelector('.bot-close').onclick = () => { toggle(false); fab.focus(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) { toggle(false); fab.focus(); } });

  function add(cls, html) {
    const el = document.createElement('div');
    el.className = 'bot-msg ' + cls;
    el.innerHTML = html;
    log.append(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }
  /* chips: lista de [texto, acción]. */
  let chipActions = [];
  function say(html, chips = [], mode) {
    const typing = add('from-bot typing', '<span></span><span></span><span></span>');
    setChips([]);
    setTimeout(() => {
      typing.classList.remove('typing');
      typing.innerHTML = html;
      typing.classList.toggle('wide', /bot-table/.test(html));
      setChips(chips, mode);
      /* Una respuesta larga (el presupuesto) se muestra desde arriba, no desde el final. */
      log.scrollTop = typing.offsetHeight > log.clientHeight - 40 ? typing.offsetTop - 16 : log.scrollHeight;
    }, 420);
  }
  /* Opciones largas (colegios) van en lista; muchas cortas (talles) en grilla.
     "offer" es la oferta de prendas: botones grandes y destacados. */
  const PRINCIPAL = ['Ver mi presupuesto', 'Armar mi presupuesto', 'Necesito presupuesto'];
  function setChips(list, mode) {
    chipActions = list;
    chipsBox.innerHTML = list.map(([label], i) =>
      `<button type="button" data-i="${i}"${PRINCIPAL.includes(label) ? ' class="primary"' : ''}>${esc(label)}</button>`).join('');
    const largas = list.length > 4 && list.some(([label]) => label.length > 24);
    chipsBox.className = 'bot-chips ' + (mode || (largas ? 'list' : list.length > 8 ? 'grid' : ''));
  }
  chipsBox.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const [label, action] = chipActions[+b.dataset.i];
    add('from-user', esc(label));
    action();
  });
  const NAV_LABEL = {back: 'Volver', home: 'Inicio', human: 'Atención personalizada'};
  panel.addEventListener('click', e => {
    const b = e.target.closest('[data-nav]');
    if (!b || b.disabled) return;
    add('from-user', esc(NAV_LABEL[b.dataset.nav]));
    ({back, home, human: () => go('persona')})[b.dataset.nav]();
  });
  root.querySelector('.bot-form').addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    add('from-user', esc(text));
    /* Si en vez del nombre escribe una pregunta, se responde la pregunta. */
    if (expect === 'nombre' && !esPregunta(text)) return setNombre(text);
    if (expect === 'telefono' && /\d/.test(text)) return setTelefono(text);
    freeText(text);
  });

  /* ---------- Navegación entre pasos ---------- */
  function go(step, arg) {
    history.push({step, arg});
    run(step, arg);
  }
  function run(step, arg) {
    expect = null;
    input.placeholder = 'Escribí tu consulta…';
    input.inputMode = 'text';
    STEPS[step](arg);
    backBtn.disabled = history.length < 2;
    actualizarProgreso();
  }
  /* "Paso X de N": colegio, las preguntas de ese colegio y los precios. */
  function actualizarProgreso() {
    const actual = (history[history.length - 1] || {}).step;
    const pasos = ['colegio', ...preguntas(ctx.colegio).orden, 'lista'];
    const i = pasos.indexOf(SUBPASO[actual] || actual);
    progress.hidden = i < 0;
    if (i >= 0) {
      progress.querySelector('span').style.setProperty('--p', `${(i + 1) / pasos.length * 100}%`);
      progress.querySelector('small').textContent = `Paso ${i + 1} de ${pasos.length}`;
    }
  }
  function back() {
    history.pop();
    const prev = history[history.length - 1];
    if (prev) run(prev.step, prev.arg);
    else home();
  }
  function home() {
    history = [];
    ctx = {};
    go('menu');
  }
  /* Pasos automáticos: reemplazan al actual para que "Volver" no rebote. */
  function replace(step, arg) {
    history[history.length - 1] = {step, arg};
    run(step, arg);
  }
  /* Siguiente dato que falta del colegio; con todo completo, los precios.
     El presupuesto cuenta una vez, al llegar a los precios. */
  function avanzar() {
    const falta = preguntas(ctx.colegio).orden.find(k => ctx[k] === undefined);
    if (falta) return go(falta);
    if (!ctx.contado) {
      if (intentos().length >= LIMITE) return go('limite');
      sumarIntento();
      ctx.contado = true;
      registrar('datos');
    }
    go('lista');
  }

  /* ---------- Base de datos de clientes (API en server/, PostgreSQL en Docker) ----------
     En local usa http://localhost:3000. Para el sitio publicado, definir window.UM_API_URL
     con la dirección HTTPS donde quede la API. Sin API, el chat funciona igual. */
  const API_URL = (window.UM_API_URL || (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:3000' : '')).replace(/\/$/, '');
  function registrar(etapa, extra = {}) {
    if (!API_URL || !ctx.telefono || !ctx.sesion) return;
    const datos = {
      sesion: ctx.sesion, etapa, nombre: ctx.nombre, telefono: ctx.telefono,
      colegio: ctx.colegio ? SCHOOLS[ctx.colegio] : null, nivel: ctx.nivel || null, anio: ctx.anio || null,
      talle: ctx.talle === undefined ? null : ctx.talle || 'No sabe', origen: location.hostname, ...extra
    };
    fetch(API_URL + '/api/leads', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(datos), keepalive: true
    }).catch(() => { /* sin conexión con la API: el chat sigue */ });
  }
  function datosPresupuesto() {
    const t = cartTotals();
    return {
      presupuesto: ctx.cart.map(it => {
        const p = PRODUCTS[it.id];
        return {prenda: p.nombre, linea: lineaDe(p) || null, talle: p.talles[it.ti].t, cantidad: it.qty, precio_lista: p.talles[it.ti].p};
      }),
      total_lista: t.lista, total_efectivo: t.efectivo, total_3_pagos: t.tresPagos,
      total_6_pagos: Math.round(t.lista * (100 - SEIS_PAGOS.descuento) / 100)
    };
  }
  log.addEventListener('click', e => {
    if (e.target.closest('.bot-wa a')) registrar('whatsapp', {abrio_whatsapp: true, ...(ctx.cart && ctx.cart.length ? datosPresupuesto() : {})});
  });
  /* En el plan gratuito de Render la API se duerme: se la despierta apenas se abre el chat,
     así ya está lista cuando la persona deja su teléfono. */
  let despierta = false;
  function despertarAPI() {
    if (despierta || !API_URL) return;
    despierta = true;
    fetch(API_URL + '/api/salud').catch(() => { despierta = false; });
  }

  /* ---------- WhatsApp: siempre la salida principal ---------- */
  function waMessage(extra) {
    const partes = [];
    partes.push(ctx.nombre ? `Hola, soy ${ctx.nombre}.` : 'Hola.');
    if (ctx.colegio) {
      const nivel = [ctx.nivel, ctx.anio].filter(Boolean).join(' ');
      partes.push(`Consulto por uniformes de ${SCHOOLS[ctx.colegio]}${nivel ? ', ' + nivel : ''}${ctx.talle ? ', talle ' + ctx.talle : ''}.`);
    }
    if (extra) partes.push(extra);
    return partes.join(' ');
  }
  /* Un solo botón principal; el segundo número queda como alternativa discreta. */
  function waButtons(extra, label = 'Seguir por WhatsApp') {
    const text = encodeURIComponent(waMessage(extra));
    return `<div class="bot-wa">
      <a class="bot-wa-main" href="https://wa.me/${WHATSAPP[0]}?text=${text}" target="_blank" rel="noopener">${ICON.wa}${esc(label)}</a>
      <a class="bot-wa-alt" href="https://wa.me/${WHATSAPP[1]}?text=${text}" target="_blank" rel="noopener">u otro número: 11 2347-7515</a>
    </div>`;
  }

  /* ---------- Límite de presupuestos (en este navegador) ---------- */
  function intentos() {
    try {
      const now = Date.now();
      return JSON.parse(localStorage.getItem(INTENTOS_KEY) || '[]').filter(t => now - t < VENTANA_MS);
    } catch (e) { return []; }
  }
  function sumarIntento() {
    try { localStorage.setItem(INTENTOS_KEY, JSON.stringify([...intentos(), Date.now()])); } catch (e) { /* sin almacenamiento */ }
  }

  /* ---------- Datos ---------- */
  /* Talles: "12/XS" se muestra como 12; "1/XL", "2/XXL"... por la letra (talles de adulto). */
  function tallekey(label) {
    const [num, letras] = label.toUpperCase().split('/').map(s => s.trim());
    return letras && /^\d$/.test(num) ? letras : num;
  }
  /* Prendas del colegio y nivel elegidos (sin nivel elegido todavía: todas las del colegio). */
  function productosDelColegio() {
    return LISTA.productos.filter(p => p.colegios.includes(ctx.colegio) &&
      (!ctx.nivel || !p.niveles || !p.niveles.length || p.niveles.includes(ctx.nivel)));
  }
  function prendasDelPedido() {
    return productosDelColegio().filter(p => p.categoria !== 'Accesorios');
  }
  const tipoDe = p => p.categoria === 'Accesorios' ? 'Accesorios' : p.nombre.split(' ')[0];
  function talleIndex(p, talle = ctx.talle) {
    if (p.talles.length === 1) return 0;
    return talle ? p.talles.findIndex(t => tallekey(t.t) === talle) : -1;
  }
  function precioEnTalle(p) {
    if (!ctx.talle) return Math.min(...p.talles.map(t => t.p));
    const i = talleIndex(p);
    return i >= 0 ? p.talles[i].p : null;
  }
  /* Premium y Clásica: prendas de gimnasia, remeras y chombas. Las demás no tienen línea. */
  const lineaDe = p => p.linea === 'Clásica' ? 'Clásica' : p.linea === 'Premium' && p.promo !== 'C' ? 'Premium' : '';
  const talleTxt = t => t === 'Único' ? 'talle único' : 'talle ' + t;
  function cartTotals() {
    return totals(ctx.cart.map(({id, ti, qty}) => ({id, ti, qty})));
  }
  function talles() {
    const set = new Set(prendasDelPedido().flatMap(p => p.talles.map(t => tallekey(t.t))));
    const nums = [...set].filter(t => /^\d+$/.test(t)).sort((a, b) => a - b);
    const letras = [...set].filter(t => !/^\d+$/.test(t) && t !== 'ÚNICO').sort((a, b) => ORDEN_LETRAS.indexOf(a) - ORDEN_LETRAS.indexOf(b));
    return [...nums, ...letras];
  }
  const precioMin = arr => `${arr.length > 1 || !ctx.talle ? '<small>desde</small> ' : ''}${pesos(Math.min(...arr))}`;
  /* Tabla rápida: una fila por tipo de prenda con el menor precio de cada línea. */
  function resumen() {
    const tipos = new Map();
    prendasDelPedido().forEach(p => {
      const precio = precioEnTalle(p);
      if (precio == null) return;
      const tipo = p.nombre.split(' ')[0];
      const t = tipos.get(tipo) || {Premium: [], Clásica: [], '': []};
      t[lineaDe(p)].push(precio);
      tipos.set(tipo, t);
    });
    const cell = arr => arr.length ? `<td>${precioMin(arr)}</td>` : '<td class="none">—</td>';
    return [...tipos].map(([tipo, t]) => {
      const celdas = t.Premium.length || t['Clásica'].length ? cell(t.Premium) + cell(t['Clásica']) : `<td colspan="2">${precioMin(t[''])}</td>`;
      return `<tr><th scope="row">${esc(tipo)}</th>${celdas}</tr>`;
    });
  }
  /* Prendas de una línea, agrupadas por tipo, con el precio en cada forma de pago. */
  function tablaLinea(linea) {
    const tipos = new Map();
    prendasDelPedido().filter(p => lineaDe(p) === linea).forEach(p => {
      const precio = precioEnTalle(p);
      if (precio == null) return;
      const tipo = p.nombre.split(' ')[0];
      const actual = tipos.get(tipo);
      if (!actual || precio < actual.lista) tipos.set(tipo, {...prices(precio, p.promo), n: (actual ? actual.n : 0) + 1});
      else actual.n++;
    });
    const desde = n => n > 1 || !ctx.talle ? '<small>desde</small> ' : '';
    return [...tipos].map(([tipo, r]) => `<tr><th scope="row">${esc(tipo)}</th><td>${desde(r.n)}${pesos(r.lista)}</td><td>${pesos(r.efectivo)}</td><td>${pesos(r.tresPagos)}</td></tr>`);
  }
  /* Condiciones de cada promo que aplica a la línea (Premium tiene dos grupos de promo). */
  function promosDeLinea(linea) {
    const grupos = [...new Set(prendasDelPedido().filter(p => lineaDe(p) === linea).map(p => p.promo))];
    return grupos.map(g => {
      const p = activePromo(g);
      const d = discounts(g);
      const nombre = p ? p.nombre : linea === 'Clásica' ? 'Línea Clásica' : 'Línea Premium';
      return `<li><b>${esc(nombre)}</b>${p ? ` <small>(hasta el ${shortDate(p.vence)})</small>` : ''}<br>
        Efectivo o transferencia: <b>${d.efectivo ? d.efectivo + '% off' : 'precio de lista'}</b> ·
        3 pagos: <b>${d.tresPagos ? d.tresPagos + '% off' : 'precio de lista'}</b> ·
        6 pagos: <b>${SEIS_PAGOS.descuento ? SEIS_PAGOS.descuento + '% off' : 'precio de lista'}</b></li>`;
    }).join('');
  }

  /* ---------- Pasos ---------- */
  const STEPS = {
    menu() {
      say('¡Hola! Soy el asistente automático de Uniformes M. Te ayudo con precios, talles, promociones, horarios y cómo llegar. ¿Qué necesitás?', [
        ['Necesito presupuesto', () => go('presupuesto')],
        ['Con qué colegios trabajamos', () => go('colegios')],
        ['Horario', () => go('horario')],
        ['Cómo llegar', () => go('llegar')],
        ['Promociones', () => go('promos')],
        ['Seguinos en nuestro canal para promociones exclusivas', () => go('canal')]
      ]);
    },
    colegios() {
      say('Trabajamos con estas instituciones. Tocá la tuya:', SCHOOL_ORDER.map(id => [SCHOOLS[id], () => go('colegioElegido', id)]));
    },
    colegioElegido(id) {
      say(`Hacemos los uniformes de <b>${esc(SCHOOLS[id])}</b>. ¿Necesitás presupuesto?`, [
        ['Necesito presupuesto', () => go('presupuesto', {colegio: id})]
      ]);
    },
    /* Solo decide a dónde ir: se reemplaza a sí mismo para que "Volver" no rebote acá. */
    presupuesto(arg = {}) {
      ctx = nuevoPedido(arg.colegio);
      if (intentos().length >= LIMITE) return replace('limite');
      if (!ctx.colegio) return replace('colegio');
      history.pop();
      avanzar();
    },
    colegio() {
      say('¿De qué colegio?', SCHOOL_ORDER.map(id => [SCHOOLS[id], () => {
        ctx = nuevoPedido(id);
        avanzar();
      }]));
    },
    nombre() {
      expect = 'nombre';
      input.placeholder = 'Tu nombre';
      say('Contame, ¿cuál es tu nombre?');
      setTimeout(() => input.focus(), 450);
    },
    telefono() {
      expect = 'telefono';
      input.placeholder = 'Ej.: 11 2345-6789';
      input.inputMode = 'tel';
      say(`Gracias, ${esc(ctx.nombre.split(' ')[0])}. ¿Cuál es tu número de teléfono?<br><small>Lo usamos solo para contactarte por tu presupuesto.</small>`);
      setTimeout(() => input.focus(), 450);
    },
    talle() {
      say('¿Qué talle usa?', [...talles().map(t => [t, () => { ctx.talle = t; avanzar(); }]), ['No sé el talle', () => { ctx.talle = ''; avanzar(); }]]);
    },
    anio() {
      const q = preguntas(ctx.colegio);
      const opciones = q.fijo === 'Jardín' ? SALAS : q.fijo === 'Profesorado' ? GRADOS.slice(0, 4)
        : (q.niveles || []).includes('Jardín') ? [...SALAS, ...GRADOS] : GRADOS;
      say(q.fijo === 'Jardín' ? '¿Qué sala?' : '¿Qué año de curso?', opciones.map(a => [a, () => {
        ctx.anio = a;
        /* Una sala ya dice el nivel; si el colegio tiene nivel fijo, también. */
        if (q.fijo) ctx.nivel = q.fijo;
        else if (SALAS.includes(a)) ctx.nivel = 'Jardín';
        avanzar();
      }]));
    },
    nivel() {
      const q = preguntas(ctx.colegio);
      if (q.fijo || !q.niveles) { ctx.nivel = q.fijo || ''; history.pop(); return avanzar(); }
      const niveles = SALAS.includes(ctx.anio) ? ['Jardín'] : q.niveles.filter(n => n !== 'Jardín');
      if (niveles.length === 1) { ctx.nivel = niveles[0]; history.pop(); return avanzar(); }
      say('¿Qué nivel?', niveles.map(n => [n, () => { ctx.nivel = n; avanzar(); }]));
    },

    /* ----- Presupuesto en precio de lista ----- */
    lista() {
      const lineas = resumen();
      const quien = (ctx.nombre || '').split(' ')[0];
      const titulo = [SCHOOLS[ctx.colegio], [ctx.nivel, ctx.anio].filter(Boolean).join(' '), ctx.talle ? 'talle ' + ctx.talle : 'todos los talles'].join(' · ');
      const tabla = lineas.length
        ? `<table class="bot-table"><thead><tr><th></th><th scope="col">Premium</th><th scope="col">Clásica</th></tr></thead><tbody>${lineas.join('')}</tbody></table>`
        : '<small>No tenemos ese talle cargado; igual podés armar el presupuesto y te mostramos los talles de cada prenda.</small>';
      const hay = l => prendasDelPedido().some(p => lineaDe(p) === l);
      say(`<div class="bot-card"><strong>${esc(quien)}, tu presupuesto en precio de lista</strong><small>${esc(titulo)}</small>${tabla}
        <small>Mirá cada línea con sus promociones o armá tu presupuesto prenda por prenda.</small></div>
        <div class="bot-cta"><span>Tu presupuesto en 1 minuto</span><strong>Armemos tu presupuesto</strong>
        <small>Elegí las prendas y te sumo todo con la promoción aplicada.</small></div>`, [
        ['Armar mi presupuesto', () => go('prendas')],
        ...(hay('Clásica') ? [['Línea Clásica', () => go('linea', 'Clásica')]] : []),
        ...(hay('Premium') ? [['Línea Premium', () => go('linea', 'Premium')]] : []),
        ['Reserva', () => go('reserva')],
        ['Quiero otro presupuesto', otroPresupuesto]
      ]);
    },
    linea(linea) {
      const filas = tablaLinea(linea);
      const otra = linea === 'Premium' ? 'Clásica' : 'Premium';
      say(`<div class="bot-card"><strong>Línea ${linea}</strong><small>${esc(SCHOOLS[ctx.colegio])}${ctx.talle ? ' · talle ' + esc(ctx.talle) : ''}</small>
        <table class="bot-table por-linea"><thead><tr><th></th><th scope="col">Lista</th><th scope="col">Efectivo</th><th scope="col">3 pagos</th></tr></thead>
        <tbody>${filas.join('')}</tbody></table>
        <ul class="bot-promos">${promosDeLinea(linea)}</ul>
        <small>Efectivo incluye transferencia. Con otros medios de pago, precio de lista.</small></div>`, [
        ['Armar mi presupuesto', () => go('prendas')],
        ...(prendasDelPedido().some(p => lineaDe(p) === otra) ? [[`Ver línea ${otra}`, () => go('linea', otra)]] : []),
        ['Reserva', () => go('reserva')],
        ['Quiero otro presupuesto', otroPresupuesto]
      ]);
    },

    /* ----- Armado del presupuesto, como en el mostrador ----- */
    prendas(arg = {}) {
      const tipos = [...new Set(productosDelColegio().map(tipoDe))];
      const chips = tipos.map(t => [t, () => go('variante', t)]);
      /* Con prendas ya cargadas, "Ver mi presupuesto" va primero para que siempre se vea. */
      if (ctx.cart.length) chips.unshift(['Ver mi presupuesto', () => go('resumen')]);
      const titulo = arg.otra ? '¿Qué otra prenda sumamos?' : '¿Qué prendas necesitás?';
      say(`<div class="bot-cta small"><strong>${titulo}</strong><small>Elegila abajo.</small></div>`, chips, 'offer');
    },
    variante(tipo) {
      const opciones = productosDelColegio().filter(p => tipoDe(p) === tipo);
      if (opciones.length === 1) return replace('talleItem', opciones[0].id);
      say(`¿Qué ${tipo === 'Accesorios' ? 'accesorio' : esc(tipo.toLowerCase())}?`, opciones.map(p => {
        const precio = precioEnTalle(p);
        const linea = lineaDe(p);
        return [`${linea ? linea + ' · ' : ''}${p.nombre}${precio != null && ctx.talle ? ' · ' + pesos(precio) : ''}`, () => go('talleItem', p.id)];
      }));
    },
    /* Si la prenda no tiene el talle elegido (o no se eligió), se pregunta para esa prenda. */
    talleItem(id) {
      const p = PRODUCTS[id];
      const i = talleIndex(p);
      if (i >= 0) return replace('cantidad', {id, ti: i});
      say(ctx.talle ? `Esa prenda no viene en talle ${esc(ctx.talle)}. ¿Qué talle querés?` : '¿En qué talle?',
        p.talles.map((t, ti) => [`${t.t} · ${pesos(t.p)}`, () => go('cantidad', {id, ti})]));
    },
    cantidad({id, ti}) {
      const p = PRODUCTS[id];
      const t = p.talles[ti];
      say(`${esc(p.nombre)}, ${esc(talleTxt(t.t))}: <b>${pesos(t.p)}</b> de lista. ¿Cuántas?`,
        [1, 2, 3, 4, 5].map(n => [String(n), () => agregar(id, ti, n)]));
    },
    agregado({id, ti, qty}) {
      const p = PRODUCTS[id];
      const n = ctx.cart.reduce((a, it) => a + it.qty, 0);
      say(`Listo, agregué <b>${qty} × ${esc(p.nombre)}</b> (${esc(talleTxt(p.talles[ti].t))}). Llevás ${n} ${n === 1 ? 'prenda' : 'prendas'}.`, [
        ['Ver mi presupuesto', () => go('resumen')],
        ['Agregar otra prenda', () => go('prendas', {otra: true})]
      ]);
    },
    resumen() {
      if (!ctx.cart.length) return replace('prendas');
      registrar('presupuesto', datosPresupuesto());
      const t = cartTotals();
      const seis = Math.round(t.lista * (100 - SEIS_PAGOS.descuento) / 100);
      const filas = ctx.cart.map(it => {
        const p = PRODUCTS[it.id];
        const tl = p.talles[it.ti];
        const linea = lineaDe(p);
        return `<tr><th scope="row">${it.qty} × ${esc(p.nombre)}<small>${esc(talleTxt(tl.t))}${linea ? ' · ' + linea : ''}</small></th><td>${pesos(tl.p * it.qty)}</td></tr>`;
      }).join('');
      const vence = ctx.cart.map(it => activePromo(PRODUCTS[it.id].promo)).filter(Boolean).map(p => p.vence).sort().map(shortDate);
      say(`<div class="bot-card"><strong>Tu presupuesto</strong><small>${esc(SCHOOLS[ctx.colegio])}${ctx.nivel ? ' · ' + esc([ctx.nivel, ctx.anio].filter(Boolean).join(' ')) : ''}</small>
        <table class="bot-table ticket"><tbody>${filas}</tbody><tfoot>
          <tr><th scope="row">Precio de lista</th><td>${pesos(t.lista)}</td></tr>
          <tr class="total"><th scope="row">Efectivo o transferencia${t.lista > t.efectivo ? `<small>Ahorrás ${pesos(t.lista - t.efectivo)}</small>` : ''}</th><td>${pesos(t.efectivo)}</td></tr>
          <tr><th scope="row">En 3 pagos<small>3 pagos de ${pesos(t.tresPagos / 3)}</small></th><td>${pesos(t.tresPagos)}</td></tr>
          <tr><th scope="row">En 6 pagos<small>6 pagos de ${pesos(seis / 6)}</small></th><td>${pesos(seis)}</td></tr>
        </tfoot></table>
        <small>${vence.length ? `Promoción válida hasta el ${vence[0]}. ` : ''}Confirmamos stock al reservar.</small></div>` +
        waButtons(detalleParaWhatsApp(t), 'Enviar presupuesto por WhatsApp'), [
        ['Reserva', () => go('reserva')],
        ['Descargar presupuesto en PDF', descargarPDF],
        ['Agregar otra prenda', () => go('prendas', {otra: true})],
        ['Quitar una prenda', () => go('quitar')],
        ['Quiero otro presupuesto', otroPresupuesto]
      ]);
    },
    quitar() {
      say('¿Cuál quitamos?', ctx.cart.map((it, i) => {
        const p = PRODUCTS[it.id];
        return [`${it.qty} × ${p.nombre} (${talleTxt(p.talles[it.ti].t)})`, () => { ctx.cart.splice(i, 1); go('resumen'); }];
      }));
    },

    /* ----- Reserva ----- */
    reserva() {
      say('¿Cómo preferís recibirlo?', [
        ['Reservo y retiro en el local', () => go('reservaFin', 'retiro')],
        ['Reservo y me lo mandan (solo efectivo o transferencia)', () => go('reservaFin', 'envio')]
      ]);
    },
    reservaFin(modo) {
      const detalle = ctx.cart && ctx.cart.length ? ' ' + detalleParaWhatsApp(cartTotals()) : '';
      registrar('reserva', {reserva: modo === 'retiro' ? 'Retira en el local' : 'Envío (efectivo o transferencia)',
        ...(ctx.cart && ctx.cart.length ? datosPresupuesto() : {})});
      const texto = modo === 'retiro'
        ? `<div class="bot-card"><strong>Reservá y retirá</strong><small>Te esperamos en ${INFO.direccion}. ${INFO.horarios}</small></div>`
        : '<div class="bot-card"><strong>Reservá y te lo mandamos</strong><small>Con envío, el pago es solo en efectivo o por transferencia. Coordinamos el envío por WhatsApp.</small></div>';
      const pedido = modo === 'retiro' ? 'Quiero reservar y retirar en el local.' : 'Quiero reservar y que me lo envíen (pago en efectivo o transferencia).';
      say(texto + waButtons(pedido + detalle, 'Reservar por WhatsApp'), [
        ['Horario', () => go('horario')],
        ['Cómo llegar', () => go('llegar')]
      ]);
    },

    /* ----- Información ----- */
    horario() {
      say(`<div class="bot-card"><strong>Horario</strong><small>${INFO.horarios}</small></div>`, [['Cómo llegar', () => go('llegar')]]);
    },
    llegar() {
      say(`<div class="bot-card"><strong>Cómo llegar</strong><small>${INFO.direccion}</small><a href="${INFO.mapa}" target="_blank" rel="noopener">Ver en Google Maps ↗</a></div>`, [['Horario', () => go('horario')]]);
    },
    promos() {
      const live = PROMO_ORDER.filter(g => activePromo(g)).map(g => PROMOS[g]);
      const promoTxt = live.length
        ? '<div class="bot-card"><strong>Promociones vigentes</strong><table class="bot-table promo"><thead><tr><th></th><th scope="col">Efectivo</th><th scope="col">3 pagos</th></tr></thead><tbody>' +
          live.map(p => `<tr><th scope="row">${esc(p.nombre)}<small>Hasta el ${shortDate(p.vence)}</small></th><td>${p.efectivo}%</td><td${p.tresPagos ? '' : ' class="none"'}>${p.tresPagos ? p.tresPagos + '%' : '—'}</td></tr>`).join('') +
          '</tbody></table><small>Efectivo incluye transferencia.</small></div>'
        : `<div class="bot-card"><strong>Descuento por pago</strong><small>${SIN_PROMO.efectivo}% off pagando en efectivo o transferencia.</small></div>`;
      say(promoTxt, [['Necesito presupuesto', () => go('presupuesto')]]);
    },
    canal() {
      say(`<div class="bot-card"><strong>Promociones exclusivas</strong><small>Seguinos en ${CANAL.nombre} y enterate antes que nadie.</small><a href="${CANAL.url}" target="_blank" rel="noopener">Ir a ${CANAL.nombre} ↗</a></div>`, []);
    },
    persona() {
      say('Te atiende una persona del local.' + waButtons('Quiero atención personalizada.', 'Escribir por WhatsApp'), []);
    },
    limite() {
      say('Ya armaste 4 presupuestos. Para seguir, te ayudamos a elegir en persona.' +
        waButtons('Necesito ayuda para elegir las prendas.', 'Seguir por WhatsApp'), []);
    },
    respuesta(html) {
      say(html, [['Necesito presupuesto', () => go('presupuesto')]]);
    }
  };

  /* "Quiero otro presupuesto": vuelve a elegir colegio (se mantiene el nombre). */
  function otroPresupuesto() {
    go('presupuesto');
  }
  function agregar(id, ti, qty) {
    const found = ctx.cart.find(it => it.id === id && it.ti === ti);
    if (found) found.qty += qty;
    else ctx.cart.push({id, ti, qty});
    go('agregado', {id, ti, qty});
  }
  function detalleParaWhatsApp(t) {
    const lineas = ctx.cart.map(it => {
      const p = PRODUCTS[it.id];
      return `- ${it.qty} x ${p.nombre}, ${talleTxt(p.talles[it.ti].t)}`;
    }).join('\n');
    return `Mi presupuesto:\n${lineas}\nEfectivo o transferencia: ${pesos(t.efectivo)}. En 3 pagos: ${pesos(t.tresPagos)}.`;
  }
  /* Reutiliza el PDF tipo factura de pdf.js con los datos del chat. */
  async function descargarPDF() {
    state.school = ctx.colegio;
    state.items = ctx.cart.map(({id, ti, qty}) => ({id, ti, qty}));
    state.nombre = ctx.nombre;
    state.detalle = [ctx.nivel, ctx.anio].filter(Boolean).join(' ');
    try {
      const {doc, filename} = await buildBudgetPDF();
      doc.save(filename);
      registrar('pdf', {descargo_pdf: true, ...datosPresupuesto()});
      say('Listo, se descargó tu presupuesto en PDF. ¿Lo reservamos?', [
        ['Reserva', () => go('reserva')],
        ['Ver mi presupuesto', () => go('resumen')]
      ]);
    } catch (e) {
      say('No pudimos generar el PDF. Revisá tu conexión, o te lo mandamos por WhatsApp.' + waButtons(detalleParaWhatsApp(cartTotals())), [
        ['Ver mi presupuesto', () => go('resumen')]
      ]);
    }
  }
  /* Cada presupuesto es un pedido nuevo; nombre y teléfono se conservan. */
  function nuevoPedido(colegio) {
    return {nombre: ctx.nombre, telefono: ctx.telefono, colegio, cart: [], sesion: nuevaSesion()};
  }
  function nuevaSesion() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16));
  }
  /* Teléfono argentino: de 8 a 13 dígitos (con o sin 54, 9 y código de área). */
  function setTelefono(text) {
    const digitos = text.replace(/\D/g, '');
    if (digitos.length < 8 || digitos.length > 13) {
      say('Ese número no parece completo. Escribilo con código de área, por ejemplo 11 2345-6789.');
      setTimeout(() => { expect = 'telefono'; }, 0);
      return;
    }
    ctx.telefono = digitos;
    input.inputMode = 'text';
    registrar('contacto');
    avanzar();
  }
  function setNombre(text) {
    if (text.length < 2) { say('¿Me decís tu nombre?'); setTimeout(() => { expect = 'nombre'; }, 0); return; }
    /* "juan pérez" → "Juan Pérez" */
    ctx.nombre = text.replace(/\s+/g, ' ').slice(0, 60).toLowerCase().replace(/(^|\s)\p{L}/gu, c => c.toUpperCase());
    avanzar();
  }

  /* ---------- Texto libre: respuestas cortas y siempre con salida a WhatsApp ---------- */
  const has = (q, ...words) => words.some(w => new RegExp('\\b' + w).test(q));
  function findSchool(q) {
    const exact = SCHOOL_ORDER.find(id => q.includes(normal(SCHOOLS[id])) && id !== 'ijh');
    if (exact) return exact;
    const hits = Object.entries(ALIAS).filter(([, al]) => al.some(a => new RegExp('\\b' + a + '\\b').test(q))).map(([id]) => id);
    return hits.length === 1 ? hits[0] : '';
  }
  const PALABRAS_CONSULTA = ['horario', 'abren', 'direccion', 'donde', 'whatsapp', 'telefono', 'persona', 'promo', 'descuento',
    'pago', 'cuota', 'tarjeta', 'envio', 'reserva', 'precio', 'cuanto', 'presupuesto', 'talle', 'colegios'];
  function esPregunta(text) {
    const q = normal(text);
    return text.includes('?') || q.split(' ').length > 4 || has(q, ...PALABRAS_CONSULTA);
  }
  function freeText(text) {
    const q = normal(text);
    if (has(q, 'colegios', 'instituciones', 'trabajan con')) return go('colegios');
    if (has(q, 'horario', 'abren', 'abierto', 'cierran', 'atienden')) return go('horario');
    if (has(q, 'direccion', 'donde', 'ubicacion', 'como llego', 'llegar', 'local', 'mapa')) return go('llegar');
    if (has(q, 'persona', 'humano', 'asesor', 'vendedor', 'whatsapp', 'telefono', 'llamar', 'contacto')) return go('persona');
    if (has(q, 'promo', 'descuento', 'oferta', 'pago', 'pagar', 'cuota', 'tarjeta', 'transferencia', 'efectivo')) return go('promos');
    if (has(q, 'envio', 'envian', 'interior', 'reserva', 'reservar', 'apartar', 'retiro')) return go('reserva');
    if (has(q, 'canal', 'instagram', 'novedades')) return go('canal');
    const colegio = findSchool(q);
    if (colegio || has(q, 'presupuesto', 'precio', 'cuanto', 'sale', 'cuesta', 'valor', 'talle', 'uniforme', 'pantalon', 'buzo', 'campera', 'remera', 'chomba', 'pollera')) {
      return go('presupuesto', colegio ? {colegio} : {});
    }
    go('respuesta', 'Eso te lo responde mejor una persona del local.' + waButtons(`Consulta: ${text}`));
  }

  /* ---------- Entrada desde el sitio ---------- */
  window.abrirAsistente = (flujo, opts = {}) => {
    started = true;
    toggle(true);
    history = [];
    ctx = {};
    if (flujo === 'presupuesto') {
      add('from-user', esc(opts.colegio ? `Presupuesto para ${SCHOOLS[opts.colegio]}` : 'Necesito presupuesto'));
      go('presupuesto', opts);
    } else home();
  };
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-bot]');
    if (!a) return;
    e.preventDefault();
    window.abrirAsistente(a.dataset.bot);
  });
})();
