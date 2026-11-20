# Memoria del proyecto: sitio de Uniformes M

Registro de lo que se hizo, por qué y cómo seguir. Última actualización: 20/11/2026.

## Resumen

Sitio de **Uniformes M** (uniformes colegiales y de trabajo, Villa Ballester, desde 1966) con un
**chat de presupuesto** como protagonista: guía a la familia, arma el presupuesto prenda por prenda,
lo entrega en PDF o por WhatsApp y guarda los datos del cliente en una base de datos.

| Pieza | Dónde |
|---|---|
| Sitio público | https://uniformesm.onrender.com (Render, sitio estático) |
| API de clientes | https://uniformes-m-api.onrender.com (Render, Node) |
| Base de datos | Supabase, proyecto `uniformes-m`, región São Paulo |
| Código | GitHub `nicovzqz/axel`, rama `main` |

Clientes: Supabase → proyecto `uniformes-m` → **Table Editor → `leads`** (vista `resumen_diario` = ingresos por día).

## Cronología

1. **Primeros ejemplos (descartados).** Tres portfolios de muestra de una marca ficticia ("Hilván") y un
   HTML único con calculadora. Se publicó en GitHub Pages y después se eliminó.
2. **Diseño de Axel.** Axel envió `uniformes_m.html` (hecho con ChatGPT). Se rehízo como sitio propio:
   mismos textos y diseño, links internos arreglados, mapa de Google embebido, sin scripts de ChatGPT,
   animaciones suaves (portada, sello 60 años, buzo que flota, cuenta del año 1966).
3. **Precios desde el Excel.** De `LISTAPRECIODELOSCOLEGIOS2025B.xlsx` (59 hojas, incluye costos internos)
   se tomó solo la hoja más nueva, **"junio 2026 0,6"** (18/06/2026): 160 prendas, precios de lista por
   talle, asignadas a los 13 colegios. El Excel **nunca se sube** (tiene costos).
4. **Armador de presupuesto en la página** con PDF tipo factura ("Presupuesto", recuadro **X**,
   "Documento no válido como factura"). Hoy está **oculto** (pedido de Axel), se reactiva con
   `MOSTRAR_ARMADOR = true` en `assets/app.js`.
5. **Chat de respuestas automáticas.** Empezó como preguntas frecuentes y evolucionó a flujo guiado,
   según los pedidos de Axel y su guía `guianico.docx`:
   - saludo y menú de Axel; "Con qué colegios trabajamos"; Horario; Cómo llegar; Promociones; canal;
   - presupuesto: colegio → nombre → **teléfono** → talle → año → nivel (orden y niveles según colegio);
   - "Presupuesto en precio de lista" con tabla **Premium / Clásica** y vista por línea con
     efectivo, 3 pagos, 6 pagos y precio de lista;
   - **armado prenda por prenda** (modelo, talle, cantidad), total, PDF y envío por WhatsApp;
   - reserva: "retiro en el local" o "envío (solo efectivo o transferencia)";
   - siempre visibles: **Volver, Inicio y Atención personalizada**;
   - **límite de 4 presupuestos cada 72 horas**; desde el 5º pasa directo a WhatsApp.
   - Diseño: panel grande a la derecha en escritorio (desde debajo del menú), pantalla completa en teléfono,
     invitación "Armemos tu presupuesto" destacada.
6. **Planilla nueva `lista_web.csv`** para que Axel mantenga precios y niveles (ver abajo).
7. **Base de datos de clientes.** API Node + PostgreSQL. Primero en Docker local, después en
   **Render + Supabase**. Cada presupuesto del chat es una fila que se completa a medida que avanza.
8. **Despliegue.** Blueprint de Render (`render.yaml`) con sitio + API; base en Supabase. Se verificó
   un recorrido real desde el sitio publicado guardado en Supabase.

## Decisiones importantes (y por qué)

- **No se usa la palabra "Factura"**: un documento no fiscal que diga factura puede traer problemas.
- **Promo por grupos** (deducida de prenda y línea):
  - A: pantalones, buzos, camperas y equipos **Premium**;
  - B: remeras, chombas, shorts y polleras pantalón **Premium**;
  - C: Clásica y prendas sin línea (gris, escocesas, pullovers, accesorios).
- **Talles de adulto** de la planilla ("1/XL", "2/XXL"...) se muestran como XL, XXL, etc.
  Un "3/XXXL" repetido en "Pantalón grueso" (IJH) se cargó como XXXXL: **conviene que Axel lo revise**.
- **6 pagos = precio de lista** (supuesto, el Excel lo sugiere). Se cambia en `SEIS_PAGOS` (`assets/comercial.js`).
- **Seguridad de datos**: en Supabase la tabla `leads` tiene RLS y sin permisos para los roles públicos;
  además la Data API del proyecto está desactivada. La API solo acepta datos de `uniformesm.onrender.com`.
- **WhatsApp**: API oficial de Meta (gratuita para responder mensajes de clientes) en lugar de automatizar
  WhatsApp Web (riesgo de bloqueo). Meta ahora separa "cuenta de WhatsApp" (el número) y "cuenta de mensajes"
  (plantillas y pagos): el bot necesita acceso a las dos y la cuenta de mensajes suscripta a la app.

## Archivos clave

| Archivo | Para qué |
|---|---|
| `index.html` | Página (diseño de Axel). Los `?v=…` de los scripts evitan versiones viejas en caché. |
| `assets/app.js` | Lógica de la página y `MOSTRAR_ARMADOR`. |
| `assets/comercial.js` | **Promociones**, formas de pago, WhatsApp y datos del local (web y bot de WhatsApp). |
| `server/src/whatsapp/` | Bot de WhatsApp: `flujo.js` (conversación), `meta.js` (API de Meta), `datos.js`. |
| `assets/bot.js` | Chat: menú, flujo de presupuesto, preguntas por colegio, límite de intentos, envío a la API. |
| `privacidad.html` | Política de privacidad (la exige Meta para publicar la app). |
| `assets/pdf.js` | PDF del presupuesto (jsPDF desde cdnjs). |
| `assets/config.js` | Dirección de la API para el sitio publicado. |
| `lista_web.csv` | **Planilla de precios que mantiene Axel** (se abre con Excel). |
| `precios.js` | Generado desde la planilla. No editar a mano. |
| `scripts/lista_web.py` | Convierte la planilla (`.csv` o `.xlsx`) en `precios.js`. |
| `scripts/extraer_precios.py` | Conversión única desde el Excel viejo (`--forzar` para pisar la planilla). |
| `server/` | API (Express + pg) y `db/init.sql` (tabla `leads`, vista `resumen_diario`, permisos). |
| `render.yaml` | Blueprint de Render (sitio `uniformesm` + API `uniformes-m-api`). |
| `docker-compose.yml` | Entorno local: PostgreSQL + API + Adminer. |
| `DESPLIEGUE.md` | Paso a paso de Supabase, Render y dominio propio. |

## Cómo se mantiene

**Precios y niveles** — `lista_web.csv`, una fila por prenda y por colegio:

`Colegio | Nivel | Prenda | Modelo | Línea | Detalle | 1 | 2 | … | 50 | S | M | L | XL | XXL | XXXL | XXXXL | Único`

- Nivel: Jardín, Primaria, Secundaria o Profesorado (varios con coma). Vacío = todos los niveles.
- Línea: Premium, Clásica o vacío. Columnas de talle = precio de lista (vacío = no viene en ese talle).
- Después: `python scripts/lista_web.py lista_web.csv`, subir los cambios y Render se actualiza solo.

**Promociones** — `PROMOS` en `assets/comercial.js` (porcentajes y fecha de vencimiento).
Al vencer, cada promo deja de mostrarse y se aplica el 20% habitual en efectivo.

**Publicar** — `git push` a `main`: Render vuelve a desplegar el sitio y la API.
Cambiar el número `?v=…` de `index.html` cuando cambian los archivos de `assets/`.

**Local** — `docker compose up -d --build` (API en `localhost:3000`, Adminer en `localhost:8080`,
motor PostgreSQL, servidor `db`; claves en `.env`, que no se sube).

## Pendientes

- [ ] **Cambiar la contraseña de la base de Supabase** (se compartió en el chat) y actualizar
      `DATABASE_URL` en Render → `uniformes-m-api` → Environment.
- [ ] Axel completa la columna **Nivel** en `lista_web.csv` (hoy 53 de 278 filas la tienen).
- [ ] Confirmar condición de **6 pagos** y el link del **canal** (hoy apunta a Instagram).
- [ ] Revisar el talle repetido de "Pantalón grueso" (IJH) en la planilla original.
- [x] **Bot de WhatsApp funcionando** (20/11/2026) con el número de prueba de Meta (+1 555-155-5704) y el celular
      de Nico como destinatario. App de Meta "Uniformes M Bot" (publicada), portfolio "Uniformes M" (sin verificar),
      usuario del sistema "Uniformes M Bot" con token sin vencimiento. Paso a paso en DESPLIEGUE.md, sección 5.
- [ ] **Cambiar el token de WhatsApp y el App Secret** (se compartieron en el chat): revocar/generar token en
      Usuarios del sistema y restablecer la clave en Configuración → Básica; actualizar Render.
- [ ] Pasar el bot a los números reales del local: agregar el número en WhatsApp Manager, verificar la empresa,
      cargar forma de pago (solo para mensajes que inicia la empresa) y cambiar `WHATSAPP_PHONE_NUMBER_ID`.
- [ ] Opcional: dominio propio (Render → `uniformesm` → Custom Domains) y sumarlo a `ALLOWED_ORIGINS`.
- [ ] Opcional: texto de privacidad en el sitio (se guardan nombre y teléfono).

## A tener en cuenta (planes gratuitos)

- La API de Render se duerme tras 15 minutos sin uso; el chat la despierta al abrirse (~1 minuto).
- Supabase pausa proyectos gratuitos sin actividad durante una semana; se reactivan desde el panel.
