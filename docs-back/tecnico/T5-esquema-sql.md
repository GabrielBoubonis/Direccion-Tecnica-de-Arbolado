# T5 — Esquema de base de datos

> Diseño técnico · Última actualización: 21/08/2026 · Estado: **sin aprobar**
> Absorbe la auditoría del 20/08: blindaje, captores, cuarentena, fotos de reclamo, certificación diferida, discrepancia de reloj y purga de idempotencia.
> Responde: el DDL completo — tipos, tablas, restricciones, índices, triggers y políticas de seguridad por fila.

---

## 1. Dos esquemas, una frontera visible

| Esquema | Qué contiene | El día de la transferencia |
| --- | --- | --- |
| `sua_sim` | Los reclamos, tal como nos los daría el SUA | **Se borra entero** |
| `arbolado` | Todo lo propio del módulo | Migra a la base municipal |

Solo `SuaSimuladoAdapter` consulta `sua_sim`. Ningún caso de uso lo toca. **En la defensa se puede borrar el esquema entero y mostrar que lo único que se rompe es un adaptador.**

Que la frontera con el mundo externo sea visible en la base —y no solo en el código— es lo que vuelve la arquitectura demostrable en lugar de declarativa.

---

## 2. Tipos enumerados

```sql
create type arbolado.prioridad       as enum ('verde','amarillo','naranja','rojo');
create type arbolado.rol             as enum ('lector','operario','jefe','administrador');
create type arbolado.distrito        as enum ('Centro','Norte','Noroeste','Oeste','Sudoeste','Sur');
create type arbolado.estado_modulo   as enum ('sin_dictaminar','reservado','dictaminado','vencido_redictaminar');
create type arbolado.categoria       as enum ('riesgo_estructural','cableado','infraestructura','obstruccion','poda_estetica');
create type arbolado.origen_categoria as enum ('inferida','corregida');
create type arbolado.modo_traslado   as enum ('auto','pie','bicicleta');
create type arbolado.complejidad     as enum ('baja','media','alta','maxima');
create type arbolado.precision_punto as enum ('exacta','aproximada','solo_calle','fallida');
create type arbolado.origen_punto    as enum ('geocodificado','corregido_por_usuario');
create type arbolado.motivo_liberacion as enum ('dictaminado','vencida','manual','liberada_por_admin','cierre_jornada');
create type arbolado.estado_dictamen as enum ('firmado','vencido','anulado');
create type arbolado.estado_certificacion as enum ('no_requerida','pendiente','certificado','fallida');
create type arbolado.discrepancia_reloj  as enum ('ninguna','leve','grave');
create type arbolado.estado_foto      as enum ('esperando','subida','fallida');
create type arbolado.estado_captor    as enum ('activo','de_baja');
create type arbolado.motivo_baja_captor as enum ('robo','extravio','destruccion','reasignacion');
create type arbolado.estado_cuarentena as enum ('en_cuarentena','liberada','descartada');
create type arbolado.estado_borrador  as enum ('activo','inactivo','descartado');
create type arbolado.estado_jornada  as enum ('pre_confirmada','confirmada','cerrada','cancelada');
create type arbolado.ambito_directiva as enum ('global','distrito','usuario');
create type arbolado.origen_alta     as enum ('sua','oficio','vecino','tormenta');

create type sua_sim.origen_ingreso   as enum ('munibot','presencial','distrito','de_oficio');
create type sua_sim.estado_sua       as enum ('ingresado','derivado','dictaminado','en_ejecucion','cerrado');
```

**Enums y no texto libre con `check`**: el enum documenta el dominio en la propia base, es lo primero que ve alguien que abre el esquema, y agregar un valor obliga a una migración explícita — que es exactamente lo que se quiere cuando se agrega un estado a una máquina de estados.

**Los valores están en español** por la misma razón que el resto del dominio: una discusión sobre `prioridad_vigente` tiene que ser la misma discusión del lado del código y del lado de la repartición.

---

## 3. Esquema `sua_sim`

```sql
create table sua_sim.reclamo (
  nro_reclamo_sua   text        not null,
  anio              smallint    not null,
  fecha_ingreso     timestamptz not null,
  origen_ingreso    sua_sim.origen_ingreso not null,
  tipo              text        not null default 'Reclamo',
  subtipo           text        not null default 'Problemas con el arbolado público',
  direccion_exacta  text        not null,
  calle             text        not null,
  altura            integer,
  entre_calle_1     text,
  entre_calle_2     text,
  distrito          arbolado.distrito not null,
  barrio            text,
  descripcion_motivo text       not null,
  foto_url          text,
  estado_sua        sua_sim.estado_sua not null default 'ingresado',
  area_asignada     text,
  fecha_derivacion  timestamptz,
  creado_por_usuario uuid,
  primary key (nro_reclamo_sua, anio)
);

create index ix_reclamo_listado   on sua_sim.reclamo (area_asignada, estado_sua);
create index ix_reclamo_distrito  on sua_sim.reclamo (distrito);
create index ix_reclamo_direccion on sua_sim.reclamo (lower(calle), altura);
create index ix_reclamo_fecha     on sua_sim.reclamo (fecha_ingreso desc);
```

### Tres decisiones que vale la pena justificar

**La clave primaria es el par (`nro_reclamo_sua`, `anio`).** Es la clave funcional que exige RF-12 y la que el ingeniero tipea frente al árbol. Son **dos campos separados**: se elige el año y se busca el número dentro de ese año (D-41). Un identificador sintético habría sido más cómodo de programar y habría obligado a mantener una traducción permanente entre lo que el usuario dice y lo que el sistema guarda.

**No hay `lat` ni `lng`.** El SUA guarda solo la dirección escrita —que es la del ejemplar, no la del vecino— y ninguna coordenada, porque el censo de arbolado nunca se geolocalizó (B-02). Simularlas acá sería atribuirle al SUA un dato que no tiene: el mismo error que se evita con la prioridad. El punto vive en `arbolado.reclamo_geo`.

**`tipo` y `subtipo` están fijos y existen igual.** El alcance de entrada es solo Tipo `Reclamo` / Subtipo `Problemas con el arbolado público`. Los campos existen para que el adaptador filtre **igual que contra el SUA real**, y no para que el simulado sea más simple.

`foto_url` puede venir vacío: la calidad del dato de entrada es heterogénea y el seed tiene que reflejarlo.

---

## 4. Esquema `arbolado` — identidad

```sql
create table arbolado.perfil (
  usuario_id        uuid primary key,
  identificador     text not null unique,
  legajo            text not null,
  nombre_apellido   text not null,
  rol               arbolado.rol not null,
  distrito_asignado arbolado.distrito,
  activo            boolean not null default true,
  creado_en         timestamptz not null default now(),
  constraint ck_identificador_formato
    check (identificador ~ '^[a-z][a-z]{1,6}[0-9]+$')
);

create index ix_perfil_rol on arbolado.perfil (rol) where activo;
```

**El `check` del identificador codifica el formato municipal real**: primera letra del nombre, hasta seis del apellido, número correlativo — `gboubon0` (B-04). Se valida en la base y no solo en el código porque es una regla del dominio, no una comodidad de la interfaz.

**No hay campo de matrícula ni de habilitación individual.** Firmar es atributo del rol (D-50): firman Operario y Jefe. El Administrador es personal del CIL y no firma. Es el desvío más fuerte del proyecto, documentado en DV-10.

`distrito_asignado` **precarga filtros, no restringe**. Con la intención de escalar a un ingeniero por distrito (A-01), tener el filtro puesto ahorra clics; impedirle mirar otro distrito no ayudaría a nadie.

---

## 5. Esquema `arbolado` — reclamos, prioridad y geografía

```sql
create table arbolado.reclamo_estado (
  nro_reclamo_sua   text not null,
  anio              smallint not null,
  prioridad_base    arbolado.prioridad not null default 'verde',
  prioridad_vigente arbolado.prioridad not null default 'verde',
  fecha_ultimo_escalamiento date,
  estado_modulo     arbolado.estado_modulo not null default 'sin_dictaminar',
  etiqueta_tormenta boolean not null default false,
  fecha_tormenta    timestamptz,
  origen_alta       arbolado.origen_alta not null default 'sua',
  categoria         arbolado.categoria not null,
  categoria_origen  arbolado.origen_categoria not null default 'inferida',
  categoria_corregida_por uuid references arbolado.perfil(usuario_id),
  senal_riesgo_detectada text,
  cantidad_reclamos_ejemplar integer not null default 1,
  id_ejemplar_agrupado text not null,
  primary key (nro_reclamo_sua, anio),
  foreign key (nro_reclamo_sua, anio) references sua_sim.reclamo (nro_reclamo_sua, anio)
);

create index ix_estado_cola     on arbolado.reclamo_estado (estado_modulo, prioridad_vigente);
create index ix_estado_tormenta on arbolado.reclamo_estado (fecha_tormenta desc) where etiqueta_tormenta;
create index ix_estado_ejemplar on arbolado.reclamo_estado (id_ejemplar_agrupado);
```

> La clave foránea a `sua_sim` **desaparece el día de la transferencia**, cuando el reclamo vive en el SUA real y no en una tabla nuestra. Existe hoy porque hoy sí se puede garantizar integridad referencial, y perder esa garantía por anticipado no le sirve a nadie. El adaptador es el que absorbe el cambio.

```sql
create table arbolado.reclamo_geo (
  nro_reclamo_sua   text not null,
  anio              smallint not null,
  lat               double precision not null,
  lng               double precision not null,
  precision         arbolado.precision_punto not null,
  origen_punto      arbolado.origen_punto not null,
  direccion_normalizada text not null,
  proveedor         text not null,
  geocodificado_en  timestamptz not null default now(),
  corregido_por     uuid references arbolado.perfil(usuario_id),
  corregido_en      timestamptz,
  primary key (nro_reclamo_sua, anio),
  constraint ck_lat check (lat between -90 and 90),
  constraint ck_lng check (lng between -180 and 180),
  constraint ck_correccion_coherente
    check ((origen_punto = 'corregido_por_usuario') = (corregido_por is not null))
);

create index ix_geo_punto on arbolado.reclamo_geo using gist (point(lng, lat));
create index ix_geo_precision on arbolado.reclamo_geo (precision)
  where precision in ('fallida','solo_calle');
```

**El índice parcial sobre las precisiones malas** existe porque la pantalla de pre-confirmación las destaca (D-53) y el job de re-geocodificación las busca. Son pocas filas sobre el total y merecen su propio índice angosto.

**`ck_correccion_coherente` impide un estado imposible**: que el punto diga "corregido por un usuario" y no haya usuario, o al revés. Es el tipo de invariante que en el código se olvida y en la base no.

```sql
create table arbolado.regla_prioridad (
  id serial primary key,
  tipo_regla  text not null check (tipo_regla in ('senal_riesgo','reiteracion','ritmo_escalamiento')),
  categoria   arbolado.categoria,
  patron      text,
  resultado   text not null,
  activa      boolean not null default true,
  orden       integer not null default 100
);

create table arbolado.regla_complejidad (
  id serial primary key,
  nivel           arbolado.complejidad not null,
  diametro_desde  numeric(6,2), diametro_hasta numeric(6,2),
  altura_desde    numeric(5,2), altura_hasta   numeric(5,2),
  orden           integer not null default 100,
  activa          boolean not null default true
);

create table arbolado.escalamiento_historial (
  id bigserial primary key,
  nro_reclamo_sua text not null, anio smallint not null,
  de_prioridad arbolado.prioridad not null,
  a_prioridad  arbolado.prioridad not null,
  motivo       text not null check (motivo in ('alta','tiempo','manual')),
  fecha        timestamptz not null default now(),
  ejecutado_por uuid references arbolado.perfil(usuario_id)
);

create index ix_escalamiento_reclamo on arbolado.escalamiento_historial (nro_reclamo_sua, anio, fecha desc);
```

**Una fila por cada salto de color.** Es lo que permite contestar en la defensa *"¿por qué este reclamo está en rojo?"* con un dato. `ejecutado_por` es nulo cuando fue el job automático.

**`regla_complejidad` arranca vacía** (D-49): los cortes los carga el Administrador desde el panel, y la sugerencia de RF-15 aparece recién cuando hay filas.

---

## 6. Reservas

```sql
create table arbolado.reserva (
  id uuid primary key default gen_random_uuid(),
  nro_reclamo_sua text not null, anio smallint not null,
  usuario_id uuid not null references arbolado.perfil(usuario_id),
  ruta_id uuid,
  tomada_en timestamptz not null default now(),
  vence_en  timestamptz not null,
  liberada_en timestamptz,
  motivo_liberacion arbolado.motivo_liberacion,

  blindada   boolean not null default false,
  captor_id  uuid references arbolado.captor(id),
  blindada_en timestamptz,

  constraint ck_blindaje_con_captor check (not blindada or captor_id is not null)
);

create unique index ux_reserva_activa
  on arbolado.reserva (nro_reclamo_sua, anio)
  where liberada_en is null;

create index ix_reserva_usuario on arbolado.reserva (usuario_id) where liberada_en is null;
create index ix_reserva_vencimiento on arbolado.reserva (vence_en) where liberada_en is null;

-- Índice que usan TODOS los trabajos programados para saltear lo blindado (RF-34)
create index ix_reserva_blindada on arbolado.reserva (nro_reclamo_sua, anio)
  where liberada_en is null and blindada;
```

### El blindaje son tres columnas, no una tabla (RF-34)

Tomar un caso lo **reserva**; confirmar la jornada lo **blinda**. Se resolvió con columnas sobre `reserva` y no con una tabla aparte porque **la reserva ya es el candado exclusivo del reclamo**: un segundo candado abriría la puerta a que los dos se contradigan, y no habría forma de decidir cuál manda.

`ck_blindaje_con_captor` impide blindar sin decir en qué dispositivo salió el caso. Es la columna que permite responder, con el captor perdido, exactamente qué se fue con él.

**Todo trabajo programado filtra por este índice.** No es una convención: es la mitad del valor de RF-34.

```sql
-- El patrón que repiten los jobs de T9
where not exists (
  select 1 from arbolado.reserva r
   where r.nro_reclamo_sua = e.nro_reclamo_sua and r.anio = e.anio
     and r.liberada_en is null and r.blindada
)
```

Sin ese `not exists`, el trabajo de escalamiento le sube la prioridad a un reclamo de madrugada mientras el ingeniero lleva en el bolsillo una copia precargada con la prioridad vieja. **El dato no se puede mover bajo los pies del que está en la calle**, y en la calle no hay forma de enterarse de que se movió.

### `arbolado.captor` y la cuarentena (RF-35, D-63)

```sql
create table arbolado.captor (
  id uuid primary key default gen_random_uuid(),
  etiqueta text not null unique,
  asignado_a uuid references arbolado.perfil(usuario_id),
  estado arbolado.estado_captor not null default 'activo',
  motivo_baja arbolado.motivo_baja_captor,
  dado_de_baja_por uuid references arbolado.perfil(usuario_id),
  dado_de_baja_en timestamptz,
  constraint ck_baja_con_motivo check (estado = 'activo' or motivo_baja is not null)
);

create table arbolado.operacion_cuarentena (
  id uuid primary key default gen_random_uuid(),
  captor_id uuid not null references arbolado.captor(id),
  usuario_id uuid references arbolado.perfil(usuario_id),
  tipo_operacion text not null,
  carga jsonb not null,
  recibida_en timestamptz not null default now(),
  estado arbolado.estado_cuarentena not null default 'en_cuarentena',
  resuelta_por uuid references arbolado.perfil(usuario_id),
  resuelta_en timestamptz, motivo text
);

create index ix_cuarentena_pendiente on arbolado.operacion_cuarentena (recibida_en)
  where estado = 'en_cuarentena';
```

`carga` guarda el cuerpo original **tal como llegó**, sin normalizar. Si el Administrador libera la operación, se reprocesa por el mismo camino que cualquier envío de la cola; si la descarta, queda la evidencia de qué se descartó y quién lo decidió.

**Por qué cuarentena y no descarte.** Un equipo robado no debe poder escribir dictámenes; un equipo olvidado en un cajón y recuperado a la semana puede traer trabajo de campo perfectamente válido. La cuarentena **separa la decisión de seguridad —automática e inmediata— de la decisión sobre el contenido**, que la toma una persona mirando. Descartar sin mirar violaría el principio que el proyecto sostiene en todos lados: no se tira trabajo de campo.

**`ux_reserva_activa` es la garantía dura del sistema.** Un índice único parcial permite **una sola reserva activa por reclamo**, y no depende de que el código se acuerde de chequear: lo impone la base. Dos peticiones simultáneas, una gana y la otra recibe un rechazo limpio.

Es el mecanismo que sostiene "se toma con señal, se ejecuta sin señal" (D-14). Sin él, dos ingenieros pueden dictaminar el mismo árbol y uno de los dos pierde el trabajo.

Mientras está reservado, el resto del equipo **lo ve en el listado** marcado con quién lo tiene y desde cuándo — no desaparece (D-15). Así el jefe ve el reparto del día y nadie reclama dos veces el mismo caso.

---

## 7. Dictamen

```sql
create table arbolado.dictamen (
  id uuid primary key,                       -- generado en el DISPOSITIVO
  nro_reclamo_sua text not null, anio smallint not null,

  usuario_id uuid not null references arbolado.perfil(usuario_id),
  legajo_firmante text not null,
  rol_firmante    arbolado.rol not null,
  config_firma_version integer not null,
  nro_expediente text, nro_nota text,

  fecha_dictamen   timestamptz not null,     -- reloj del DISPOSITIVO: fecha legal
  fecha_recepcion  timestamptz not null default now(),
  fecha_vencimiento date not null,

  especie text not null,
  especie_normalizada text,
  perimetro_tronco numeric(6,2),
  diametro_calculado numeric(6,2)
    generated always as (perimetro_tronco / 3.14159265358979) stored,
  altura_aproximada numeric(5,2),
  estado_copa text, estado_tronco text, estado_raices text, inclinacion_ejemplar text,

  direccion_confirmada text not null, calle_esquina text,
  distancia_medianera numeric(5,2), cantidad_frente smallint,
  lat_captura double precision, lng_captura double precision,

  categoria_intervencion text,
  extraccion            text[] not null default '{}',
  trabajos_aereos       text[] not null default '{}',
  trabajos_subterraneos text[] not null default '{}',
  sin_trabajo           text[] not null default '{}',
  plantar               text[] not null default '{}',

  dano_vereda text,
  complejidad arbolado.complejidad,
  complejidad_sugerida arbolado.complejidad,
  urgencia text, epoca_recomendada text,

  urgente boolean not null default false,
  frente_garage boolean not null default false,
  media_tension boolean not null default false,
  de_oficio boolean not null default false,

  observaciones_tecnicas text,
  firma_trazo jsonb not null,                -- vectores de signature_pad.toData(), NO un PNG
  firma_hash text not null,
  hash_documento text not null, sello_tiempo timestamptz not null,
  estado arbolado.estado_dictamen not null default 'firmado',
  anulado_por uuid references arbolado.perfil(usuario_id),
  anulado_en timestamptz, motivo_anulacion text,
  sincronizado_origen boolean not null default false,

  estado_certificacion arbolado.estado_certificacion not null default 'no_requerida',
  certificadora text, certificado_en timestamptz,
  intentos_certificacion smallint not null default 0,

  captor_id uuid references arbolado.captor(id),
  discrepancia_reloj arbolado.discrepancia_reloj not null default 'ninguna',
  fecha_confirmada_por uuid references arbolado.perfil(usuario_id),
  fecha_confirmada_en timestamptz,
  fotos_declaradas smallint not null default 0,

  constraint ck_exclusion_extraccion check (
    cardinality(extraccion) = 0
    or (cardinality(trabajos_aereos) = 0 and cardinality(trabajos_subterraneos) = 0)
  ),
  constraint ck_sin_trabajo check (
    cardinality(sin_trabajo) = 0
    or (cardinality(extraccion) = 0 and cardinality(trabajos_aereos) = 0
        and cardinality(trabajos_subterraneos) = 0)
  )
);

create unique index ux_dictamen_vigente
  on arbolado.dictamen (nro_reclamo_sua, anio)
  where estado = 'firmado';

create index ix_dictamen_vencimiento on arbolado.dictamen (fecha_vencimiento)
  where estado = 'firmado';
create index ix_dictamen_pendiente_sync on arbolado.dictamen (fecha_recepcion)
  where not sincronizado_origen and estado = 'firmado';

create index ix_dictamen_pendiente_cert on arbolado.dictamen (fecha_recepcion)
  where estado_certificacion = 'pendiente' and estado = 'firmado';

-- El job de vencimientos SALTEA los de discrepancia grave hasta que un humano confirme (D-67)
create index ix_dictamen_reloj_grave on arbolado.dictamen (fecha_recepcion)
  where discrepancia_reloj = 'grave' and fecha_confirmada_en is null;
```

### Siete decisiones que vale la pena justificar

**`id` generado en el dispositivo.** Es la clave de idempotencia: si el celular reintenta el envío tres veces porque la señal va y viene, entra **un** dictamen, no tres. Sin esto, la cola offline duplicaría trabajo de campo.

**`fecha_dictamen` y `fecha_recepcion` separadas.** El dictamen se emitió frente al árbol el martes a las 10:30, aunque haya llegado al servidor el miércoles. La fecha legal es la primera; la segunda es trazabilidad. El vencimiento a dieciocho meses cuenta desde la emisión.

**`diametro_calculado` es una columna generada.** El ingeniero mide **perímetro** con cinta, la regla de complejidad habla de **diámetro** (A-10). Que la conversión viva en la base y no en el código garantiza que nadie guarde un diámetro inconsistente con su perímetro, y que la sugerencia sea reproducible.

**Las exclusiones están en `check`, no solo en el código.** RF-14 dice que extracción bloquea poda y corte de raíces. El front valida por comodidad, el backend por obligación, **y la base como última red**. Tres capas para la misma regla suena excesivo hasta que se recuerda que el resultado es un documento con validez legal.

**`ux_dictamen_vigente` garantiza un dictamen válido por reclamo** (RNF-07), contando solo los firmados. Es la red de seguridad final debajo de la reserva: si por algún camino imprevisto dos dictámenes llegaran al mismo reclamo, la base rechaza el segundo.

**`hash_documento`** es la huella del contenido al momento de firmar. Cualquier modificación posterior se detecta comparando. Es lo que sostiene la inmutabilidad de RNF-06 más allá de la promesa.

**`estado` y `estado_certificacion` son dos columnas y no una.** Firmar es local y no puede fallar; certificar sale de nuestra frontera y sí (D-65). Mezclarlas dejaría que un timeout de red produjera un dictamen legalmente ambiguo. Un dictamen `firmado` + `pendiente` es válido puertas adentro —inmutable, auditable, cuenta para el vencimiento— y lo único que no puede hacer es salir en un entregable a concesionarias.

### Inmutabilidad, impuesta por la base

El contenido técnico del dictamen es intocable. Pero **hay campos que no son contenido y tienen que poder cambiar después de firmar**: el resultado de la certificación externa, la marca de sincronización con el SUA, la confirmación de una fecha con reloj discrepante. El trigger tiene que distinguirlos, y la forma segura de hacerlo es **enumerar lo que puede cambiar**, no lo que no.

```sql
create or replace function arbolado.impedir_modificacion_dictamen()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'Un dictamen firmado no se borra (RF-19, RNF-06)';
  end if;

  -- Lo único mutable después de firmar, enumerado. Todo lo demás se congela.
  if NEW is distinct from (OLD).* then
    if (NEW.estado, NEW.estado_certificacion, NEW.certificadora, NEW.certificado_en,
        NEW.intentos_certificacion, NEW.sincronizado_origen, NEW.fecha_vencimiento,
        NEW.fecha_confirmada_por, NEW.fecha_confirmada_en, NEW.discrepancia_reloj,
        NEW.anulado_por, NEW.anulado_en, NEW.motivo_anulacion)
       is not distinct from
       (OLD.estado, OLD.estado_certificacion, OLD.certificadora, OLD.certificado_en,
        OLD.intentos_certificacion, OLD.sincronizado_origen, OLD.fecha_vencimiento,
        OLD.fecha_confirmada_por, OLD.fecha_confirmada_en, OLD.discrepancia_reloj,
        OLD.anulado_por, OLD.anulado_en, OLD.motivo_anulacion)
    then
      raise exception 'Un dictamen firmado es de solo lectura (RF-19, RNF-06)';
    end if;
  end if;

  if OLD.hash_documento is distinct from NEW.hash_documento
     or OLD.firma_trazo is distinct from NEW.firma_trazo
     or OLD.sello_tiempo is distinct from NEW.sello_tiempo
     or OLD.fecha_dictamen is distinct from NEW.fecha_dictamen then
    raise exception 'No se puede alterar la firma ni el hash de un dictamen firmado';
  end if;

  if OLD.estado = 'firmado' and NEW.estado not in ('firmado','vencido','anulado') then
    raise exception 'Transición de estado no permitida sobre un dictamen firmado';
  end if;
  if OLD.estado in ('vencido','anulado') and NEW.estado <> OLD.estado then
    raise exception 'Un dictamen vencido o anulado no vuelve atrás';
  end if;

  return NEW;
end $$;

create trigger tg_dictamen_inmutable
  before update or delete on arbolado.dictamen
  for each row execute function arbolado.impedir_modificacion_dictamen();
```

> **Esto corrige un error real del diseño anterior.** El trigger como estaba escrito rechazaba **cualquier** `update` que dejara `estado = 'firmado'`, porque la condición era `NEW.estado not in ('vencido','anulado')` y `'firmado'` tampoco está en esa lista. Con ese trigger aplicado, marcar `sincronizado_origen = true` después de sincronizar con el SUA —que es el paso 5 del caso de uso de firma— habría fallado siempre. Se detectó al sumar los campos de certificación y quedó anotado como parte de la auditoría.

Las **únicas** transiciones de estado permitidas sobre un dictamen firmado son a `vencido` (por el trabajo de vencimientos) y a `anulado` (por el Administrador, con motivo), y **ninguna de las dos vuelve atrás**. Corregir un dictamen firmado no es editarlo: **es anularlo y emitir uno nuevo**, y ambos quedan en el historial. Es lo que exige RNF-06 y lo que hace defendible el documento ante una impugnación.

El **contenido técnico** —especie, medidas, intervenciones, observaciones, firma, hash, sello de tiempo y fecha de emisión— no admite ninguna modificación por ningún camino, ni siquiera con un error de programación del lado del servidor.

```sql
create table arbolado.dictamen_foto (
  id uuid primary key,                       -- generado en el DISPOSITIVO, como el dictamen
  dictamen_id uuid not null references arbolado.dictamen(id) on delete cascade,
  orden smallint not null default 0,
  estado arbolado.estado_foto not null default 'esperando',
  ruta_storage text,                         -- nulo mientras el archivo no llegó
  bytes integer,
  tomada_en timestamptz, subida_en timestamptz,
  constraint ck_foto_subida check (estado <> 'subida' or ruta_storage is not null),
  unique (dictamen_id, orden)
);

create table arbolado.reclamo_foto (           -- RF-36
  id uuid primary key,
  nro_reclamo_sua text not null, anio smallint not null,
  orden smallint not null default 0,
  estado arbolado.estado_foto not null default 'esperando',
  ruta_storage text, bytes integer,
  tomada_por uuid references arbolado.perfil(usuario_id),
  tomada_en timestamptz, subida_en timestamptz,
  constraint ck_reclamo_foto_subida check (estado <> 'subida' or ruta_storage is not null),
  unique (nro_reclamo_sua, anio, orden)
);

create table arbolado.dictamen_borrador (
  id uuid primary key,
  nro_reclamo_sua text not null, anio smallint not null,
  usuario_id uuid not null references arbolado.perfil(usuario_id),
  contenido jsonb not null,
  motivo_rechazo text not null,
  dictamen_ganador_id uuid references arbolado.dictamen(id),
  estado arbolado.estado_borrador not null default 'activo',
  creado_en timestamptz not null default now(),
  ultima_actividad timestamptz not null default now(),
  descartado_por uuid references arbolado.perfil(usuario_id)
);

create table arbolado.certificacion_intento (
  id bigserial primary key,
  dictamen_id uuid not null references arbolado.dictamen(id),
  intento_nro smallint not null,
  certificadora text not null,
  resultado text not null check (resultado in ('ok','error_red','rechazada')),
  detalle text,
  forzado_por uuid references arbolado.perfil(usuario_id),
  ocurrido_en timestamptz not null default now()
);
```

### Las fotos llegan **después** del dictamen (H-01)

`dictamen_foto.dictamen_id` es una clave foránea contra `dictamen`. El diseño anterior decía que las fotos suben **antes** que el dictamen "para que este no espere", y eso **rompe la FK**: la fila del dictamen no existe todavía y el primer dictamen con fotos que se sincronizara devolvería un error de integridad.

Cómo funciona ahora: el cuerpo del dictamen declara `fotos_declaradas`, el servidor inserta esa cantidad de filas en `esperando` dentro de la misma transacción, y cada foto que llega completa una. `ck_foto_subida` garantiza que ninguna fila diga `subida` sin tener el archivo.

Además es mejor operativamente: con una barra de señal conviene que salga primero **lo chico y lo valioso**. Un dictamen firmado al que le falta una foto es un dictamen válido con una foto pendiente; una foto sin dictamen no es nada, y encima queda como objeto huérfano en storage.

**`firma_trazo` es `jsonb`, no `text` con base64** (H-05). Los vectores de `signature_pad.toData()` pesan 2 a 6 KB contra los 20 a 80 KB de un PNG codificado, se redibujan a cualquier resolución para el PDF, y **no inflan el único envío que no puede fallar**. Va embebido en la fila del dictamen y no como operación aparte, porque si viajara suelto podría existir un dictamen firmado sin firma — y la regla es *o el dictamen existe entero y firmado, o no existe*.

**`dictamen_borrador` es el rescate del caso excepcional** (D-16). Si el dictamen se rechaza porque otro ingeniero ya dictaminó ese reclamo, la carga **no se pierde**: queda consultable con el motivo y con quién dictaminó primero. Veinte minutos de trabajo frente a un árbol no se descartan por una condición de carrera.

**Y el sistema no los borra solo** (D-57). A los 30 días sin actividad el trabajo programado los pasa a `inactivo` y aparecen en una bandeja aparte; **`descartado` solo lo escribe una persona**. Era el único punto del diseño donde se perdía trabajo humano sin que nadie lo mirara.

---

## 8. Jornadas y rutas

```sql
create table arbolado.jornada (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references arbolado.perfil(usuario_id),
  fecha date not null,
  criterio text not null check (criterio in ('horas','casos')),
  valor_criterio numeric(5,2) not null,
  zona_distrito arbolado.distrito, zona_barrio text,
  modo_traslado arbolado.modo_traslado not null default 'auto',
  modo_balanceo text not null,
  distribucion jsonb,
  directiva_aplicada uuid,
  estado arbolado.estado_jornada not null default 'pre_confirmada',
  creada_en timestamptz not null default now(),
  confirmada_en timestamptz
);

create table arbolado.ruta (
  id uuid primary key default gen_random_uuid(),
  jornada_id uuid not null references arbolado.jornada(id),
  usuario_id uuid not null references arbolado.perfil(usuario_id),
  fecha_planificacion date not null,
  minutos_traslado integer not null,
  minutos_dictaminacion integer not null,
  distancia_metros integer not null,
  eficiencia_pct numeric(5,2) not null,
  geometria text not null,
  proveedor_ruteo text not null,
  estado text not null default 'planificada',
  creada_en timestamptz not null default now()
);

create table arbolado.detalle_ruta (
  id bigserial primary key,
  ruta_id uuid not null references arbolado.ruta(id),
  nro_reclamo_sua text not null, anio smallint not null,
  orden_visita smallint not null,
  hora_estimada_llegada timestamptz not null,
  orden_forzado boolean not null default false,
  visitado boolean not null default false,
  visitado_en timestamptz,
  unique (ruta_id, orden_visita)
);

-- Consolidación previa a la purga (D-56). Se escribe al CERRAR la jornada.
create table arbolado.ruta_resumen (
  ruta_id uuid primary key references arbolado.ruta(id),
  usuario_id uuid not null references arbolado.perfil(usuario_id),
  fecha date not null,
  casos_visitados smallint not null,
  casos_no_visitados smallint not null,
  kilometros numeric(7,2),
  minutos_traslado integer not null,
  minutos_dictaminacion integer not null,
  eficiencia_pct numeric(5,2) not null,
  directiva_aplicada uuid,
  consolidado_en timestamptz not null default now()
);

create index ix_detalle_ruta_purga on arbolado.detalle_ruta (ruta_id);

create table arbolado.perfil_distribucion (
  id serial primary key,
  nombre text not null,
  porcentajes jsonb not null,
  global boolean not null default false,
  creado_por uuid references arbolado.perfil(usuario_id)
);

```

### La retención de rutas es una consolidación, no un borrado (D-56)

| Dato | Dónde vive | Retención |
| --- | --- | --- |
| Horarios de cada parada y geometría | `detalle_ruta`, `ruta.geometria` | **90 días** |
| Casos, kilómetros, eficiencia | `ruta_resumen` | Indefinido |
| Qué casos entraron y bajo qué directiva | `jornada`, `ruta_resumen` | Indefinido |

**El orden importa y por eso `ruta_resumen` se escribe al cerrar la jornada, no al purgar.** La eficiencia se calcula a partir de los horarios de parada: si el trabajo de purga borrara primero y consolidara después, no habría con qué consolidar. Escribirlo en el cierre además garantiza que el resumen exista aunque la purga nunca llegue a correr.

**El argumento, para la defensa:** *se conserva el dato que justifica una decisión administrativa y se destruye el que solo serviría para vigilar a un empleado.* Pasados los 90 días no se pierde ni el porqué ni el rendimiento — se pierde a qué hora estuvo el ingeniero en cada esquina, que es exactamente el dato que no conviene tener guardado.

```sql
create table arbolado.directiva_jornada (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  ambito arbolado.ambito_directiva not null,
  ambito_valor text,
  zona_distrito arbolado.distrito, zona_barrio text,
  categorias arbolado.categoria[],
  distribucion_prioridad jsonb,
  protocolo text not null default 'normal' check (protocolo in ('normal','tormenta')),
  cantidad_casos smallint, horas_jornada numeric(4,2),
  modo_traslado arbolado.modo_traslado,
  antiguedad_minima_meses smallint,
  obligatoria boolean not null default false,
  vigencia_desde date not null, vigencia_hasta date not null,
  creada_por uuid not null references arbolado.perfil(usuario_id),
  activa boolean not null default true,
  constraint ck_vigencia check (vigencia_hasta >= vigencia_desde)
);

create index ix_directiva_vigente on arbolado.directiva_jornada (vigencia_desde, vigencia_hasta)
  where activa;
```

**`geometria` se guarda, no se recalcula.** Pedido explícito de la minuta: *"el mapa va a tener que quedar igual hasta que se oprima un botón de restablecer"*. Si el front recalculara en cada render, el mapa cambiaría solo. Persistirla lo vuelve imposible por diseño.

**`directiva_aplicada` en la jornada** responde una pregunta que aparece dos meses después: por qué se dictaminaron esos casos y no otros. Sin ese dato, la respuesta depende de la memoria de alguien.

**La vigencia con fecha de fin hace que la directiva caduque sola**: nadie tiene que acordarse de apagarla el lunes.

---

## 9. Configuración, firma y auditoría

```sql
create table arbolado.parametro (
  clave text primary key,
  valor text not null,
  descripcion text not null,
  modificado_por uuid references arbolado.perfil(usuario_id),
  modificado_en timestamptz not null default now()
);

create table arbolado.config_firma (
  version serial primary key,
  roles_habilitados arbolado.rol[] not null default '{operario,jefe}',
  exige_certificacion boolean not null default false,
  adaptador_certificadora text,
  algoritmo_hash text not null default 'SHA-256',
  leyenda_pie text not null,
  datos_sellados text[] not null default '{nombre,legajo,rol,fecha,hash}',
  modificada_por uuid references arbolado.perfil(usuario_id),
  modificada_en timestamptz not null default now()
);

create table arbolado.auditoria (
  id bigserial primary key,
  accion text not null,
  usuario_id uuid references arbolado.perfil(usuario_id),
  entidad text, entidad_id text,
  antes jsonb, despues jsonb,
  origen_ip inet, agente text,
  ocurrido_en timestamptz not null default now()
);

create index ix_auditoria_fecha on arbolado.auditoria (ocurrido_en desc);
create index ix_auditoria_accion on arbolado.auditoria (accion, ocurrido_en desc);

create table arbolado.idempotencia (
  clave text primary key,
  usuario_id uuid not null,
  endpoint text not null,
  respuesta jsonb not null,
  creada_en timestamptz not null default now()
);

-- La purga de los 30 días se apoya en este índice (H-11)
create index ix_idempotencia_creada on arbolado.idempotencia (creada_en);

create table arbolado.concesionaria (          -- D-54. SIN cuenta, SIN rol, SIN acceso
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  contacto text,
  zona_adjudicada arbolado.distrito,
  tipo_trabajo_adjudicado text,
  activa boolean not null default true
);

create table arbolado.entregable_concesionaria (
  id uuid primary key default gen_random_uuid(),
  concesionaria_id uuid not null references arbolado.concesionaria(id),
  generado_por uuid not null references arbolado.perfil(usuario_id),
  generado_en timestamptz not null default now(),
  filtros jsonb not null,
  paquetes jsonb not null,                     -- acción, complejidad y cuántos ejemplares
  dictamenes_incluidos uuid[] not null,
  archivo_ref text[] not null,                 -- un PDF por paquete
  tiene_anulaciones boolean not null default false
);

create index ix_entregable_dictamenes
  on arbolado.entregable_concesionaria using gin (dictamenes_incluidos);
```

**`arbolado.concesionaria` no tiene usuario, ni rol, ni política de acceso.** Existe solo para poder registrar **a quién** se le informó. Es la corrección de una inconsistencia que el diseño ya tenía escrita: prometía poder contestar *qué se le informó a una contratista y cuándo* y la tabla no guardaba el destinatario.

**`ix_entregable_dictamenes` es un índice GIN sobre el arreglo**, y existe por una sola consulta: al anular un dictamen hay que preguntar *"¿este salió en algún entregable?"* en tiempo constante. Si sale, se enciende `tiene_anulaciones` y el panel muestra **a qué empresa hay que notificar**. El sistema no puede des-enviar un PDF; lo que no hace es dejarlo pasar en silencio, porque del otro lado hay una autorización de extracción que ya no vale.

### `config_firma` es versionada, y eso no es un detalle

Un dictamen firmado en marzo **se defiende con las reglas de firma de marzo**, no con las de hoy. Guardar `config_firma_version` en cada dictamen es lo que permite explicar, dos años después, bajo qué configuración se firmó ese documento.

Cada cambio en el panel inserta una fila nueva; ninguna se actualiza. Es un registro histórico, no una tabla de configuración mutable.

### Valores iniciales de `parametro`

| Clave | Valor inicial | Fundamento |
| --- | --- | --- |
| `minutos_por_dictamen` | 10 | RF-21. El front usa 7 y hay que corregirlo (DV-02) |
| `dias_escalamiento_defecto` | 60 | Dos meses (minuta) |
| `dias_escalamiento_riesgo` | 30 | D-22 |
| `dias_escalamiento_poda` | 90 | D-22 |
| `meses_vencimiento_dictamen` | 18 | RF-19 |
| `dias_aviso_vencimiento` | 30 | RF-05 |
| `dias_ventana_tormenta` | 3 | RF-28 |
| `ttl_reserva` | cierre de jornada (20:00) | D-15 |
| `adaptador_ruteo` | `osrm` | RF-32 — se cambia a `google` sin desplegar |
| `adaptador_geocodificacion` | `nominatim` | B-02 |
| `origen_rutas_direccion` | **Moreno 2350, Rosario** | RF-22 (A-02) |
| `origen_rutas_lat` / `_lng` | geocodificadas y **verificadas a ojo** | RF-22 |
| `anios_selector_reclamo` | año en curso y los 10 anteriores | RF-12 (A-08) |
| `sugerencia_complejidad_activa` | se enciende al cargar cortes | RF-15 (D-49) |
| `autocompletado_categoria_activo` | `true` | D-52 |
| `autocompletado_especie_activo` | `true` | D-52 |
| `regla_senales_riesgo_activa` | `true` | D-21, desactivable |
| `dias_retencion_detalle_ruta` | 90 | D-56 — el resumen se conserva indefinidamente |
| `dias_borrador_inactivo` | 30 | D-57 — pasa a inactivo, **nunca se borra solo** |
| `dias_purga_idempotencia` | 30 | H-11 |
| `horas_discrepancia_reloj_grave` | 24 | D-67 |
| `horas_aviso_cola_pendiente` | 48 | D-58 |
| `max_fotos_dictamen` | 6 | RF-17 — acota el peso de la cola |
| `kb_max_foto` | 400 | Condición de campo, no de costo |
| `minutos_espera_recalculo_ruta` | 2 | H-12 — evita castigar al servicio de ruteo |

---

## 10. Seguridad a nivel de fila

**Ninguna tabla sin política.** El rol se valida en la Edge Function **y** en la base. Es redundante a propósito: si un token se filtra o alguien expone la base, RLS sigue conteniendo.

```sql
alter table arbolado.dictamen enable row level security;
-- … y así en todas.

create or replace function arbolado.rol_actual() returns arbolado.rol
language sql stable as $$
  select rol from arbolado.perfil where usuario_id = auth.uid() and activo
$$;
```

| Tabla | Lector | Operario | Jefe | Administrador |
| --- | --- | --- | --- | --- |
| `sua_sim.reclamo` | — | lee los derivados a Arbolado | idem | lee todo |
| `reclamo_estado` | lee agregados | lee | lee y ajusta | lee y ajusta |
| `reclamo_geo` | — | lee; corrige el punto de lo reservado | idem | escribe |
| `perfil` | lee el propio | lee el propio | lee los del equipo | administra todos |
| `reserva` | — | crea y libera **las propias**; ve las ajenas en solo lectura | ve todas; libera cualquiera | libera cualquiera |
| `dictamen` | — | crea y firma; **nunca** actualiza ni borra | idem | lee todo; puede anular. **No crea ni firma** |
| `jornada` / `ruta` / `detalle_ruta` | — | solo las propias | lee las del equipo | lee todas |
| `directiva_jornada` | — | lee la que le aplica | **escribe** | escribe |
| `config_firma` | — | lee | lee | **escribe** |
| `regla_prioridad` / `regla_complejidad` | — | lee | lee | escribe |
| `parametro` | — | lee | lee | escribe |
| `dictamen_foto` / `reclamo_foto` | — | crea y sube las propias | idem | lee todo |
| `dictamen_borrador` | — | los propios | los propios | lee todo |
| `captor` | — | lee el propio | lee los del equipo | administra todos |
| `operacion_cuarentena` | — | — | — | **exclusivo**: lee y resuelve |
| `certificacion_intento` | — | — | lee | lee y fuerza reintento |
| `concesionaria` / `entregable_concesionaria` | — | — | — | **exclusivo** |
| `ruta_resumen` | lee agregados | los propios | los del equipo | lee todo |
| `auditoria` | — | — | — | lee. **Nadie escribe directo** |

Ejemplo de política, la más importante:

```sql
create policy dictamen_insert_solo_roles_de_campo on arbolado.dictamen
  for insert to authenticated
  with check (
    arbolado.rol_actual() = any (
      select unnest(roles_habilitados) from arbolado.config_firma
      order by version desc limit 1)
    and usuario_id = auth.uid()
    and exists (
      select 1 from arbolado.reserva r
      where r.nro_reclamo_sua = nro_reclamo_sua and r.anio = anio
        and r.usuario_id = auth.uid() and r.liberada_en is null)
  );
```

Esa política sola dice tres cosas del negocio: **firma quien el panel habilita**, **nadie firma a nombre de otro**, y **no se dictamina lo que no está reservado a nombre propio**. Aunque alguien le pegue directo a la API con un token válido de Lector o de Administrador, la base rechaza.

**Las tablas nuevas del blindaje son exclusivas del Administrador y eso es deliberado.** `operacion_cuarentena` guarda dictámenes que llegaron desde un equipo dado de baja: si un Operario pudiera liberarlos, la baja del captor dejaría de ser un control. Y `concesionaria` es exclusiva porque derivar trabajo a un tercero es un acto administrativo, no una tarea de campo.

---

## 11. Migraciones

Archivos `NNNN_descripcion.sql` en `backend/db/migraciones/`, aplicados en orden y **nunca editados una vez aplicados**:

| # | Contenido |
| --- | --- |
| `0001` | Esquemas `sua_sim` y `arbolado`, extensiones |
| `0002` | Tipos enumerados |
| `0003` | `sua_sim.reclamo` e índices |
| `0004` | `arbolado.perfil` |
| `0005` | `reclamo_estado`, `reclamo_geo`, reglas, historial |
| `0006` | **`captor`**, y recién después `reserva` con blindaje y su índice único parcial |
| `0007` | `dictamen`, `dictamen_foto`, `reclamo_foto`, borradores, `certificacion_intento`, trigger de inmutabilidad |
| `0008` | Jornadas, rutas, `detalle_ruta`, **`ruta_resumen`**, distribuciones, directivas |
| `0009` | Parámetros, `config_firma`, auditoría, idempotencia, **`concesionaria`**, entregables, **`operacion_cuarentena`** |
| `0010` | Políticas RLS de todas las tablas |
| `0011` | Trabajos programados (T9), incluida la purga de idempotencia |
| `0012` | Valores iniciales de parámetros, reglas de prioridad **provisorias** (D-59) y captores de prueba |

> **`captor` va antes que `reserva` en `0006`, y el orden no es cosmético**: `reserva.captor_id` es una clave foránea contra `captor`. Al revés, la migración falla. En este documento el DDL de `captor` está escrito después por claridad de lectura, no por orden de aplicación.

Corregir una migración aplicada se hace con **una migración nueva**. Editar la vieja deja bases distintas según cuándo se clonó el repositorio, que es el problema que las migraciones existen para evitar.
