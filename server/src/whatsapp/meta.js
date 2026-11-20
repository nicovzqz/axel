// Conexión con la API oficial de WhatsApp (Cloud API de Meta): recibir avisos y enviar mensajes.
const crypto = require('crypto');

const VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';
const TOKEN = process.env.WHATSAPP_TOKEN || '';
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const SECRETO = process.env.WHATSAPP_APP_SECRET || '';
/* Modo prueba sin Meta: los mensajes se escriben en el registro en lugar de enviarse. */
const SIMULAR = process.env.WHATSAPP_DRY_RUN === '1';

const configurado = () => SIMULAR || Boolean(TOKEN && PHONE_ID);

/* Meta firma cada aviso con el App Secret; si no coincide, no viene de Meta. */
function firmaValida(cuerpo, encabezado) {
  if (!SECRETO) return SIMULAR;
  if (!cuerpo || !encabezado || !encabezado.startsWith('sha256=')) return false;
  const esperado = Buffer.from('sha256=' + crypto.createHmac('sha256', SECRETO).update(cuerpo).digest('hex'));
  const recibido = Buffer.from(encabezado);
  return esperado.length === recibido.length && crypto.timingSafeEqual(esperado, recibido);
}

/* Mensajes que escribió la gente (se ignoran avisos de entrega y lectura). */
function extraerMensajes(body) {
  const out = [];
  for (const entry of body.entry || []) {
    for (const cambio of entry.changes || []) {
      const v = cambio.value || {};
      const nombres = Object.fromEntries((v.contacts || []).map(c => [c.wa_id, c.profile && c.profile.name]));
      for (const m of v.messages || []) {
        let entrada = {tipo: 'otro'};
        if (m.type === 'text') entrada = {tipo: 'texto', texto: m.text.body};
        else if (m.type === 'interactive' && m.interactive.button_reply) entrada = {tipo: 'opcion', id: m.interactive.button_reply.id};
        else if (m.type === 'interactive' && m.interactive.list_reply) entrada = {tipo: 'opcion', id: m.interactive.list_reply.id};
        else if (m.type === 'button') entrada = {tipo: 'texto', texto: m.button.text};
        out.push({id: m.id, de: m.from, perfil: nombres[m.from] || null, entrada});
      }
    }
  }
  return out;
}

function aFormatoMeta(para, msg) {
  const base = {messaging_product: 'whatsapp', recipient_type: 'individual', to: para};
  if (msg.tipo === 'texto') return {...base, type: 'text', text: {body: msg.texto.slice(0, 4096), preview_url: true}};
  if (msg.tipo === 'botones') {
    return {...base, type: 'interactive', interactive: {
      type: 'button', body: {text: msg.texto.slice(0, 1024)}, footer: msg.pie ? {text: msg.pie.slice(0, 60)} : undefined,
      action: {buttons: msg.botones.map(b => ({type: 'reply', reply: {id: b.id, title: b.titulo.slice(0, 20)}}))}
    }};
  }
  return {...base, type: 'interactive', interactive: {
    type: 'list', body: {text: msg.texto.slice(0, 1024)}, footer: msg.pie ? {text: msg.pie.slice(0, 60)} : undefined,
    action: {button: (msg.boton || 'Ver opciones').slice(0, 20), sections: [{title: 'Opciones', rows: msg.filas.map(f => ({
      id: f.id, title: f.titulo.slice(0, 24), ...(f.descripcion ? {description: f.descripcion.slice(0, 72)} : {})
    }))}]}
  }};
}

/* Envía los mensajes en orden (WhatsApp los muestra en el orden en que llegan). */
async function enviar(para, mensajes) {
  for (const msg of mensajes) {
    const payload = aFormatoMeta(para, msg);
    if (SIMULAR) {
      console.log('[whatsapp simulado] →', para, JSON.stringify(payload));
      continue;
    }
    const res = await fetch(`https://graph.facebook.com/${VERSION}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const error = await res.text();
      console.error(`WhatsApp no aceptó el mensaje (${res.status}):`, error.slice(0, 500));
      break;
    }
  }
}

module.exports = {configurado, firmaValida, extraerMensajes, enviar, aFormatoMeta, SIMULAR};
