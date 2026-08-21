# CLAUDE.md

Contexto del proyecto para trabajar en este directorio. Se responde en **español rioplatense**.

## Qué es esto

**Sistema de Dictaminado y Rutas Eficientes** para la **Dirección Técnica de Arbolado** (Dirección General de Parques y Paseos, Municipalidad de Rosario).

Trabajo final de **Práctica Profesionalizante II** — Tecnicatura Superior en Análisis Funcional de Sistemas, Terciario Urquiza.
Equipo: Boubonis (Gabriel), Maschio (Alejandro), Pizzicatti (Gianluca), **Villega (Lucas — quien usa este entorno)**. Docente: Pedernera.

Lucas trabaja sobre la rama **`VillegaBackBranch`** del repo <https://github.com/GabrielBoubonis/Direccion-Tecnica-de-Arbolado> (backend / servicios).

## El problema real

Los ingenieros agrónomos hoy emiten el dictamen técnico **en papel**. El papel viaja a Procesamiento de Datos, que lo transcribe a mano al **SUA** (Sistema Único de Atención Ciudadana, el sistema macro de toda la Municipalidad). Eso genera demoras, errores de carga y expedientes con más de 3 años de atraso. Ninguna cuadrilla puede intervenir un árbol sin dictamen firmado (Ordenanza 5.118, Ley Prov. 13.836).

El sistema ataca tres cuellos de botella: despapelización del dictamen, priorización objetiva de reclamos y planificación de rutas de campo.

## Restricción que define toda la arquitectura

**El equipo no tiene permisos sobre el SUA ni sobre la autenticación institucional, y la conexión real no se va a realizar nunca.** Supabase (base, auth, storage) es andamio: **se va entero** el día hipotético de la transferencia.

Por eso **todo acceso a datos vive detrás de un puerto**, no solo los dos que menciona el documento académico. Son catorce: reclamos, auth, dictámenes, rutas, reservas, perfiles, storage, ruteo, geocodificación, parámetros, auditoría, reloj, captores y certificación de firma. El detalle está en `docs-back/01-arquitectura.md`.

Pasar a producción debe ser **cambiar la implementación concreta del adaptador, sin tocar el núcleo** (RNF-08, RF-32). Toda lógica de negocio queda de este lado de la interfaz, nunca acoplada al proveedor.

## Documentación

Todo está convertido a Markdown en `docs/` — **leer de ahí, no de los `.docx`**:

- `docs/00-indice.md` — índice
- `docs/01-documentacion-tecnica.md` — RF-01→RF-32, RNF-01→RNF-13, HU-01→HU-14, CU-01→CU-09, MER, arquitectura
- `docs/02-minuta-relevamiento.md` — relevamiento, matriz de prioridad y pedidos del cliente
- `docs/03-diagramas.md` — fuente PlantUML de los 8 diagramas
- `docs/04-estado-del-codigo.md` — **estado real de la rama y brechas contra los RF**

Los `.docx` y `.svg` de la raíz son los entregables académicos; los `.md` son la copia legible. Si cambia un requerimiento, actualizar el `.md` y avisar que el `.docx` quedó desfasado.

Al citar una decisión, referenciar el ID (`RF-14`, `RNF-08`, `CU-04`, `HU-08`) — es el vocabulario que usa el profesor y el resto del equipo.

## Reglas de negocio que no se negocian

- **Alcance de entrada**: solo solicitudes del SUA con Tipo `Reclamo` / Subtipo `Problemas con el arbolado público`. Nada más.
- **Clave de un reclamo**: el par **(N° SUA, año)**, dos campos separados — se elige el año y se busca el número dentro de ese año. Es el primer paso obligatorio del dictamen (RF-12): si no existe o ya está dictaminado, no se puede continuar.
- **Prioridad por colores**: verde (baja) → amarillo (media) → naranja (alta) → rojo (urgente). Arranca en **verde por defecto** y sube por señales de riesgo en el texto del vecino (regla desactivable) o por **insistencia** (varios reclamos sobre el mismo árbol). Después escala sola con el tiempo, y el ritmo **depende de la categoría**: 30 días para riesgo estructural y cableado, 60 por defecto, 90 para poda estética. Rojo se queda en rojo (RF-11).
- **Se toma con señal, se ejecuta sin señal**: no se dictamina un reclamo que no esté reservado a nombre del ingeniero. Tomar trabajo exige conexión; cargar y firmar el dictamen, no. La reserva es visible para todo el equipo y vence al cierre de la jornada.
- **La jornada se pre-confirma**: el ingeniero define horas o casos, **el sistema reserva ahí mismo**, y recién después aparece la pantalla donde ajusta sin apuro (corregir puntos del mapa, sacar casos, corregir categoría) antes de confirmar y salir. Es el último momento con señal garantizada, y donde se precarga todo lo offline.
- **Al vencer el dictamen a los 18 meses**, el reclamo **vuelve a la cola** para re-dictaminar, con el dictamen viejo consultable.
- **Intervenciones mutuamente excluyentes** (RF-14): extracción bloquea poda y corte de raíces, y viceversa. No se puede confirmar el dictamen con la combinación inconsistente.
- **Firma digital** (RF-18): **firmar es atributo del rol** — firman Operario y Jefe, los dos que van a la calle. El Administrador **no firma**: es personal del CIL, configura la firma pero no la ejerce. Se cayeron la matrícula y la habilitación individual (D-50), y **eso contradice RF-02, RF-18 y RF-19 tal como están escritos**: está documentado en `docs-back/99-desvios.md` (DV-10). Lo que se configura en un solo lugar es *cómo* firma el sistema, no quién: el apartado `config_firma` (roles, certificadora, hash, leyenda del pie). Al firmar, el dictamen queda en **solo lectura**, con sello de tiempo, legajo, rol, versión de configuración y hash (RF-19, RNF-06).
- **Vencimiento del dictamen: 18 meses** desde la emisión (RF-19). El dashboard avisa los que vencen en ≤30 días (RF-05).
- **Al firmar, el reclamo pasa a `dictaminado`** vía el adaptador (RF-20).
- **Rutas** (RF-21→RF-27): parten de Parques y Paseos (**Moreno 2350**) y **vuelven** ahí. **10 minutos por dictamen, configurable** (RNF-09). Modos: auto, a pie, bicicleta. El balanceador reparte la jornada por porcentaje de prioridad, con modos `urgentes primero` / `por porcentaje del jefe` / `automático equilibrado`, y **redistribuye si falta stock** de una prioridad (RF-25).
- **Protocolo de tormenta** (RF-28→RF-30): sección visible **solo si hay casos** etiquetados, últimos 3 días, **todos con la misma prioridad** (no aplica balanceador), ruta de mínima distancia.
- **Roles**: Lector (consulta ejecutiva del dashboard), Operario (todo lo operativo, firma), Jefe (operario + ve el trabajo del equipo y baja las directivas de jornada), Administrador (personal del CIL: usuarios, roles, adaptadores, parámetros, configuración de firma digital y el entregable para concesionarias — **no dictamina ni firma**). **Las concesionarias no son usuarias del sistema**: reciben un export que solo genera el Administrador.
- **El ingeniero sí puede abrir reclamos**, en tres situaciones: de oficio, a pedido de un vecino que lo aborda en la calle, y durante el protocolo de tormenta. Se crean **a través de `IReclamoProvider`** para que entren al circuito formal del SUA, no como reclamo paralelo — esa es la justificación que pedía la minuta del 12/08.

### Pedidos del cliente (minuta 12/08) que suelen olvidarse

- El **mapa de la ruta no se reinicia** al cargar un dictamen. Solo se limpia con un botón explícito de "restablecer" — el ingeniero lo sigue toda la jornada.
- Filtrar reclamos **por distrito** en el listado y en el dashboard.
- Botón de **consulta de reclamo por dirección**.
- El dictamen debe tener **todos** los campos del formulario físico actual, incluido trabajo en raíces y la opción "sin trabajo".

## El código

**El front es `ArboladoRosario/index.html` + `login.html`**: prototipo estático responsive con Leaflet, OSRM y signature_pad, hoy funcionando con un objeto `DB` simulado en memoria. Es la demo que se le mostró al profesor. **No se pisa**: mantiene su aspecto y su comportamiento visible, y lo único que cambia es que el `DB` mock se reemplaza por llamadas al SDK contra la API.

La app **Expo / React Native** (`app/`, `services/`) con Firebase quedó **fuera del alcance** (D-01). Es código muerto que contradice la documentación; qué hacer con él es la pregunta abierta P-12.

Lógica que se migra del front al backend, sin cambiar lo que se ve: escalamiento de prioridades, balanceador, cálculo de ruta, validación del par (SUA, año) y sugerencia de época. Las validaciones de exclusión se **duplican**: el front valida por comodidad, el backend valida por obligación.

### Tensiones ya resueltas

Firebase vs Supabase, y Expo vs web: resueltas a favor de **Supabase + prototipo estático**. Lo que queda abierto está en la tabla de preguntas del protocolo. Las brechas contra los RF están en `docs/04-estado-del-codigo.md`, y los desvíos respecto del `.docx` en `docs-back/99-desvios.md`.

## Cómo trabajar acá

- Confirmar en qué rama se está antes de commitear. La rama de Lucas es `VillegaBackBranch`; `main` es compartida.
- Si un cambio de código contradice un RF, decirlo explícitamente en vez de adaptar el requerimiento en silencio.
- Este es un trabajo académico con defensa oral: cada decisión técnica tiene que poder justificarse contra el relevamiento y la normativa, no solo funcionar.

## Trabajo de backend (rama `VillegaBackBranch`)

**Antes de tocar nada, leer `docs-back/00-protocolo-de-trabajo.md`.** Es un documento vivo con la definición de terminado, las decisiones cerradas y las preguntas abiertas.

Lo esencial:

- **Lucas define el qué, Claude el cómo.** Lucas es analista funcional. Las preguntas se le hacen en términos de comportamiento observable ("cuando el ingeniero está sin señal, ¿qué ve?"), nunca de mecanismo interno. El mecanismo se decide y se documenta.
- **Fase actual: diseño.** No se escribe código de producción hasta que el diseño esté aprobado.
- **Sin driver verde no está terminado.** Cada entregable se verifica en vivo contra el proyecto Supabase real y se muestra la salida.
- **No existe trabajo sin documentar.** README y documento de diseño se actualizan en el mismo commit que el cambio.
- **Siempre commit**, uno por entregable, con el RF referenciado.
- **La tecnología termina en los adaptadores.** Ni un `import` de un proveedor fuera de `adapters/`. Supabase se va entero el día de la transferencia, así que todo acceso a datos va detrás de un puerto.
- **El front no se pisa.** `ArboladoRosario/index.html` y `login.html` mantienen su comportamiento visible; se les migra lógica al backend.
- **Nunca commitear**: `service_role` key, password de la base, `.env` reales, tokens, keys con facturación. Si filtrarlo obliga a rotar una credencial, no va al repo.
- **Datos de vecinos: solo inventados.** Nunca PII real, ni siquiera anonimizada.

Proyecto Supabase: `arbolado-rosario` — ref `igflkzpfpvklhinycyup`, región `sa-east-1`.
