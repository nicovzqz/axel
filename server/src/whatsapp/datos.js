// Datos que comparte el bot de WhatsApp con el sitio: precios (precios.js) y promociones
// (assets/comercial.js). Se leen de los mismos archivos que usa la web, así nunca difieren.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// En Render el repo está completo: la raíz es tres carpetas arriba. En Docker se monta en DATOS_DIR.
const RAIZ = process.env.DATOS_DIR || path.resolve(__dirname, '..', '..', '..');

function cargar() {
  const ctx = {window: {}};
  vm.createContext(ctx);
  for (const archivo of ['assets/comercial.js', 'precios.js']) {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, archivo), 'utf8'), ctx, {filename: archivo});
  }
  const {LISTA, COMERCIAL} = ctx.window;
  if (!LISTA || !COMERCIAL) throw new Error('No se pudieron leer precios.js o assets/comercial.js');
  return {
    ...COMERCIAL,
    LISTA,
    SCHOOLS: LISTA.colegios,
    PRODUCTS: Object.fromEntries(LISTA.productos.map(p => [p.id, p]))
  };
}

module.exports = {cargar};
