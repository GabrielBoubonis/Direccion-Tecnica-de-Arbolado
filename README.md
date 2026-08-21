# Sistema de Dictaminado y Rutas Eficientes

Aplicación web responsive para la **Dirección Técnica de Arbolado** de la Dirección General de Parques y Paseos, Municipalidad de Rosario.

Permite al ingeniero agrónomo emitir el dictamen técnico **desde el celular, frente al árbol**, planificar rutas de inspección eficientes y responder al protocolo de tormenta, eliminando el circuito actual de papel → transcripción manual → SUA.

Trabajo final de **Práctica Profesionalizante II** — Tecnicatura Superior en Análisis Funcional de Sistemas, Terciario Urquiza, Rosario.

---

## Estado del proyecto

| Componente | Estado |
| --- | --- |
| Documentación técnica y relevamiento | Completa |
| Front (prototipo estático responsive) | Funcional con datos simulados en memoria |
| Backend, base de datos y adaptadores | **Diseño funcional y técnico completos** — pendiente de aprobación, sin código todavía |

El backend está en **fase de diseño**. No hay código de producción escrito, y no lo habrá hasta que el diseño esté aprobado. Ver [`docs-back/00-protocolo-de-trabajo.md`](docs-back/00-protocolo-de-trabajo.md).

---

## El problema

Hoy los dictámenes se emiten **en papel**. El papel viaja a Procesamiento de Datos, que lo transcribe a mano al **SUA** (Sistema Único de Atención Ciudadana, la plataforma transversal de la Municipalidad). Eso produce demoras, errores de carga, duplicación de tareas y expedientes con más de tres años de atraso.

Ninguna cuadrilla puede intervenir un ejemplar sin dictamen técnico firmado (Ordenanza Municipal 5.118, Ley Provincial 13.836), así que el dictamen es el cuello de botella de todo el circuito.

## La restricción que define la arquitectura

El equipo **no tiene permisos** sobre el SUA ni sobre la autenticación institucional, y la conexión real **no se va a realizar**: es un proyecto académico. Por eso todo lo que hoy resuelve Supabase —base de datos, autenticación, storage— es **andamio reemplazable**, no parte del sistema.

Cada acceso a datos vive detrás de un **puerto**. El día hipotético de la transferencia a la Municipalidad, se cambia la implementación concreta del adaptador y el núcleo de la aplicación queda intacto (RNF-08, RF-32).

| Puerto | Implementación hoy | El día de la muni |
| --- | --- | --- |
| `IReclamoProvider` | tabla simulada en Supabase | endpoints del SUA |
| `IAuthProvider` | Supabase Auth | directorio institucional |
| `IDictamenRepository` | Postgres de Supabase | base de la Municipalidad |
| `IRutaRepository` | Postgres de Supabase | base de la Municipalidad |
| `IReservaRepository` | Postgres de Supabase | base de la Municipalidad |
| `IPerfilRepository` | Postgres de Supabase | directorio institucional |
| `IParametroRepository` | Postgres de Supabase | base de la Municipalidad |
| `IAuditoriaRepository` | Postgres de Supabase | base de la Municipalidad |
| `IRelojProvider` | reloj del sistema | reloj del sistema |
| `IArchivoStorage` | Supabase Storage | file server municipal |
| `IRuteoProvider` | OSRM público (activo) | Google Routes (escrito, sin conectar) |
| `ICertificadoraFirma` | placeholder, sin implementar | firma digital oficial |

> **Regla de oro:** la tecnología termina en los adaptadores. Ni un `import` de un proveedor fuera de `adapters/`.

La frontera se ve también en la base: el esquema `sua_sim` contiene lo que el SUA nos daría y **se borra entero** el día de la transferencia; el esquema `arbolado` contiene lo propio del módulo y migra.

## Principio de campo

> **El trabajo se toma con señal y se ejecuta sin señal.**

Un reclamo apunta a un único árbol, así que dos ingenieros dictaminando el mismo ejemplar no es un conflicto a resolver: es trabajo desperdiciado que hay que evitar antes de que ocurra. Pedir trabajo es, por naturaleza, una acción conectada — el ingeniero le pide al sistema qué hacer. Entonces la asignación se reserva en ese momento, y todo lo que sigue funciona sin conexión sobre reclamos que nadie más puede tener.

Detalle en [`docs-back/01-arquitectura.md`](docs-back/01-arquitectura.md).

---

## Estructura del repositorio

```
.
├── ArboladoRosario/       Front. NO se pisa.
│   ├── index.html         Aplicación (dashboard, reclamos, dictamen, rutas, tormenta)
│   └── login.html         Pantalla de acceso
├── docs/                  Documentación académica en Markdown
│   ├── 01-documentacion-tecnica.md   RF, RNF, HU, CU, MER, arquitectura
│   ├── 02-minuta-relevamiento.md     Relevamiento y pedidos del cliente
│   ├── 03-diagramas.md               Fuente PlantUML de los 8 diagramas
│   └── 04-estado-del-codigo.md       Estado real y brechas contra los RF
├── docs-back/             Diseño del backend
│   ├── 00-protocolo-de-trabajo.md    Cómo trabajamos. Leer primero.
│   ├── 01-arquitectura.md            Puertos, adaptadores y principio de campo
│   ├── 02-modelo-de-datos.md         Esquemas, entidades, RLS y storage
│   ├── 03-reglas-de-negocio.md       Prioridad, escalamiento, firma, balanceador, directivas
│   ├── 04-contrato-api.md            La frontera estable que ve el front
│   ├── 05-entregable-visual.md       Plan del entregable académico por hitos
│   ├── 06-offline-y-sincronizacion.md  Trabajo de campo sin señal
│   ├── 07-seguridad-y-privacidad.md  Datos personales, integridad y secretos
│   ├── 08-datos-semilla-y-driver.md  Seed reproducible y escenarios de verificación
│   ├── 09-decisiones-20260820.md     Auditoría del trabajo sin conexión: D-54 a D-67
│   ├── 10-auditoria-previa-al-desarrollo.md  Los 8 ejes de la auditoría que habilita codear
│   ├── 11-decisiones-20260821.md     Los caminos alternativos: D-68 a D-92, RF-37 y RF-38
│   ├── 12-contrato-front.md          PARA ALE: qué tiene que tener el front y con qué forma llegan los datos
│   ├── 99-desvios.md                 Qué hacemos distinto del .docx y por qué
│   └── tecnico/                      EL CÓMO: diseño técnico completo
│       ├── T0-indice.md                  Mapa de la carpeta y cómo leerla
│       ├── T1-estructura-y-convenciones.md  Carpetas, nombres, errores, config, tiempos
│       ├── T2-puertos.md                 Las 14 interfaces con su firma exacta
│       ├── T3-nucleo-dominio.md          Entidades y funciones puras del negocio
│       ├── T4-casos-de-uso.md            Cada operación paso a paso
│       ├── T5-esquema-sql.md             DDL completo, índices, triggers y RLS
│       ├── T6-api-http.md                Endpoints con petición y respuesta reales
│       ├── T7-ruteo-y-geocodificacion.md Ruta, balanceador y punto en el mapa
│       ├── T8-offline.md                 Service Worker, cola durable y precarga
│       ├── T9-jobs-y-reloj.md            Trabajos programados y reloj inyectable
│       ├── T10-seguridad-tecnica.md      Token, RLS, storage, auditoría, retención
│       ├── T11-driver-de-escenarios.md   El verificador ejecutable en la defensa
│       ├── T12-integracion-del-front.md  Del mock al SDK + catálogo de cambios del front
│       └── T13-plan-de-implementacion.md Orden de construcción y datos semilla
└── CLAUDE.md              Contexto del proyecto y reglas de negocio
```

**`docs-back/` responde el qué y el porqué; `docs-back/tecnico/` responde el cómo.** Cada documento técnico se puede leer solo, así que se repiten definiciones entre ellos a propósito: quien implemente rutas no debería tener que leer los catorce archivos para saber qué recibe y qué devuelve.

Cuando arranque la Fase 2 se suman `backend/` (núcleo, casos de uso y adaptadores), `supabase/` (migraciones, políticas RLS y seeds) y `driver/` (escenarios de verificación).

---

## Reglas de negocio que no se negocian

- **Alcance de entrada**: solo solicitudes del SUA con Tipo `Reclamo` / Subtipo `Problemas con el arbolado público`.
- **Clave de un reclamo**: el par **(N° SUA, año)**. Es el primer paso obligatorio del dictamen (RF-12).
- **Prioridad por colores**: verde → amarillo → naranja → rojo. Arranca en verde y sube por señales de riesgo en el texto o por insistencia del vecino; después escala sola con el tiempo, más rápido en las categorías de riesgo (RF-11).
- **Intervenciones excluyentes** (RF-14): extracción bloquea poda y corte de raíces, y viceversa.
- **Firma digital** (RF-18): **firmar es atributo del rol** — firman Operario y Jefe, los dos que van a la calle. El Administrador es personal del CIL: configura la firma pero no la ejerce. Al firmar, el dictamen queda inmutable, con sello de tiempo, legajo, rol y hash (RF-19, RNF-06). Contradice RF-02, RF-18 y RF-19 como están escritos, y está documentado en `docs-back/99-desvios.md` (DV-10).
- **Vencimiento del dictamen**: 18 meses desde la emisión.
- **Rutas** (RF-21→27): parten y vuelven a Parques y Paseos, con tiempo por dictamen configurable y balanceador de prioridades.
- **Protocolo de tormenta** (RF-28→30): visible solo si hay casos, últimos 3 días, todos con la misma prioridad.
- **Roles**: Lector (consulta ejecutiva del dashboard), Operario (operativo, firma), Jefe (operario + ve el trabajo del equipo y baja directivas), Administrador (personal del CIL: usuarios, roles, adaptadores, parámetros y firma digital; no dictamina ni firma). Las concesionarias no son usuarias: reciben un export que solo genera el Administrador.
- **Bajadas de línea**: el Jefe y el Administrador bajan directivas de jornada que restringen zona, categoría, prioridad, protocolo, volumen y traslado, con vigencia que caduca sola (RF-24 ampliado).
- **La jornada se pre-confirma**: el ingeniero define horas o casos, **el sistema reserva ahí mismo**, y recién después ajusta sin apuro —corregir puntos del mapa, sacar casos, corregir categoría— antes de confirmar y salir. Reservar primero es lo que vuelve gratis la revisión.
- **El SUA no tiene coordenadas**: solo la dirección escrita del ejemplar. Geocodificar es trabajo del módulo, con precisión declarada y punto corregible por el ingeniero.

Detalle completo en [`docs/01-documentacion-tecnica.md`](docs/01-documentacion-tecnica.md).

---

## Cómo trabajamos

1. **Diseño antes que código.** Ningún módulo se implementa sin su diseño aprobado.
2. **Todo entregable se verifica en vivo** con el driver de escenarios contra el proyecto Supabase real. Sin driver verde, no está terminado.
3. **No existe trabajo sin documentar.** Documentación y código en el mismo commit.
4. **Siempre commit**, uno por entregable.
5. **El front no se pisa.** Se le migra lógica al backend, pero su comportamiento visible no cambia.

El protocolo completo, con la definición de terminado y las decisiones cerradas, está en [`docs-back/00-protocolo-de-trabajo.md`](docs-back/00-protocolo-de-trabajo.md).

---

## Entregables

| Documento | Para quién |
| --- | --- |
| [`entregables/h1-dossier.html`](entregables/h1-dossier.html) | Dossier de diseño del hito 1, para el docente y el equipo |
| [`entregables/preguntas-abiertas.html`](entregables/preguntas-abiertas.html) | Las 22 preguntas por resolver, con las 16 ya respondidas y qué cambió con cada una |
| [`entregables/dossier-tecnico.html`](entregables/dossier-tecnico.html) | **El diseño técnico completo**, para entregar al docente |

Ambos se publican como página web compartible por link. Republicar el mismo archivo actualiza la misma dirección: no se genera un enlace nuevo en cada corte.

---

## Equipo

Boubonis, Gabriel · Maschio, Alejandro · Pizzicatti, Gianluca · Villega, Lucas
Docente: Pedernera, Pablo

Rama `VillegaBackBranch`: backend, base de datos y adaptadores (Lucas Villega).
