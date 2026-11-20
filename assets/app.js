/* Uniformes M: interacción del sitio y armador de presupuesto.
   Los precios vienen de precios.js (generado desde la lista de Excel). */

/* Promociones, formas de pago y WhatsApp del local: se editan en assets/comercial.js
   (los usa también el bot de WhatsApp). */
const {PROMOS, PROMO_ORDER, SIN_PROMO, SEIS_PAGOS, WHATSAPP} = window.COMERCIAL;

/* Armador de presupuesto en la página: oculto por ahora (pedido de Axel), el presupuesto
   se pide por el asistente, que termina en WhatsApp. Poné true para volver a mostrarlo. */
const MOSTRAR_ARMADOR = false;

/* Orden y nombres tal como aparecen en el diseño. */
const SCHOOL_ORDER = ['cjh', 'ib', 'sj', 'lm', 'isa', 'rd', 'jn', 'ijh', 'aguer', 'prof', 'jb', 'el', 'as'];
const CATEGORY_ORDER = ['Pantalones y equipos', 'Buzos, camperas y abrigo', 'Remeras y chombas',
  'Polleras, shorts y bermudas', 'Delantales', 'Accesorios'];

const $ = id => document.getElementById(id);
const normal = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const pesos = n => '$' + Math.round(n).toLocaleString('es-AR');
const LISTA = window.LISTA;
const SCHOOLS = LISTA.colegios;
const PRODUCTS = Object.fromEntries(LISTA.productos.map(p => [p.id, p]));

/* ---------- Promos ---------- */
function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function parseDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function activePromo(group, on = today()) {
  const p = PROMOS[group];
  return p && on <= parseDay(p.vence) ? p : null;
}
function discounts(group, on) {
  const p = activePromo(group, on);
  return p ? {efectivo: p.efectivo, tresPagos: p.tresPagos, promo: p} : {...SIN_PROMO, promo: null};
}
/* Precio unitario redondeado para cada forma de pago. */
function prices(lista, group, on) {
  const d = discounts(group, on);
  return {
    lista,
    efectivo: Math.round(lista * (100 - d.efectivo) / 100),
    tresPagos: Math.round(lista * (100 - d.tresPagos) / 100),
    d
  };
}
const shortDate = iso => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };

/* Tabla de promos en el orden de PROMO_ORDER. Las vencidas no se muestran. */
function renderPromoBar() {
  const live = PROMO_ORDER.filter(g => activePromo(g)).map(g => PROMOS[g]);
  $('promo-bar').hidden = !live.length;
  $('promo-bar').innerHTML = `<table>
    <caption>Promociones vigentes</caption>
    <thead><tr><th scope="col">Productos</th><th scope="col">Efectivo / transf.</th><th scope="col">3 pagos</th><th scope="col">Vence</th></tr></thead>
    <tbody>${live.map(p => `<tr>
      <th scope="row">${p.nombre}</th>
      <td data-label="Efectivo / transf."><b>${p.efectivo}% OFF</b></td>
      <td data-label="3 pagos">${p.tresPagos ? `<b>${p.tresPagos}% OFF</b>` : '<span aria-label="Sin descuento">—</span>'}</td>
      <td data-label="Vence">${shortDate(p.vence)}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

/* ---------- Colegios (lista del diseño) ---------- */
function renderSchools() {
  const q = normal($('search').value);
  $('schools').replaceChildren();
  let n = 0;
  SCHOOL_ORDER.forEach((id, i) => {
    const name = SCHOOLS[id];
    if (!normal(name).includes(q)) return;
    n++;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'school';
    b.innerHTML = `<span>${String(i + 1).padStart(2, '0')} / COLEGIALES</span><strong></strong><small>Ver prendas y precios ↗</small>`;
    b.querySelector('strong').textContent = name;
    b.onclick = () => {
      $('school-title').textContent = name;
      $('school-dialog').dataset.school = id;
      $('school-dialog').showModal();
    };
    $('schools').append(b);
  });
  $('count').textContent = n + ' ' + (n === 1 ? 'institución' : 'instituciones');
  if (!n) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No encontramos coincidencias. Podés consultarnos por tu institución.';
    $('schools').append(p);
  }
}

/* ---------- Catálogo ---------- */
const state = {school: '', items: [], nombre: ''};

function lineaTag(p) {
  if (p.linea === 'Clásica') return '<span class="tag clasica">Clásica</span>';
  if (p.linea === 'Premium' && p.promo !== 'C') return '<span class="tag premium">Premium</span>';
  return '';
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
}

function renderCatalog() {
  const box = $('catalog');
  if (!state.school) {
    box.innerHTML = '<div class="choose"><strong>Empezá por el colegio</strong>Elegilo arriba o tocá tu colegio en la lista de instituciones.</div>';
    return;
  }
  const q = normal($('b-search').value.trim());
  const list = LISTA.productos.filter(p => p.colegios.includes(state.school) && (!q || normal(p.nombre + ' ' + p.detalle).includes(q)));
  if (!list.length) {
    box.innerHTML = '<p class="no-results">No hay prendas que coincidan con la búsqueda.</p>';
    return;
  }
  box.innerHTML = CATEGORY_ORDER.map(cat => {
    const items = list.filter(p => p.categoria === cat);
    if (!items.length) return '';
    return `<div class="cat"><h3>${cat}<small>${items.length} ${items.length === 1 ? 'prenda' : 'prendas'}</small></h3>${items.map(itemRow).join('')}</div>`;
  }).join('');
}

function itemRow(p) {
  const single = p.talles.length === 1;
  const opts = p.talles.map((t, i) => `<option value="${i}">${single && t.t === 'Único' ? 'Talle único' : 'Talle ' + esc(t.t)}</option>`).join('');
  return `<div class="item" data-id="${p.id}">
    <div class="item-info">
      <div class="item-name">${esc(p.nombre)} ${lineaTag(p)}</div>
      ${p.detalle ? `<div class="item-detail">${esc(p.detalle)}</div>` : ''}
      <div class="item-price" data-price></div>
    </div>
    <select class="talle" aria-label="Talle de ${esc(p.nombre)}" ${single ? 'disabled' : ''}>${opts}</select>
    <input class="cant" type="number" min="1" max="50" value="1" inputmode="numeric" aria-label="Cantidad de ${esc(p.nombre)}">
    <button class="add" type="button">Agregar</button>
  </div>`;
}

function updateItemPrice(row) {
  const p = PRODUCTS[row.dataset.id];
  const t = p.talles[+row.querySelector('.talle').value];
  const pr = prices(t.p, p.promo);
  row.querySelector('[data-price]').innerHTML = pr.d.efectivo
    ? `<b>${pesos(pr.efectivo)}</b> efectivo · <s>${pesos(pr.lista)}</s> lista`
    : `<b>${pesos(pr.lista)}</b> precio de lista`;
}
function refreshPrices() {
  document.querySelectorAll('#catalog .item').forEach(updateItemPrice);
}

$('catalog').addEventListener('change', e => {
  const row = e.target.closest('.item');
  if (row && e.target.classList.contains('talle')) updateItemPrice(row);
});
$('catalog').addEventListener('click', e => {
  const btn = e.target.closest('.add');
  if (!btn) return;
  const row = btn.closest('.item');
  const p = PRODUCTS[row.dataset.id];
  const ti = +row.querySelector('.talle').value;
  const qty = Math.min(50, Math.max(1, parseInt(row.querySelector('.cant').value, 10) || 1));
  const found = state.items.find(x => x.id === p.id && x.ti === ti);
  if (found) found.qty = Math.min(50, found.qty + qty);
  else state.items.push({id: p.id, ti, qty});
  row.querySelector('.cant').value = 1;
  btn.textContent = 'Agregado ✓';
  btn.classList.add('done');
  setTimeout(() => { btn.textContent = 'Agregar'; btn.classList.remove('done'); }, 1200);
  renderCart();
});

/* ---------- Presupuesto ---------- */
function totals(items, on) {
  return items.reduce((acc, it) => {
    const p = PRODUCTS[it.id];
    const pr = prices(p.talles[it.ti].p, p.promo, on);
    acc.lista += pr.lista * it.qty;
    acc.efectivo += pr.efectivo * it.qty;
    acc.tresPagos += pr.tresPagos * it.qty;
    acc.unidades += it.qty;
    return acc;
  }, {lista: 0, efectivo: 0, tresPagos: 0, unidades: 0});
}

function renderCart() {
  const items = state.items.filter(it => PRODUCTS[it.id]);
  state.items = items;
  $('cart-school').textContent = state.school ? SCHOOLS[state.school] : '';
  $('cart-empty').hidden = items.length > 0;
  $('totals').hidden = $('cart-actions').hidden = $('cart-pdf').hidden = !items.length;
  if (!items.length) $('pdf-status').textContent = '';
  $('lines').innerHTML = items.map((it, i) => {
    const p = PRODUCTS[it.id];
    const t = p.talles[it.ti];
    return `<li class="line">
      <div><div class="line-name">${esc(p.nombre)}</div><div class="line-meta">${t.t === 'Único' ? 'Talle único' : 'Talle ' + esc(t.t)} · ${pesos(t.p)} c/u</div></div>
      <div class="line-sub">${pesos(t.p * it.qty)}</div>
      <div class="line-ctrl">
        <span class="qty"><button type="button" data-q="-1" data-i="${i}" aria-label="Quitar una">−</button><span>${it.qty}</span><button type="button" data-q="1" data-i="${i}" aria-label="Sumar una">+</button></span>
        <button type="button" class="remove" data-del="${i}">Quitar</button>
      </div>
    </li>`;
  }).join('');
  const t = totals(items);
  $('t-lista').textContent = pesos(t.lista);
  $('t-ef').textContent = pesos(t.efectivo);
  $('t-3p').textContent = pesos(t.tresPagos);
  $('t-ef-save').textContent = t.lista > t.efectivo ? `Ahorrás ${pesos(t.lista - t.efectivo)}` : '';
  $('t-3p-save').textContent = t.lista > t.tresPagos ? `Ahorrás ${pesos(t.lista - t.tresPagos)} · 3 pagos de ${pesos(t.tresPagos / 3)}` : `3 pagos de ${pesos(t.tresPagos / 3)}`;

  const groups = [...new Set(items.map(it => PRODUCTS[it.id].promo))].map(g => activePromo(g)).filter(Boolean);
  const vence = groups.length ? 'Promociones válidas hasta el ' + [...new Set(groups.map(g => shortDate(g.vence)))].join(' y el ') + '. ' : '';
  const f = LISTA.fuente.fecha ? LISTA.fuente.fecha.split('-').reverse().join('/') : '';
  $('fine').textContent = `${vence}Precios de la lista actualizada al ${f}. Presupuesto orientativo: confirmamos precios y stock en el local.`;

  $('cart-bar').hidden = !items.length;
  document.body.classList.toggle('has-cart', items.length > 0);
  $('cart-bar-count').textContent = `${t.unidades} ${t.unidades === 1 ? 'prenda' : 'prendas'} · Ver presupuesto`;
  $('cart-bar-total').textContent = pesos(t.efectivo);
  save();
}

$('lines').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.del !== undefined) state.items.splice(+b.dataset.del, 1);
  else {
    const it = state.items[+b.dataset.i];
    it.qty = Math.min(50, it.qty + +b.dataset.q);
    if (it.qty < 1) state.items.splice(+b.dataset.i, 1);
  }
  renderCart();
});
$('b-clear').onclick = () => { state.items = []; renderCart(); };
$('b-name').addEventListener('input', e => { state.nombre = e.target.value.trim(); save(); });

function setSchool(id) {
  if (id === state.school) return;
  /* Cada presupuesto es de un solo colegio: al cambiarlo se empieza de cero y se avisa. */
  $('b-note').hidden = !(state.school && state.items.length);
  state.items = [];
  state.school = id;
  $('b-school').value = id;
  $('b-search').disabled = !id;
  $('b-search').value = '';
  renderCatalog();
  refreshPrices();
  renderCart();
}
$('b-school').innerHTML += SCHOOL_ORDER.map(id => `<option value="${id}">${esc(SCHOOLS[id])}</option>`).join('');
$('b-school').addEventListener('change', e => setSchool(e.target.value));
$('b-search').addEventListener('input', () => { renderCatalog(); refreshPrices(); });

$('b-send').onclick = () => {
  const t = totals(state.items);
  const lines = state.items.map(it => {
    const p = PRODUCTS[it.id];
    const tl = p.talles[it.ti];
    return `• ${it.qty} × ${p.nombre}, ${tl.t === 'Único' ? 'talle único' : 'talle ' + tl.t} (${pesos(tl.p * it.qty)} de lista)`;
  }).join('\n');
  openMessage('Tu presupuesto está listo.',
    `Hola, quiero consultar este presupuesto para ${SCHOOLS[state.school]}:\n\n${lines}\n\n` +
    `Precio de lista: ${pesos(t.lista)}\nEfectivo o transferencia: ${pesos(t.efectivo)}\nEn 3 pagos: ${pesos(t.tresPagos)}\n\n¿Me confirman disponibilidad?`);
};

/* ---------- Guardado local (comodidad: solo en este navegador) ---------- */
function save() {
  try { localStorage.setItem('um-presupuesto', JSON.stringify(state)); } catch (e) { /* sin almacenamiento */ }
}
function restore() {
  try {
    const s = JSON.parse(localStorage.getItem('um-presupuesto') || 'null');
    if (s && SCHOOLS[s.school]) {
      setSchool(s.school);
      $('b-note').hidden = true;
      state.items = (s.items || []).filter(it => PRODUCTS[it.id] && PRODUCTS[it.id].talles[it.ti]);
    }
    if (s && typeof s.nombre === 'string') state.nombre = $('b-name').value = s.nombre;
  } catch (e) { /* datos viejos o bloqueados */ }
}

/* ---------- Diseño original: colores, diálogos y consulta ---------- */
document.querySelectorAll('[data-color]').forEach(b => b.onclick = () => {
  document.querySelectorAll('[data-color]').forEach(c => c.setAttribute('aria-pressed', String(c === b)));
  $('sweater').setAttribute('fill', b.dataset.color);
});
document.querySelectorAll('[data-interest]').forEach(a => a.addEventListener('click', () => { $('interest').value = a.dataset.interest; }));
document.querySelectorAll('dialog .close').forEach(b => b.onclick = () => b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
$('school-contact').onclick = () => {
  $('institution').value = $('school-title').textContent;
  $('interest').value = 'Uniforme para mi familia';
  $('school-dialog').close();
};
$('school-budget').onclick = e => {
  const id = $('school-dialog').dataset.school;
  $('school-dialog').close();
  if (MOSTRAR_ARMADOR) { setSchool(id); return; }
  e.preventDefault();
  window.abrirAsistente('presupuesto', {colegio: id});
};

function openMessage(title, text) {
  $('message-title').textContent = title;
  $('prepared').value = text;
  $('wa-one').href = `https://wa.me/${WHATSAPP[0]}?text=${encodeURIComponent(text)}`;
  $('wa-two').href = `https://wa.me/${WHATSAPP[1]}?text=${encodeURIComponent(text)}`;
  $('copy-status').textContent = '';
  $('message-dialog').showModal();
}
$('consultation').onsubmit = e => {
  e.preventDefault();
  openMessage('Tu consulta está lista.',
    'Hola, soy ' + $('name').value.trim() + '.\nConsulta: ' + $('interest').value + '.\nInstitución / empresa: ' +
    $('institution').value.trim() + '.\n\n' + $('message').value.trim() + '\n\nMe gustaría conversar con ustedes.');
};
$('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText($('prepared').value);
    $('copy-status').textContent = 'Mensaje copiado. Ya podés pegarlo en WhatsApp o Instagram.';
  } catch {
    $('prepared').select();
    $('copy-status').textContent = 'Seleccionamos el mensaje para que puedas copiarlo.';
  }
};

/* ---------- Vida: cabecera, entradas y el año ---------- */
const header = document.querySelector('header');
const onScroll = () => header.classList.toggle('scrolled', scrollY > 8);
addEventListener('scroll', onScroll, {passive: true});
onScroll();

const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
if ('IntersectionObserver' in window && !calm) {
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    const el = en.target;
    const siblings = [...el.parentElement.querySelectorAll(':scope > .reveal')];
    el.style.transitionDelay = (siblings.indexOf(el) * 90) + 'ms';
    el.classList.remove('waiting');
    io.unobserve(el);
  }), {rootMargin: '0px 0px -8% 0px'});
  /* Solo se esconden los que todavía no están en pantalla, así nada queda invisible al cargar. */
  document.querySelectorAll('.reveal').forEach(el => {
    if (el.getBoundingClientRect().top > innerHeight) { el.classList.add('waiting'); io.observe(el); }
  });

  const year = $('year');
  const yio = new IntersectionObserver(([en]) => {
    if (!en.isIntersecting) return;
    yio.disconnect();
    const start = performance.now();
    const tick = now => {
      const k = Math.min(1, (now - start) / 1400);
      year.textContent = Math.round(2026 - 60 * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  if (year.getBoundingClientRect().top > innerHeight) yio.observe(year);
}

/* ---------- Inicio ---------- */
renderPromoBar();
renderSchools();
$('search').addEventListener('input', renderSchools);
$('presupuesto').hidden = !MOSTRAR_ARMADOR;
if (MOSTRAR_ARMADOR) restore();
renderCatalog();
refreshPrices();
renderCart();
