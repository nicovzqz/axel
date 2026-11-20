/* Datos comerciales que comparten el sitio y el bot de WhatsApp (server/src/whatsapp).
   PROMOCIONES: editá estos valores cuando cambie la promo.
   El grupo de cada prenda (A, B o C) lo asigna scripts/lista_web.py.
   "vence" es el último día de la promo, inclusive. */
window.COMERCIAL = {
  PROMOS: {
    A: {nombre: 'Pantalones, buzos y camperas Premium', efectivo: 45, tresPagos: 30, vence: '2026-11-30'},
    B: {nombre: 'Remeras, chombas, shorts y polleras pantalón Premium', efectivo: 45, tresPagos: 0, vence: '2026-11-23'},
    C: {nombre: 'Demás prendas', efectivo: 35, tresPagos: 20, vence: '2026-11-30'}
  },
  /* Orden en que se muestran las promos (el de la pieza de la promo). */
  PROMO_ORDER: ['A', 'C', 'B'],
  /* Descuento habitual cuando no hay promo vigente (columna EFC de la lista). */
  SIN_PROMO: {efectivo: 20, tresPagos: 0},
  /* 6 pagos: por ahora precio de lista (0% de descuento). Confirmar con Axel. */
  SEIS_PAGOS: {descuento: 0},
  /* WhatsApp de atención personalizada del local. */
  WHATSAPP: ['541128963629', '541123477515'],
  /* Datos del local. */
  LOCAL: {
    direccion: 'Almirante Brown 3091, Villa Ballester (entre Artigas y Agüer)',
    horarios: 'Lunes a viernes de 9:30 a 13:30 y de 15:30 a 19:30. Sábados de 10 a 14.',
    mapa: 'https://maps.app.goo.gl/UkL2oTv5u8oP5boS9'
  }
};
