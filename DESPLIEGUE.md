# Despliegue: Render (sitio, API y dominio) + Supabase (datos)

```
Visitante ──► Sitio estático (Render) ──► API (Render) ──► PostgreSQL (Supabase)
               index.html, assets/        server/            tabla leads
```

## 1. Supabase: la base de datos
1. Crear un proyecto en <https://supabase.com> (región sugerida: São Paulo). Guardar la contraseña de la base.
2. En **Project Settings → Database → Connection string**, elegir **Session pooler** y copiar la URI.
   Queda así: `postgresql://postgres.XXXX:[CONTRASEÑA]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`
   (reemplazar `[CONTRASEÑA]`). Usar el *pooler*: la conexión directa es solo IPv6 y Render no la alcanza.
3. No hace falta crear tablas: la API crea `leads` y `resumen_diario` al arrancar y les quita el acceso
   público de Supabase (RLS activo, sin permisos para `anon` ni `authenticated`).

## 2. Render: sitio y API
1. Subir este repositorio a GitHub (ya está en `nicovzqz/axel`).
2. En <https://render.com>: **New → Blueprint** → elegir el repo. Render lee `render.yaml` y crea:
   - `uniformes-m-api`: la API (Node).
   - `uniformesm`: el sitio estático (https://uniformesm.onrender.com).
3. Cuando lo pida, pegar en **DATABASE_URL** la URI de Supabase del paso 1.
4. Verificar la API: `https://uniformes-m-api.onrender.com/api/salud` tiene que responder `{"ok":true}`.
5. Si Render le dio otra dirección a la API (porque el nombre estaba ocupado), cambiarla en
   `assets/config.js` y subir el cambio.

## 3. Dominio propio (DNS en Render)
1. En el sitio `uniformesm` → **Settings → Custom Domains** → agregar el dominio (por ejemplo `uniformesm.com.ar`
   y `www.uniformesm.com.ar`).
2. Cargar en el proveedor del dominio los registros que indica Render (CNAME para `www`, A/ALIAS para el dominio raíz)
   y esperar la verificación. Render emite el certificado HTTPS solo.
3. En la API `uniformes-m-api` → **Environment** → **ALLOWED_ORIGINS**, agregar los dominios separados por coma:
   `https://uniformesm.onrender.com,https://uniformesm.com.ar,https://www.uniformesm.com.ar`

## 4. Ver los clientes
- **Supabase → Table Editor → leads** (requiere iniciar sesión en Supabase). La vista `resumen_diario` muestra
  los ingresos por día.
- Exportar a Excel: `https://uniformes-m-api.onrender.com/api/leads.csv?token=ADMIN_TOKEN`
  (el token está en Render → `uniformes-m-api` → Environment). No compartir ese link.

## Planes gratuitos: a tener en cuenta
- **Render (API)**: se duerme tras 15 minutos sin uso y tarda ~1 minuto en despertar. El chat la despierta
  apenas alguien lo abre, así que en general ya está lista cuando la persona deja su teléfono.
- **Render (sitio estático)**: no se duerme.
- **Supabase**: pausa los proyectos gratuitos sin actividad durante una semana; se reactivan desde el panel.

## Desarrollo local (sin tocar producción)
```
docker compose up -d --build     # PostgreSQL + API en http://localhost:3000 + Adminer en http://localhost:8080
```
El sitio local (`http://localhost:5173`) usa la API local automáticamente.

## 5. Bot de WhatsApp (API oficial de Meta)
El bot vive en la misma API (`/api/whatsapp/webhook`) y usa los mismos precios, promos y base que la web.

**Etapa de prueba** (número de prueba gratuito de Meta; tu celular como destinatario autorizado). Ya está hecho
para la app "Uniformes M Bot" (portfolio "Uniformes M"); esto sirve para repetirlo con otra app o número:
1. <https://developers.facebook.com> → **Crear app** → caso de uso "Conectarte con los clientes a través de WhatsApp"
   → portfolio comercial (se puede crear ahí mismo, sin verificar).
2. **Paso 1. Pruébalo**: anotar el **Phone number ID** y agregar tu celular como destinatario (código por WhatsApp).
   Meta lo guarda como `54 11 15…`; el bot ya prueba ese formato solo si Meta rechaza el `549…` (error 131030).
3. **Configuración de la app → Básica**: URL de privacidad `https://uniformesm.onrender.com/privacidad.html`,
   categoría, guardar, y **Publicar** la app. Sin publicar, Meta **no entrega** mensajes reales al webhook.
4. **Token permanente**: business.facebook.com → Configuración → **Usuarios del sistema** → crear uno (Employee) →
   Asignar activos: la app, la **cuenta de WhatsApp** (Mensajes + Números de teléfono ver y administrar) y la
   **cuenta de mensajes** ("Messaging accounts", acceso total). Generar token sin vencimiento con
   `whatsapp_business_messaging` y `whatsapp_business_management`.
5. **App secret**: Configuración de la app → Básica → Clave secreta.
6. Render → `uniformes-m-api` → **Environment**: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`.
7. **Paso 2 → Webhooks**: Callback `https://uniformes-m-api.onrender.com/api/whatsapp/webhook`,
   Verify token = `WHATSAPP_VERIFY_TOKEN` de Render (se suscribe solo a `messages`).
8. **Activar el número de prueba**: en Paso 1 tocar "Generar token" y "Enviar mensaje" a tu celular (pasa de
   PENDING a CONNECTED y el chat aparece en tu WhatsApp; antes WhatsApp dice que el número no existe).
9. **Suscribir la cuenta de mensajes a la app** (si no, los mensajes no llegan al webhook):
   `POST https://graph.facebook.com/v25.0/<ID cuenta de mensajes>/subscribed_apps` con el token.
10. Responder "hola" en ese chat.

**Para producción**: token permanente (Business Settings → System users), número real del local
verificado en Meta y verificación de la empresa. En local, el bot responde en el registro
(`docker compose logs api`) porque `WHATSAPP_DRY_RUN=1`.
