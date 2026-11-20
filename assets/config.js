/* Dirección de la API que guarda los clientes del chat (servicio "uniformes-m-api" de Render).
   En la computadora local no hace falta: el chat usa http://localhost:3000 (Docker). */
if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  window.UM_API_URL = window.UM_API_URL || 'https://uniformes-m-api.onrender.com';
}
