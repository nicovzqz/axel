/* Asistente de respuesta automática de Uniformes M.
   Responde con reglas fijas (no usa IA) y solo con datos que ya están en el sitio:
   contacto, horarios, promos (PROMOS) y la lista de precios (LISTA).
   Lo que no sabe lo deriva a WhatsApp. Depende de app.js, que se carga antes. */
(() => {
  const INFO = {
    direccion: 'Almirante Brown 3091, Villa Ballester, Buenos Aires (entre Artigas y Agüer)',
    horarios: 'Lunes a viernes de 9:30 a 13:30 y de 15:30 a 19:30. Sábados de 10 a 14.',
    mapa: 'https://maps.app.goo.gl/UkL2oTv5u8oP5boS9',
    instagram: 'https://www.instagram.com/uniformescolegialesm/',
    fijo: '011 4847-1366'
  };
  const PRENDAS = ['pantalon', 'buzo', 'campera', 'remera', 'chomba', 'pollera', 'short', 'bermuda', 'calza',
    'pullover', 'chaleco', 'delantal', 'medias', 'mochila', 'morral', 'equipo', 'musculosa', 'vinilo', 'numero'];
  /* Alias de cada colegio, sin acentos. "jose hernandez" solo es ambiguo (ver más abajo). */
  const ALIAS = {
    cjh: ['colegio jose hernandez', 'col jh', 'cjh'],
    ijh: ['instituto jose hernandez', 'ijh'],
    prof: ['profesorado'],
    ib: ['instituto ballester'],
    sj: ['san joaquin', 'joaquin'],
    lm: ['merced'],
    isa: ['santa ana', 'isa'],
    rd: ['ruben dario', 'dario'],
    jn: ['nenelandya'],
    aguer: ['fernando aguer', 'colegio aguer', 'aguer'],
    jb: ['belen'],
    el: ['lamarca'],
    as: ['alfonsina', 'storni']
  };
  const CHIPS = {
    inicio: ['Precios de mi colegio', 'Promociones', 'Horarios y dirección', 'Formas de pago', 'Hablar con una persona'],
    corto: ['Precios de mi colegio', 'Promociones', 'Hablar con una persona']
  };

  let open = false;
  let started = false;
  let school = '';

  /* ---------- Interfaz ---------- */
  const root = document.createElement('div');
  root.className = 'bot';
  root.innerHTML = `
    <button class="bot-fab" type="button" aria-expanded="false" aria-controls="bot-panel">
      <span class="bot-fab-dot" aria-hidden="true"></span><span>¿Te ayudamos?</span>
    </button>
    <section class="bot-panel" id="bot-panel" aria-label="Asistente de Uniformes M" hidden>
      <header class="bot-head">
        <div><strong>Asistente Uniformes M</strong><small>Respuestas automáticas · al instante</small></div>
        <button type="button" class="bot-close" aria-label="Cerrar asistente">×</button>
      </header>
      <div class="bot-log" role="log" aria-live="polite"></div>
      <div class="bot-chips"></div>
      <form class="bot-form">
        <input type="text" maxlength="200" placeholder="Escribí tu pregunta…" aria-label="Tu pregunta" autocomplete="off">
        <button type="submit" aria-label="Enviar">↑</button>
      </form>
    </section>`;
  document.body.append(root);
  const fab = root.querySelector('.bot-fab');
  const panel = root.querySelector('.bot-panel');
  const log = root.querySelector('.bot-log');
  const chips = root.querySelector('.bot-chips');
  const input = root.querySelector('input');

  function toggle(force) {
    open = force ?? !open;
    panel.hidden = !open;
    fab.setAttribute('aria-expanded', String(open));
    root.classList.toggle('is-open', open);
    if (open && !started) {
      started = true;
      bot('¡Hola! Soy el asistente automático de Uniformes M. Te ayudo con precios, talles, promociones, horarios y cómo llegar. ¿Qué necesitás?', CHIPS.inicio);
    }
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
  function bot(html, next = CHIPS.corto) {
    const typing = add('from-bot typing', '<span></span><span></span><span></span>');
    setChips([]);
    setTimeout(() => {
      typing.classList.remove('typing');
      typing.innerHTML = html;
      log.scrollTop = log.scrollHeight;
      setChips(next);
    }, 450);
  }
  function setChips(list) {
    chips.innerHTML = list.map(c => `<button type="button">${esc(c)}</button>`).join('');
  }
  chips.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) ask(b.textContent);
  });
  root.querySelector('.bot-form').addEventListener('submit', e => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) { input.value = ''; ask(q); }
  });
  /* Acciones dentro de las respuestas: abrir el armador con un colegio. */
  log.addEventListener('click', e => {
    const b = e.target.closest('[data-armar]');
    if (!b) return;
    setSchool(b.dataset.armar);
    toggle(false);
    document.getElementById('presupuesto').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  });

  function ask(text) {
    add('from-user', esc(text));
    const r = answer(text);
    bot(r.html, r.chips);
  }

  /* ---------- Entender la pregunta ---------- */
  const has = (q, ...words) => words.some(w => new RegExp('\\b' + w).test(q));

  function findSchool(q) {
    const exact = SCHOOL_ORDER.find(id => q.includes(normal(SCHOOLS[id])) && id !== 'ijh');
    if (exact) return [exact];
    const hits = Object.entries(ALIAS).filter(([, al]) => al.some(a => new RegExp('\\b' + a + '\\b').test(q))).map(([id]) => id);
    if (hits.length) return hits;
    if (/jose hernandez|\bjh\b/.test(q)) return ['cjh', 'ijh', 'prof'];
    if (/\bballester\b/.test(q) && !/villa ballester/.test(q)) return ['ib'];
    return [];
  }
  function findPrenda(q) {
    return PRENDAS.find(p => new RegExp('\\b' + p).test(q)) || '';
  }
  function findTalle(q) {
    const m = q.match(/\btalle\s*([a-z0-9/]+)/) || q.match(/\b(x{0,4}[sml]|x{1,4}l|\d{1,2})\b(?!\s*(%|de|pagos|cuotas))/);
    return m ? m[1].toUpperCase() : '';
  }

  function answer(raw) {
    const q = normal(raw);
    const schools = findSchool(q);
    if (schools.length === 1) school = schools[0];
    /* Si no lo dijo en el chat, se usa el colegio elegido en el armador. */
    if (!school && state.school) school = state.school;
    const prenda = findPrenda(q);

    if (q === 'otra prenda') return precios('', '');

    if (has(q, 'hola', 'buen dia', 'buenas') && q.length < 25) {
      return {html: '¡Hola! ¿En qué te ayudo? Podés preguntarme, por ejemplo, <em>“cuánto sale el buzo de Santa Ana”</em>.', chips: CHIPS.inicio};
    }
    if (has(q, 'gracias', 'genial', 'perfecto', 'buenisimo')) {
      return {html: '¡De nada! Si necesitás algo más, acá estoy.', chips: CHIPS.corto};
    }
    if (has(q, 'persona', 'humano', 'asesor', 'vendedor', 'hablar con', 'whatsapp', 'telefono', 'llamar', 'contacto', 'instagram')) {
      return {html: contacto('Te atendemos personalmente por estos medios:'), chips: ['Horarios y dirección', 'Precios de mi colegio']};
    }
    if (has(q, 'horario', 'abren', 'abierto', 'cierran', 'atienden', 'sabado', 'domingo', 'feriado')) {
      const extra = has(q, 'domingo', 'feriado') ? '<br>Para domingos o feriados, consultanos por WhatsApp.' : '';
      return {html: `<strong>Horarios del local</strong><br>${INFO.horarios}${extra}<br><br>Estamos en ${INFO.direccion}.`, chips: ['Cómo llego', 'Precios de mi colegio']};
    }
    if (has(q, 'direccion', 'donde', 'ubicacion', 'como llego', 'local', 'mapa', 'llegar')) {
      return {html: `Estamos en <strong>${INFO.direccion}</strong>.<br>${INFO.horarios}<br><a href="${INFO.mapa}" target="_blank" rel="noopener">Abrir en Google Maps ↗</a>`, chips: CHIPS.corto};
    }
    if (has(q, 'envio', 'envian', 'interior', 'mandan', 'domicilio', 'correo')) {
      return {html: 'Sí, hacemos <strong>envíos al interior del país</strong>. El costo y el tiempo dependen del destino, así que te lo confirmamos por WhatsApp.' + contacto(''), chips: CHIPS.corto};
    }
    if (has(q, 'promo', 'descuento', 'oferta', 'off', 'rebaja', 'liquidacion')) {
      return {html: promos(), chips: ['Formas de pago', 'Precios de mi colegio']};
    }
    if (has(q, 'pago', 'pagar', 'cuota', 'tarjeta', 'transferencia', 'efectivo', 'mercado pago', 'debito', 'credito')) {
      return {html: pagos(), chips: ['Promociones', 'Precios de mi colegio']};
    }
    if (has(q, 'medida', 'especial', 'religios', 'adaptacion', 'arreglo')) {
      return {html: 'Fabricamos <strong>prendas a medida</strong> por necesidades de talle o por motivos religiosos, como adaptaciones de polleras. Cada caso lo vemos en el local o por WhatsApp.' + contacto(''), chips: CHIPS.corto};
    }
    if (has(q, 'empresa', 'trabajo', 'salud', 'ambo', 'comercio', 'industria', 'equipo de trabajo', 'personalizad', 'bordado', 'estampa')) {
      return {html: 'Para empresas, salud, comercios e industria hacemos uniformes personalizados, con <strong>pedidos desde 12 prendas por modelo</strong>. Lo mejor es coordinar una charla:' + contacto(''), chips: ['Horarios y dirección', 'Hablar con una persona']};
    }
    if (has(q, 'colegios', 'que colegio', 'con que colegio', 'trabajan con', 'instituciones', 'mi colegio no')) {
      return {html: 'Trabajamos con estas instituciones:<ul>' + SCHOOL_ORDER.map(id => `<li>${esc(SCHOOLS[id])}</li>`).join('') + '</ul>Si tu colegio no está, consultanos igual: también diseñamos uniformes nuevos.', chips: ['Precios de mi colegio', 'Hablar con una persona']};
    }
    if (schools.length > 1) {
      return {html: 'Hay más de una institución con ese nombre. ¿Cuál es la tuya?', chips: schools.map(id => SCHOOLS[id])};
    }
    if (has(q, 'precio', 'cuanto', 'sale', 'cuesta', 'valor', 'presupuesto', 'lista', 'talle') || prenda || schools.length) {
      return precios(q, prenda);
    }
    return {
      html: 'No tengo una respuesta automática para eso. Te conviene escribirnos y te contesta una persona del local:' + contacto(''),
      chips: CHIPS.inicio
    };
  }

  /* ---------- Respuestas con datos ---------- */
  function contacto(intro) {
    return `${intro ? intro + '<br>' : '<br><br>'}WhatsApp: <a href="https://wa.me/${WHATSAPP[0]}" target="_blank" rel="noopener">11 2896-3629</a> · <a href="https://wa.me/${WHATSAPP[1]}" target="_blank" rel="noopener">11 2347-7515</a><br>Teléfono: ${INFO.fijo}<br>Instagram: <a href="${INFO.instagram}" target="_blank" rel="noopener">@uniformescolegialesm</a>`;
  }
  function promos() {
    const live = PROMO_ORDER.filter(g => activePromo(g)).map(g => PROMOS[g]);
    if (!live.length) return `Ahora no hay una promoción especial. Pagando en efectivo o transferencia tenés ${SIN_PROMO.efectivo}% de descuento sobre el precio de lista.`;
    return '<strong>Promociones vigentes</strong><ul>' + live.map(p =>
      `<li>${esc(p.nombre)}: <strong>${p.efectivo}% off</strong> en efectivo o transferencia${p.tresPagos ? `, ${p.tresPagos}% off en 3 pagos` : ''}. Hasta el ${shortDate(p.vence)}.</li>`).join('') + '</ul>';
  }
  function pagos() {
    const live = PROMO_ORDER.some(g => activePromo(g));
    return `Podés pagar en <strong>efectivo o transferencia</strong>, o en <strong>3 pagos</strong>. ${live ? 'Cada uno tiene su descuento según la promoción vigente.' : `En efectivo o transferencia tenés ${SIN_PROMO.efectivo}% de descuento.`} Para otros medios o cuotas con tarjeta, consultanos por WhatsApp.` + contacto('');
  }

  function precios(q, prenda) {
    if (!school) {
      return {html: '¿De qué colegio es el uniforme? Elegilo y te paso los precios.', chips: SCHOOL_ORDER.map(id => SCHOOLS[id])};
    }
    const name = SCHOOLS[school];
    const all = LISTA.productos.filter(p => p.colegios.includes(school));
    const list = prenda ? all.filter(p => normal(p.nombre).includes(prenda)) : [];
    const armar = `<button type="button" class="bot-link" data-armar="${school}">Armar mi presupuesto de ${esc(name)} →</button>`;
    if (!prenda) {
      const tipos = [...new Set(all.map(p => p.nombre.split(' ')[0]))];
      return {
        html: `Para <strong>${esc(name)}</strong> tenemos ${all.length} prendas. ¿Cuál te interesa? También podés ver todo en el armador.<br>${armar}`,
        chips: tipos.slice(0, 7)
      };
    }
    if (!list.length) {
      return {html: `No encontré ${esc(prenda)} en la lista de ${esc(name)}. Consultanos por WhatsApp, puede que la tengamos igual.` + contacto(''), chips: ['Precios de mi colegio', 'Hablar con una persona']};
    }
    const talle = findTalle(q);
    const rows = list.slice(0, 6).map(p => {
      const sized = talle && p.talles.find(t => t.t.toUpperCase().split('/').includes(talle) || t.t.toUpperCase() === talle);
      if (sized) {
        const pr = prices(sized.p, p.promo);
        return `<li><strong>${esc(p.nombre)}</strong>, talle ${esc(sized.t)}: ${pesos(pr.efectivo)} en efectivo (${pesos(pr.lista)} de lista)</li>`;
      }
      const ps = p.talles.map(t => prices(t.p, p.promo).efectivo);
      const lo = Math.min(...ps), hi = Math.max(...ps);
      const range = lo === hi ? pesos(lo) : `de ${pesos(lo)} a ${pesos(hi)}`;
      return `<li><strong>${esc(p.nombre)}</strong>: ${range} en efectivo, según el talle (${p.talles.length > 1 ? 'talles ' + esc(p.talles[0].t) + ' a ' + esc(p.talles[p.talles.length - 1].t) : 'talle único'})</li>`;
    }).join('');
    const extra = list.length - 6;
    const more = extra > 0 ? `<br>${extra === 1 ? 'Hay 1 opción más' : `Hay ${extra} opciones más`} en el armador.` : '';
    const sizeNote = talle && !list.some(p => p.talles.some(t => t.t.toUpperCase().split('/').includes(talle) || t.t.toUpperCase() === talle))
      ? `<br>No encontré el talle ${esc(talle)} en la lista; te muestro todos.` : '';
    return {
      html: `<strong>${esc(name)}</strong><ul>${rows}</ul>Precios con la promoción vigente pagando en efectivo o transferencia.${sizeNote}${more}<br>${armar}`,
      chips: ['Formas de pago', 'Otra prenda', 'Hablar con una persona']
    };
  }

})();
