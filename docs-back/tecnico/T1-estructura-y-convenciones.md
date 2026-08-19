# T1 — Estructura del código y convenciones

> Diseño técnico · Última actualización: 19/08/2026 · Estado: **sin aprobar**
> Responde: dónde vive cada archivo, cómo se llama cada cosa, cómo se manejan errores, configuración y tiempos.

---

## 1. Runtime y decisiones de plataforma

| Decisión | Valor | Fundamento |
| --- | --- | --- |
| Runtime | **Deno**, sobre Supabase Edge Functions | D-02. Es lo que ofrece el andamio elegido |
| Lenguaje | TypeScript en modo `strict` | El dominio tiene muchos estados excluyentes; el compilador es la primera línea de defensa |
| Framework HTTP | **Ninguno** | Un router propio de unas ochenta líneas. Un framework sería una dependencia más que migrar el día de la transferencia, a cambio de nada que necesitemos |
| Dependencias | Las mínimas, declaradas en `deno.json` | Cada dependencia es deuda de migración |
| Base de datos | PostgreSQL (el de Supabase) | Se accede **solo** desde adaptadores |

### Una sola función, router adentro

Todo el backend se despliega como **una única Edge Function** llamada `api`, con un router interno que resuelve `/api/v1/...`.

La alternativa —una función por recurso— tiene tres problemas: multiplica los arranques en frío, obliga a repetir la validación del token en cada una, y hace que un despliegue deje el sistema en un estado mixto por unos segundos. Con una sola función el despliegue es atómico: o está la versión nueva entera, o está la vieja entera.

El costo es que un error de compilación tira todo, lo cual es aceptable porque el despliegue está precedido por el driver.

### Por qué el runtime también es reemplazable

Si Supabase se va, Deno se va con él. Se resuelve manteniendo el entrypoint HTTP como **cáscara fina**: parsea la petición, valida el token, llama al caso de uso, serializa la respuesta. Cero lógica de negocio. Mudar el sistema a Node, a un servidor municipal o a cualquier otro serverless es reescribir esa cáscara —unas pocas decenas de líneas— y dejar intactos núcleo y casos de uso.

---

## 2. Árbol de carpetas

```
Direccion-Tecnica-de-Arbolado/
├── ArboladoRosario/              ← el front. No se pisa (ver T12)
│   ├── index.html
│   ├── login.html
│   └── sdk/arbolado.js           ← nuevo: el cliente de la API
├── backend/                      ← todo lo nuevo vive acá
│   ├── deno.json                 ← tareas, import map, config del compilador
│   ├── .env.example              ← nombres de variables, nunca valores reales
│   ├── src/
│   │   ├── core/                 ← NO importa infraestructura. Nunca.
│   │   │   ├── dominio/          ← entidades, enums, tipos de valor
│   │   │   ├── reglas/           ← funciones puras (T3)
│   │   │   ├── puertos/          ← las trece interfaces (T2)
│   │   │   ├── casos-uso/        ← orquestación (T4)
│   │   │   └── errores/          ← ErrorDominio y catálogo de códigos
│   │   ├── adapters/             ← ÚNICO lugar con nombre de proveedor
│   │   │   ├── supabase/         ← auth, storage, repositorios Postgres
│   │   │   ├── sua-sim/          ← SuaSimuladoAdapter
│   │   │   ├── ruteo/            ← osrm.ts, google-routes.ts
│   │   │   ├── geo/              ← nominatim.ts
│   │   │   └── reloj/            ← sistema.ts, fijo.ts
│   │   ├── http/                 ← cáscara fina
│   │   │   ├── server.ts         ← entrypoint
│   │   │   ├── router.ts
│   │   │   ├── rutas/            ← un archivo por recurso
│   │   │   ├── middleware/       ← auth, errores, idempotencia, límite de intentos
│   │   │   └── dto/              ← mapeo dominio ↔ JSON
│   │   ├── composicion/          ← el único lugar que arma adaptadores concretos
│   │   │   └── contenedor.ts
│   │   └── driver/               ← el verificador (T11)
│   │       ├── runner.ts
│   │       └── escenarios/
│   ├── db/
│   │   ├── migraciones/          ← NNNN_descripcion.sql, ordenadas
│   │   └── seed/                 ← datos ficticios reproducibles
│   └── scripts/
├── docs/                         ← documentación académica en Markdown
├── docs-back/                    ← diseño funcional del backend
│   └── tecnico/                  ← este diseño técnico
└── entregables/                  ← páginas para el equipo y el docente
```

### La dependencia apunta siempre hacia adentro

```
http/  ──►  casos-uso/  ──►  reglas/ + dominio/
                │
                └──►  puertos/  ◄──  adapters/
```

`http/` conoce los casos de uso. Los casos de uso conocen las reglas y los puertos. Los adaptadores conocen los puertos. **Nadie conoce a los adaptadores excepto `composicion/`**, que es el único archivo que sabe qué implementación concreta se usa.

Cambiar de OSRM a Google Routes, o de Supabase a la base municipal, se hace en `composicion/contenedor.ts` y en ningún otro lado.

### La regla se verifica sola

Un escenario del driver recorre `src/core/**/*.ts` y falla si encuentra:

- cualquier `import` que salga de `core/`,
- cualquier `import` de una URL o de `npm:`,
- cualquier uso de `Deno.`, `fetch`, `crypto` global o `Date.now()`.

Una regla que no se verifica se rompe sola en dos semanas. Esta falla en la misma tabla `RF → PASA/FALLA` que el resto, así que romperla es tan visible como romper una regla de negocio.

---

## 3. Convenciones de nombres

| Qué | Convención | Ejemplo |
| --- | --- | --- |
| Archivos | `kebab-case.ts` | `emitir-dictamen.ts` |
| Tipos, interfaces y clases | `PascalCase` | `Dictamen`, `IReclamoProvider` |
| Funciones y variables | `camelCase` | `calcularPrioridadInicial` |
| Constantes de módulo | `MAYUSCULA_CON_GUIONES` | `MINUTOS_POR_DICTAMEN_DEFECTO` |
| Tablas y columnas SQL | `snake_case`, **en español** | `reclamo_estado`, `prioridad_vigente` |
| Enums SQL | `snake_case` singular | `prioridad`, `estado_modulo` |
| Endpoints | plural, en español | `/api/v1/reclamos` |
| Códigos de error | `MAYUSCULA_CON_GUIONES` | `RESERVA_TOMADA_POR_OTRO` |

**El dominio se nombra en español.** Un dictamen es un dictamen, no un `Report`. El sistema se va a defender ante un profesor y eventualmente a entregar a una repartición municipal: que el código hable el mismo idioma que el relevamiento hace que una discusión sobre `prioridad_vigente` sea la misma discusión en los dos lados.

La infraestructura se nombra en inglés donde ya lo está (`router`, `middleware`, `cache`), porque forzar la traducción ahí solo agrega ruido.

---

## 4. Manejo de errores

### Un solo tipo de error del dominio

```ts
// core/errores/error-dominio.ts
export type CodigoError =
  | 'NO_AUTENTICADO'          | 'ROL_SIN_PERMISO'
  | 'RECLAMO_NO_ENCONTRADO'   | 'RECLAMO_YA_DICTAMINADO'
  | 'RECLAMO_FUERA_DE_ALCANCE'| 'RESERVA_TOMADA_POR_OTRO'
  | 'SIN_RESERVA_PROPIA'      | 'RESERVA_VENCIDA'
  | 'INTERVENCIONES_EXCLUYENTES' | 'CLASIFICACION_CONTRADICTORIA'
  | 'ROL_NO_FIRMA'            | 'DICTAMEN_INMUTABLE'
  | 'DICTAMEN_DUPLICADO'      | 'DIRECTIVA_OBLIGATORIA_VIOLADA'
  | 'SIN_PUNTO_GEOGRAFICO'    | 'SIN_CASOS_DISPONIBLES'
  | 'PARAMETRO_INVALIDO'      | 'CONFLICTO_DE_VERSION'
  | 'PROVEEDOR_NO_DISPONIBLE' | 'DATOS_INVALIDOS';

export class ErrorDominio extends Error {
  constructor(
    readonly codigo: CodigoError,
    readonly mensajeUsuario: string,
    readonly detalle?: Record<string, unknown>,
  ) { super(mensajeUsuario); }
}
```

**El núcleo no conoce códigos HTTP.** Lanza `ErrorDominio` con un código estable. El borde HTTP traduce:

| Código | HTTP | Por qué |
| --- | --- | --- |
| `NO_AUTENTICADO` | 401 | |
| `ROL_SIN_PERMISO`, `ROL_NO_FIRMA` | 403 | |
| `RECLAMO_NO_ENCONTRADO` | 404 | |
| `RESERVA_TOMADA_POR_OTRO`, `DICTAMEN_DUPLICADO`, `CONFLICTO_DE_VERSION` | 409 | Es un conflicto de estado, no un error del que pide |
| `INTERVENCIONES_EXCLUYENTES`, `DATOS_INVALIDOS`, `PARAMETRO_INVALIDO` | 422 | La petición se entiende pero no es válida |
| `PROVEEDOR_NO_DISPONIBLE` | 503 | Se puede reintentar |
| cualquier otro no previsto | 500 | Se registra completo, se devuelve genérico |

### Forma única de respuesta

Todo endpoint, sin excepción, devuelve una de estas dos formas:

```jsonc
{ "ok": true,  "datos": { } }
{ "ok": false, "error": { "codigo": "RESERVA_TOMADA_POR_OTRO",
                          "mensaje": "Ese reclamo lo tomó C. Benítez a las 08:12",
                          "detalle": { "usuario": "cbenite0", "desde": "2026-08-19T08:12:00-03:00" } } }
```

El `mensaje` está escrito para que el front pueda mostrarlo tal cual, en castellano y sin tecnicismos. El `codigo` está escrito para que el front pueda decidir sin parsear texto. El `detalle` lleva lo que el front necesita para armar una pantalla útil —quién tiene la reserva, desde cuándo— en vez de obligarlo a hacer otra consulta.

### Nunca un error sin registro

Todo `500` deja una entrada de log con el código, la ruta, el usuario y el identificador de la petición. Lo que **no** se registra nunca: contraseñas, tokens, y el contenido del texto del vecino (que es dato personal, ver T10).

---

## 5. Configuración

### Tres niveles, y no se mezclan

| Nivel | Dónde vive | Ejemplos | Quién lo cambia |
| --- | --- | --- | --- |
| **Secretos** | Variables de entorno de la Edge Function | claves de servicio, URL de la base | Quien despliega |
| **Elección de adaptador** | Tabla `arbolado.parametro` | `adaptador_ruteo`, `adaptador_geocodificacion` | Administrador, sin desplegar (RF-32) |
| **Parámetros de negocio** | Tabla `arbolado.parametro` | minutos por dictamen, días de escalamiento, meses de vencimiento | Administrador, sin desplegar (RNF-09) |

Que la elección de adaptador viva en la base y no en una variable de entorno **es** RF-32, y es demostrable en vivo: se cambia `adaptador_ruteo` de `osrm` a `google` desde el panel y la siguiente ruta se calcula con el otro proveedor, sin reiniciar nada.

### Nunca al repositorio

`service_role`, contraseña de la base, `.env` reales, tokens, cualquier clave con facturación asociada. La regla es simple: *si filtrar el archivo obliga a rotar una credencial, no se commitea*. Al repositorio va `.env.example`, con los **nombres** de las variables y valores obviamente falsos.

### Caché de parámetros

Leer la tabla de parámetros en cada petición sería una consulta extra por operación. Se cachean en memoria de la función con **vencimiento de sesenta segundos**, y el endpoint que los escribe invalida el caché.

Sesenta segundos es un compromiso explícito: un cambio de parámetro tarda hasta un minuto en verse en todas las instancias. Para "minutos por dictamen" o "días de escalamiento" eso es irrelevante. Se documenta para que nadie se sorprenda en la demo si cambia un valor y no lo ve al instante.

---

## 6. Fechas, horas y zona horaria

Es una fuente clásica de errores silenciosos, así que las reglas están fijadas:

| Regla | Detalle |
| --- | --- |
| Almacenamiento | Siempre `timestamptz`. Postgres guarda en UTC |
| Transporte | Siempre ISO 8601 con desplazamiento: `2026-08-19T10:30:00-03:00` |
| Presentación | Zona `America/Argentina/Buenos_Aires`, formato `dd/mm/aaaa` |
| Fechas sin hora | Tipo `date` para vencimientos y fechas de ingreso, sin zona |
| Obtención de la hora | **Siempre** por `IRelojProvider`. Nunca `new Date()` en el núcleo (T9) |

**Dos relojes distintos, a propósito.** El dictamen guarda `fecha_dictamen` (reloj del dispositivo, es la fecha legal de emisión frente al árbol) y `fecha_recepcion` (reloj del servidor, es trazabilidad). El vencimiento a dieciocho meses cuenta desde la primera. Si `fecha_dictamen` resulta posterior a `fecha_recepcion` o anterior a la reserva, no se rechaza el dictamen: se registra la discrepancia en auditoría. Rechazar el trabajo de campo de una persona porque su celular tiene la hora mal sería peor que anotarlo.

---

## 7. Identificadores

| Entidad | Tipo de identificador | Por qué |
| --- | --- | --- |
| Reclamo | Par **(`nro_reclamo_sua`, `anio`)** | Es la clave funcional que exige RF-12, la que el ingeniero tipea frente al árbol, y son **dos campos separados** (D-41) |
| Dictamen | `uuid` **generado en el dispositivo** | Clave de idempotencia: si el celular reintenta tres veces, entra un dictamen y no tres |
| Usuario | `uuid` de la identidad emitida por `IAuthProvider`, más `identificador` visible (`gboubon0`) | El uuid es interno; el identificador es lo que se tipea (D-48) |
| Reserva, ruta, directiva | `uuid` generado en el servidor | No hay necesidad de idempotencia de cliente |

**Ningún identificador interno de Supabase sale a la API.** El front habla de reclamos por (N° SUA, año), nunca por id de fila. El día de la transferencia los ids internos cambian; los funcionales no.

---

## 8. Tareas del proyecto

Declaradas en `deno.json` para que nadie tenga que recordar comandos:

| Tarea | Qué hace |
| --- | --- |
| `deno task dev` | Levanta la API local contra el proyecto Supabase |
| `deno task check` | Compila con `strict`, corre el linter y el formateador |
| `deno task test` | Pruebas unitarias de las funciones puras del núcleo |
| `deno task driver` | Corre **todos** los escenarios contra Supabase real (T11) |
| `deno task driver -- --rf RF-18` | Corre solo los escenarios de un requerimiento |
| `deno task migrar` | Aplica las migraciones pendientes en orden |
| `deno task seed` | Regenera los datos ficticios, siempre iguales |
| `deno task desplegar` | `check` + `driver` + publicar la función |

`desplegar` corre el driver antes de publicar **por diseño**: si un escenario falla, no se despliega. Es la traducción operativa de "sin driver verde no está terminado".
