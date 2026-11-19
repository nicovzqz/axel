/* Presupuesto en PDF con formato tipo factura (no fiscal: "Documento no válido como factura").
   Usa jsPDF, que se carga desde cdnjs recién cuando alguien pide el PDF.
   Depende de app.js (state, PRODUCTS, prices, activePromo, SCHOOLS, pesos). */
const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const EMPRESA = {
  direccion: 'Almirante Brown 3091, Villa Ballester, Buenos Aires',
  telefono: 'Tel. 011 4847-1366',
  whatsapp: 'WhatsApp 11 2896-3629 / 11 2347-7515',
  instagram: 'Instagram @uniformescolegialesm'
};

let jspdfLoading = null;
function loadJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  jspdfLoading = jspdfLoading || new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = JSPDF_URL;
    s.onload = () => resolve(window.jspdf);
    s.onerror = () => { jspdfLoading = null; reject(new Error('No se pudo cargar el generador de PDF')); };
    document.head.append(s);
  });
  return jspdfLoading;
}

const two = n => String(n).padStart(2, '0');
const fecha = d => `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`;

/* Arma el documento y lo devuelve (sin guardarlo), así también se puede previsualizar. */
async function buildBudgetPDF(now = new Date()) {
  const {jsPDF} = await loadJsPDF();
  const doc = new jsPDF({unit: 'mm', format: 'a4'});
  const W = 210, M = 15, R = W - M;
  const NAVY = [23, 43, 69], RED = [184, 58, 50], CREAM = [245, 242, 234], LINE = [217, 215, 207], MUTED = [86, 97, 108];
  const numero = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}`;

  const rows = state.items.map(it => {
    const p = PRODUCTS[it.id];
    const t = p.talles[it.ti];
    const pr = prices(t.p, p.promo, now);
    return {cant: it.qty, desc: p.nombre, talle: t.t === 'Único' ? 'Único' : t.t, lista: pr.lista,
      dto: pr.d.efectivo, ef: pr.efectivo, tres: pr.tresPagos, promo: pr.d.promo};
  });
  const tot = rows.reduce((a, r) => ({lista: a.lista + r.lista * r.cant, ef: a.ef + r.ef * r.cant, tres: a.tres + r.tres * r.cant}), {lista: 0, ef: 0, tres: 0});
  const vencimientos = [...new Set(rows.filter(r => r.promo).map(r => r.promo.vence))].sort();

  /* ----- Encabezado ----- */
  function header() {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, 4, 'F');
    doc.setTextColor(...NAVY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('UNIFORMES', M, 22);
    const w = doc.getTextWidth('UNIFORMES');
    doc.setFillColor(...RED);
    doc.rect(M + w + 2.5, 14.2, 10, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('M', M + w + 7.5, 22, {align: 'center'});
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    ['Fabricantes desde 1966', EMPRESA.direccion, EMPRESA.telefono, EMPRESA.whatsapp, EMPRESA.instagram]
      .forEach((l, i) => doc.text(l, M, 30 + i * 4));

    /* Recuadro "X": comprobante no fiscal. */
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.5);
    doc.rect(W / 2 - 7, 12, 14, 14);
    doc.setTextColor(...NAVY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('X', W / 2, 22.5, {align: 'center'});
    doc.setFontSize(6.2);
    doc.setFont('helvetica', 'normal');
    doc.text('DOCUMENTO NO VÁLIDO', W / 2, 30, {align: 'center'});
    doc.text('COMO FACTURA', W / 2, 33, {align: 'center'});
    doc.line(W / 2, 36, W / 2, 50);

    doc.setFont('times', 'normal');
    doc.setFontSize(24);
    doc.setTextColor(...NAVY);
    doc.text('Presupuesto', R, 22, {align: 'right'});
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const meta = [['Nº', numero], ['Fecha', fecha(now)]];
    if (vencimientos.length) {
      const [y, m, d] = vencimientos[0].split('-');
      meta.push(['Válido hasta', `${d}/${m}/${y}`]);
    }
    meta.forEach(([k, v], i) => {
      doc.setTextColor(...MUTED);
      doc.text(k, R - 40, 31 + i * 5);
      doc.setTextColor(...NAVY);
      doc.setFont('helvetica', 'bold');
      doc.text(v, R, 31 + i * 5, {align: 'right'});
      doc.setFont('helvetica', 'normal');
    });
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.6);
    doc.line(M, 52, R, 52);
  }
  header();

  /* ----- Cliente ----- */
  let y = 58;
  doc.setFillColor(...CREAM);
  doc.rect(M, y, R - M, 16, 'F');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('CLIENTE', M + 4, y + 6);
  doc.text('COLEGIO', M + 76, y + 6);
  doc.setFontSize(10.5);
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.text(doc.splitTextToSize(state.nombre || 'Consumidor final', 66)[0], M + 4, y + 12);
  doc.text(doc.splitTextToSize(SCHOOLS[state.school], R - M - 80)[0], M + 76, y + 12);
  doc.setFont('helvetica', 'normal');
  y += 24;

  /* ----- Tabla de prendas ----- */
  const cols = [
    {k: 'cant', t: 'Cant.', w: 13, a: 'center'},
    {k: 'desc', t: 'Descripción', w: 70, a: 'left'},
    {k: 'talle', t: 'Talle', w: 21, a: 'center'},
    {k: 'lista', t: 'P. unit. lista', w: 27, a: 'right'},
    {k: 'dto', t: 'Dto. ef.', w: 17, a: 'right'},
    {k: 'imp', t: 'Importe ef.', w: 32, a: 'right'}
  ];
  const xs = [];
  cols.reduce((x, c) => { xs.push(x); return x + c.w; }, M);
  const cellX = (i) => cols[i].a === 'right' ? xs[i] + cols[i].w - 2.5 : cols[i].a === 'center' ? xs[i] + cols[i].w / 2 : xs[i] + 2.5;

  function tableHead() {
    doc.setFillColor(...NAVY);
    doc.rect(M, y, R - M, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    cols.forEach((c, i) => doc.text(c.t.toUpperCase(), cellX(i), y + 5.3, {align: c.a}));
    doc.setFont('helvetica', 'normal');
    y += 8;
  }
  tableHead();

  const BOTTOM = 270;
  rows.forEach((r, n) => {
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(r.desc, cols[1].w - 5);
    const h = Math.max(8, lines.length * 4 + 4);
    if (y + h > BOTTOM) {
      doc.addPage();
      header();
      y = 58;
      tableHead();
    }
    if (n % 2) { doc.setFillColor(...CREAM); doc.rect(M, y, R - M, h, 'F'); }
    doc.setTextColor(...NAVY);
    const base = y + 5.3;
    const vals = {cant: String(r.cant), talle: r.talle, lista: pesos(r.lista), dto: r.dto ? r.dto + '%' : '—', imp: pesos(r.ef * r.cant)};
    cols.forEach((c, i) => {
      if (c.k === 'desc') doc.text(lines, cellX(i), base);
      else doc.text(vals[c.k], cellX(i), base, {align: c.a});
    });
    y += h;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(M, y, R, y);
  });

  /* ----- Totales ----- */
  if (y + 52 > BOTTOM) { doc.addPage(); header(); y = 58; }
  y += 6;
  const bx = R - 82;
  const line = (label, value, opts = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size || 9.5);
    doc.setTextColor(...(opts.color || NAVY));
    doc.text(label, bx, y);
    doc.text(value, R, y, {align: 'right'});
    y += opts.step || 6;
  };
  line('Subtotal (precio de lista)', pesos(tot.lista));
  /* Guion común: el signo menos tipográfico no existe en las fuentes base del PDF. */
  line('Descuento efectivo / transferencia', tot.lista > tot.ef ? '- ' + pesos(tot.lista - tot.ef) : pesos(0), {color: RED});
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.5);
  doc.line(bx, y - 2, R, y - 2);
  y += 4;
  doc.setFillColor(...NAVY);
  doc.rect(bx - 3, y - 6.5, R - bx + 3, 12, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL EFECTIVO / TRANSF.', bx, y + 1);
  doc.setFontSize(14);
  doc.text(pesos(tot.ef), R - 2, y + 1.3, {align: 'right'});
  y += 13;
  line('Total en 3 pagos', pesos(tot.tres), {bold: true});
  line(`3 pagos de ${pesos(tot.tres / 3)}`, '', {color: MUTED, size: 8.5});

  /* ----- Condiciones ----- */
  let ny = y + 6;
  const notas = [];
  rows.filter(r => r.promo).map(r => r.promo).filter((p, i, a) => a.indexOf(p) === i).forEach(p => {
    const [, m, d] = p.vence.split('-');
    notas.push(`${p.nombre}: ${p.efectivo}% off en efectivo o transferencia${p.tresPagos ? `, ${p.tresPagos}% off en 3 pagos` : ''}. Válido hasta el ${d}/${m}.`);
  });
  if (!notas.length) notas.push(`Descuento del ${SIN_PROMO.efectivo}% pagando en efectivo o transferencia.`);
  const f = LISTA.fuente.fecha ? LISTA.fuente.fecha.split('-').reverse().join('/') : '';
  notas.push(`Precios de la lista actualizada al ${f}. Presupuesto orientativo: confirmamos precios y stock en el local.`);
  if (ny + 10 + notas.length * 9 > 282) { doc.addPage(); header(); ny = 58; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...NAVY);
  doc.text('CONDICIONES', M, ny);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  ny += 5;
  notas.forEach(n => {
    const ls = doc.splitTextToSize('· ' + n, R - M);
    doc.text(ls, M, ny);
    ny += ls.length * 3.8 + 1;
  });

  /* ----- Pie en cada página ----- */
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(M, 285, R, 285);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text('Uniformes M · Fabricantes desde 1966 · Documento no válido como factura', M, 290);
    doc.text(`Página ${i} de ${pages}`, R, 290, {align: 'right'});
  }

  const slug = normal(SCHOOLS[state.school]).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return {doc, filename: `presupuesto-uniformes-m-${slug}-${numero}.pdf`};
}

async function downloadBudgetPDF(button) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Generando…';
  $('pdf-status').textContent = '';
  try {
    const {doc, filename} = await buildBudgetPDF();
    doc.save(filename);
    $('pdf-status').textContent = 'Listo: descargamos tu presupuesto en PDF.';
  } catch (e) {
    $('pdf-status').textContent = 'No pudimos generar el PDF. Revisá tu conexión a internet y probá de nuevo.';
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}
$('b-pdf').onclick = e => downloadBudgetPDF(e.currentTarget);
