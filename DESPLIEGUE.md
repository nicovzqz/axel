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
