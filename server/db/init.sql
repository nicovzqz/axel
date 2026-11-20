-- Clientes que pasan por el asistente. Una fila por presupuesto (sesión del chat).
-- Es idempotente: la API lo ejecuta al arrancar (Supabase) y Docker al crear la base local.
CREATE TABLE IF NOT EXISTS leads (
  id              bigserial PRIMARY KEY,
  sesion          uuid        NOT NULL UNIQUE,
  creado          timestamptz NOT NULL DEFAULT now(),
  actualizado     timestamptz NOT NULL DEFAULT now(),
  nombre          text,
  telefono        text,
  colegio         text,
  nivel           text,
  anio            text,
  talle           text,
  etapa           text,       -- última etapa: contacto, datos, presupuesto, pdf, reserva, whatsapp
  presupuesto     jsonb,      -- [{prenda, linea, talle, cantidad, precio_lista}]
  total_lista     integer,
  total_efectivo  integer,
  total_3_pagos   integer,
  total_6_pagos   integer,
  reserva         text,
  descargo_pdf    boolean     NOT NULL DEFAULT false,
  abrio_whatsapp  boolean     NOT NULL DEFAULT false,
  origen          text
);
CREATE INDEX IF NOT EXISTS leads_creado_idx ON leads (creado DESC);
CREATE INDEX IF NOT EXISTS leads_telefono_idx ON leads (telefono);

-- Supabase publica las tablas de "public" con su API REST y la clave anónima.
-- Con RLS activo y sin políticas, nadie puede leer ni escribir por ahí; la API de Uniformes M
-- se conecta como dueña de la tabla y no se ve afectada.
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Control diario de ingresos de clientes. security_invoker: la vista respeta los permisos de la tabla.
CREATE OR REPLACE VIEW resumen_diario WITH (security_invoker = true) AS
SELECT
  (creado AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS dia,
  count(*)                                        AS consultas,
  count(*) FILTER (WHERE presupuesto IS NOT NULL) AS con_presupuesto,
  count(*) FILTER (WHERE reserva IS NOT NULL)     AS reservas,
  count(*) FILTER (WHERE abrio_whatsapp)          AS abrieron_whatsapp,
  count(*) FILTER (WHERE descargo_pdf)            AS descargaron_pdf,
  coalesce(sum(total_efectivo) FILTER (WHERE presupuesto IS NOT NULL), 0) AS total_presupuestado_efectivo
FROM leads
GROUP BY 1
ORDER BY 1 DESC;

-- En Supabase existen los roles anon y authenticated (los de su API pública): sin acceso.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON leads, resumen_diario FROM anon;
    REVOKE ALL ON SEQUENCE leads_id_seq FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON leads, resumen_diario FROM authenticated;
    REVOKE ALL ON SEQUENCE leads_id_seq FROM authenticated;
  END IF;
END $$;
