# Protocolo de trabajo — Backend Arbolado

> Documento vivo. Se actualiza cada vez que cambia una regla, en el mismo commit que el cambio.
> Última actualización: 19/08/2026 · Rama: `VillegaBackBranch`

## 0. Reparto de roles

| Quién | Rol | Decide |
| --- | --- | --- |
| Lucas Villega | Analista funcional | **El qué**: alcance, reglas de negocio, qué ve y hace el usuario, qué se defiende ante el profesor |
| Claude | Desarrollador | **El cómo**: esquema, índices, jobs, políticas, estructura del código, herramientas |

**Regla de formulación de preguntas.** Antes de preguntar algo, se chequea si la respuesta cambia algo que el usuario final percibe.

- Si **sí** cambia → se pregunta en términos observables: *"cuando el ingeniero abre la app en la calle y no tiene señal, ¿qué tiene que ver en pantalla?"*
- Si **no** cambia → se decide, se implementa y se documenta la decisión con su justificación. No se consulta el mecanismo.

Sigue vigente el "preguntame todo, no asumas" **para el qué**: alcance, reglas y comportamiento se preguntan siempre.

## 1. Fases

**Fase 1 — Diseño (actual).** No se escribe una sola línea de código de producción. Los entregables son documentos. Termina cuando Lucas aprueba el diseño completo.

**Fase 2 — Desarrollo.** Se implementa por módulos, en orden de dependencia. Ningún módulo arranca sin su diseño aprobado.

Excepción admitida en Fase 1: preparar infraestructura vacía (crear el proyecto Supabase) y escribir el driver, porque son herramientas de verificación, no producto.

## 2. Definición de terminado

Un entregable está terminado **solo si cumple los cinco puntos**:

1. Desplegado en el proyecto Supabase real (`arbolado-rosario`), no en local ni en teoría.
2. Su escenario está agregado al driver y **ejecutado en vivo**, con salida `PASA`. Se pega la salida real.
3. Documentación actualizada **en el mismo commit**: README, el documento de diseño afectado y este protocolo si cambió una regla.
4. Cero secretos en el commit.
5. Commit hecho, con el RF/RNF referenciado en el mensaje.

Si falta alguno, **no está terminado**, y se dice explícitamente cuál falta. Nunca se reporta "listo" sin driver verde y salida a la vista.

## 3. Regla de oro de la arquitectura

> **La tecnología termina en los adaptadores.**

La conexión real a la muni no se hará nunca, pero el diseño tiene que quedar a un adaptador de distancia. Supabase (base, auth, storage) es andamio y se va **entero** el día de la transferencia.

- `core/` no importa infraestructura: ni `supabase-js`, ni SDKs de proveedores, ni APIs del runtime. Solo tipos, reglas y puertos.
- `adapters/` es el **único** lugar del repo donde puede aparecer el nombre de un proveedor.
- El entrypoint HTTP es cáscara fina: parsea la request, valida el token, llama al caso de uso, serializa la respuesta. **Cero lógica de negocio.**
- El driver incluye un chequeo estructural: si aparece un import prohibido fuera de `adapters/`, falla como cualquier otro escenario.

Consecuencia práctica: el runtime (Deno / Edge Functions) también es reemplazable, porque los casos de uso no lo tocan.

## 4. Documentación

**No existe trabajo sin documentar.** Documentación y código viajan en el mismo commit; nunca "lo documento después".

- El **README** es la puerta de entrada: qué es, cómo se levanta, cómo se corre el driver, dónde está cada cosa.
- Cada decisión técnica no obvia se registra con su **por qué**, no solo con su qué.
- Si algo que hacemos **contradice** el documento académico, se anota en `99-desvios.md`: RF afectado, qué dice el documento, qué hicimos, por qué, y si hay que corregir el `.docx` antes de entregar.
- Se cita siempre por ID (`RF-14`, `RNF-08`, `CU-04`, `HU-08`): es el vocabulario del profesor y del resto del equipo.

## 5. Seguridad y privacidad

- **Nunca al repo**: `service_role` key, password de la base, `.env` reales, tokens de acceso, cualquier key con facturación asociada.
- **Sí al repo**: migraciones, políticas RLS, seeds ficticios, funciones, `.env.example`, contratos, documentación.
- Regla simple: *si filtrar el archivo obliga a rotar una credencial, no se commitea.*
- **Datos de vecinos: solo inventados.** Nunca PII real en el repositorio, ni siquiera "anonimizada": una dirección exacta ya identifica a una persona.
- Ninguna tabla sin política RLS. Mínimo privilegio: un Lector no puede leer lo que no le corresponde ni pegándole directo a la API con su token.
- Se audita: firma de dictamen, cambio de rol, cambio de parámetros del sistema, reserva y liberación de reclamos.

## 6. Git

- Rama de trabajo: `VillegaBackBranch`. `main` no se toca sin acuerdo del equipo.
- **Siempre commit**, uno por entregable (no uno por sesión).
- Formato del mensaje: `tipo(módulo): qué hace [RF-xx]`.
- **No se pisa trabajo del front.** `ArboladoRosario/index.html` y `login.html` se tocan solo cuando toque conectar, y con acuerdo previo. Sí se **migra** lógica del front al back para limpiar, dejando el comportamiento visible igual.

## 7. Bitácora de módulos

| Módulo | Diseño | Aprobado | Desarrollo | Driver verde |
| --- | --- | --- | --- | --- |
| Arquitectura y puertos | **listo** | pendiente | — | — |
| Modelo de datos y RLS | **listo** | pendiente | — | — |
| Reglas de negocio | **listo** | pendiente | — | — |
| Contrato de API | **listo** | pendiente | — | — |
| Sincronización offline | **listo** | pendiente | — | — |
| Seguridad y privacidad | **listo** | pendiente | — | — |
| Datos semilla | **listo** | pendiente | — | — |
| Autenticación y roles | — | — | — | — |
| Reclamos y filtros | — | — | — | — |
| Dictamen técnico | — | — | — | — |
| Rutas y balanceador | — | — | — | — |
| Protocolo de tormenta | — | — | — | — |
| Dashboard | — | — | — | — |
| Panel de administrador | — | — | — | — |
| Sincronización offline | — | — | — | — |
| Directivas de jornada | **listo** | pendiente | — | — |
| Geocodificación de reclamos | **listo** | pendiente | — | — |
| Entregable visual | **H1 publicado** | pendiente | — | — |
| Driver de escenarios | — | — | — | — |

## 8. Decisiones cerradas

| # | Decisión | Fecha |
| --- | --- | --- |
| D-01 | El front es `index.html` + `login.html` (prototipo estático responsive). La app Expo queda fuera del alcance | 18/08 |
| D-02 | API en Supabase Edge Functions (Deno/TS), adaptadores server-side, el front nunca toca tablas | 18/08 |
| D-03 | Proyecto Supabase dedicado `arbolado-rosario` (`igflkzpfpvklhinycyup`, sa-east-1) | 18/08 |
| D-04 | Backend en la raíz del repo, hermano de `ArboladoRosario/` | 18/08 |
| D-05 | Todo acceso a datos detrás de un puerto, no solo reclamos y auth: Supabase se va entero | 18/08 |
| D-06 | Offline de grado campo: Service Worker + Background Sync **y** cola durable en IndexedDB. iOS fuera de alcance (condición admitida) | 18/08 |
| D-07 | Reserva blanda con vencimiento configurable + índice único (n° SUA, año) como red final | 18/08 |
| D-08 | Ruteo con dos adaptadores del mismo puerto: Google Routes escrito y configurable pero sin conectar, OSRM activo para la demo | 18/08 |
| D-09 | El puerto de auth recibe un `identificador` opaco, no un "email". Usuarios de prueba con dominio reservado `@arbolado.test` | 18/08 |
| D-10 | Datos semilla 100% inventados, con calles reales de Rosario y personas ficticias | 18/08 |
| D-11 | Escalamiento de prioridad: función pura + job diario que persiste + historial auditable de cada salto | 18/08 |
| D-12 | Driver = CLI de escenarios con reporte `RF → PASA/FALLA`, ejecutable en vivo en la defensa | 18/08 |
| D-13 | Alcance del back: auth, reclamos y filtros, dictamen, rutas, tormenta, dashboard por distrito, panel admin, alta manual de reclamos y consulta por dirección | 18/08 |
| D-14 | **Se toma con señal, se ejecuta sin señal.** La reserva es requisito previo al dictamen: no se dictamina un reclamo que no esté reservado a nombre del ingeniero. El choque deja de ser el caso normal | 18/08 |
| D-15 | La reserva es visible para todo el equipo, con quién la tiene y desde cuándo. Vence sola al cierre de la jornada (configurable) | 18/08 |
| D-16 | Choque excepcional: se rechaza el segundo dictamen, se informa quién dictaminó primero y **la carga se conserva como borrador**. No se descarta trabajo de campo | 18/08 |
| D-17 | Dictamen vencido a los 18 meses: el reclamo **vuelve a la cola** como `vencido_redictaminar`, con el dictamen viejo consultable | 18/08 |
| D-18 | Alta de reclamo por el ingeniero habilitada en tres situaciones: de oficio, a pedido de un vecino en la calle, y durante el protocolo de tormenta. Se crea **a través de `IReclamoProvider`** para que entre al circuito formal, no como reclamo paralelo | 18/08 |
| D-19 | Dos esquemas en la base: `sua_sim` (se borra el día de la transferencia) y `arbolado` (migra). La frontera con el mundo externo es visible en la base | 18/08 |
| D-20 | La prioridad por colores y su escalamiento son **lógica del módulo, no del SUA**: el SUA real no tiene matriz de priorización | 18/08 |
| D-21 | Prioridad inicial: verde por defecto, con salto por señales de riesgo en el texto (**regla desactivable**) y por insistencia del vecino. Gana la más alta, nunca baja | 18/08 |
| D-22 | El **ritmo de escalamiento depende de la categoría** del reclamo: 30 días para riesgo estructural y cableado, 60 por defecto, 90 para poda estética. Todo configurable | 18/08 |
| D-23 | La matriz de priorización vive en tabla (`regla_prioridad`), no en código: se ajusta sin deploy | 18/08 |
| D-24 | Al cerrar la jornada, los reclamos no visitados **se liberan y vuelven a la cola** | 18/08 |
| D-25 | Zona de planificación = **distrito, con barrio opcional** para afinar | 18/08 |
| D-26 | Lector es rol de consulta ejecutiva (dirección/jefatura). Las **concesionarias no son usuarias**: reciben un entregable exportable que solo genera el Administrador | 18/08 |
| D-27 | **Directivas de jornada** como entidad propia: el Administrador baja línea restringiendo zona, categoría, prioridad, protocolo, volumen, traslado y antigüedad. Con ámbito, vigencia que caduca sola, y marca de obligatoria o sugerida. Se guardan como preset | 18/08 |
| D-28 | La ruta registra **bajo qué directiva se armó**, para poder explicar después por qué se dictaminaron esos casos | 18/08 |
| D-29 | **Entregable visual por progreso**: una única página web que crece por hitos (H1 diseño → H5 completo). Nunca muestra como funcionando lo que solo está diseñado | 18/08 |
| D-30 | Cada directiva se marca como **obligatoria o sugerida** al crearla: el Administrador decide caso por caso | 18/08 |
| D-31 | Se diseña para el peor caso: el SUA entrega **solo texto libre**. Si aparece un motivo categorizado, el diseño sigue sirviendo | 18/08 |
| D-32 | **Cortes académicos semanales.** Próximo: viernes 21/08/2026. H1 (diseño + entregable visual) debe estar listo antes | 18/08 |
| D-33 | La app Expo con Firebase **se eliminó de la rama** el 18/08. El front queda como `index.html` + `login.html`, autocontenidos | 18/08 |
| D-34 | El backend usa la escala de colores documentada (verde/**amarillo**/naranja/rojo). El front tiene azul en prioridad media y hay que corregirlo: es un cambio de una línea | 18/08 |
| D-35 | **Dotación real: 4 ingenieros dictaminan en campo hoy**, con intención de escalar a uno por distrito (6). La reserva sigue justificada y el seed se dimensiona para ese equipo (A-01) | 19/08 |
| D-36 | **La sede es Moreno 2350.** Origen y regreso de toda ruta (RF-22). Se geocodifica una vez, se verifica a ojo contra el mapa y queda fija en parámetros (A-02) | 19/08 |
| D-37 | **La etiqueta de tormenta no existe todavía**: la tiene que agregar el CIL en el SUA. El adaptador la lee igual, y mientras tanto la marca el Administrador sobre reclamos existentes o el ingeniero al dar de alta en campo (A-03) → DV-09 | 19/08 |
| D-38 | **El dispositivo es provisto por la Municipalidad** (le dicen *captor*) y los datos móviles los paga la repartición. Se comprimen las fotos igual —por señal mala, no por costo— y se aprovecha para precargar la jornada entera al planificar (A-04, A-05) | 19/08 |
| D-39 | **La especie se escribe a mano.** Texto libre con autocompletado y normalización contra un catálogo interno; si no matchea, no se sugiere época en vez de inventarla (A-06) → DV-14 | 19/08 |
| D-40 | **La matrícula se reemplaza por la habilitación para firmar**, con respaldo (título presentado en RRHH), fecha y administrador que la cargó. No se valida un formato que nadie sabe describir (A-07) → DV-10 | 19/08 |
| D-41 | **El número de reclamo son dos campos separados**: se elige el año y se busca el número dentro de ese año. El selector ofrece el año en curso y los diez anteriores, configurable (A-08) | 19/08 |
| D-42 | **Existe rol `jefe`**: operario completo —dictamina y firma— más ver el trabajo del equipo y bajar directivas. No administra el sistema (A-09) → DV-11 | 19/08 |
| D-43 | **La complejidad se sugiere por diámetro y altura**, con los cortes en tabla. El sistema convierte perímetro a diámetro. **Apagada** hasta tener los cortes reales (A-10) → DV-15 | 19/08 |
| D-44 | El re-dictaminado a los 18 meses **lo confirmó la repartición**: deja de ser deducción del diseño y pasa a ser el circuito real (A-11) | 19/08 |
| D-45 | **El SUA acepta que un sistema externo cambie el estado de una solicitud**, cedidos los permisos por sus administradores. El beneficio central del trabajo se sostiene entero (B-01) | 19/08 |
| D-46 | **El SUA no tiene coordenadas**: solo la dirección escrita del ejemplar. Se agrega el puerto `IGeocodificador` y la tabla `reclamo_geo`, con precisión declarada y punto corregible en campo (B-02) → DV-12 | 19/08 |
| D-47 | **El motivo es solo texto libre.** La categoría se infiere, se marca como inferida y **el ingeniero puede corregirla**; el ritmo de escalamiento usa la categoría corregida (B-03) | 19/08 |
| D-48 | **La credencial es un usuario de red** con la forma `gboubon0`. D-09 lo había previsto: no se rehace nada, cambia la etiqueta del login. Los usuarios de prueba usan el formato real con personas inventadas (B-04) → DV-13 | 19/08 |

## 9. Preguntas abiertas

Las cerradas quedan abajo. **Las abiertas viven en un documento aparte, pensado para compartir con el equipo:**

- Fuente: `entregables/preguntas-abiertas.html`
- En vivo: <https://claude.ai/code/artifact/0c975d13-c851-4ad3-9070-19a3e7f55b96>

Son 22, agrupadas por quién puede responderlas: 12 de relevamiento puro (Dirección Técnica), 4 de verificación técnica (CIL/SUA), 4 decisiones del equipo y 2 consultas al docente. Cada una indica de dónde sale, qué implica cada respuesta, qué supuesto tomamos mientras tanto y qué habría que corregir del `.docx` y en qué sección.

### Estado al 19/08: contestaron los grupos A y B

De las 22, quedan **6 abiertas**. Las cuatro críticas se cerraron, y las tres que definían el planteo del trabajo salieron a favor:

- **B-01 — el SUA acepta escritura externa** con los permisos cedidos. El argumento central del proyecto (eliminar la transcripción manual del papel al SUA) se sostiene entero.
- **A-02 — la sede es Moreno 2350.** Las rutas dejan de partir de un punto inventado.
- **A-03 — la etiqueta de tormenta no existe**: la tiene que agregar el CIL. Pasa de integración a mejora propuesta con dependencia externa, y el módulo necesita funcionar sin ella (DV-09).

Dos respuestas obligaron a rediseñar, no solo a confirmar: **A-07** (se cae la matrícula, entra la habilitación registrada) y **B-02** (el SUA no tiene coordenadas, así que geocodificar es trabajo del módulo y aparece un puerto nuevo). Una tercera, **A-09**, agrega un rol que el documento no tenía y que sus propias historias de usuario ya usaban.

**B-04 es la mejor evidencia de que el desacoplamiento sirve**: el supuesto era "correo institucional", la respuesta fue "usuario de red", y no hubo que rehacer nada porque el puerto recibía un identificador opaco (D-09).

### Lo que sigue abierto

| # | Qué falta | Por qué importa |
| --- | --- | --- |
| A-04 bis | Si el *captor* es Android | Si lo es, iOS queda fuera del alcance por una condición real y no por conveniencia |
| A-10 bis | Los cortes de diámetro y altura de cada nivel de complejidad | Sin ellos la sugerencia de RF-15 queda apagada |
| A-12 | Diez o quince descripciones reales de reclamos | Ahora pesa el doble: de esas señales sale la prioridad **y** la categoría (B-03) |
| C-01 | Qué lleva el entregable para concesionarias y en qué formato | Es funcionalidad nueva, hay que redactarla como requerimiento |
| C-02 | Cuánto se guarda el historial de recorridos | Es un registro de movimientos de un trabajador |
| C-03 | Dónde se guardan las contraseñas de los usuarios de prueba | Al repositorio no van |
| D-01 · D-02 | Cómo presentar los desvíos y qué espera el docente en cada corte | Forma de la entrega |

C-04 quedó resuelta de hecho: la app Expo ya se eliminó de la rama (D-33).

| # | Pregunta | Estado |
| --- | --- | --- |
| P-01 | ¿Qué justifica que un ingeniero abra un reclamo nuevo? | **cerrada** → D-18 |
| P-02 | ¿Qué pasa si el ingeniero dictamina, sin señal, un reclamo que otro ya dictaminó? | **cerrada** → D-14, D-16 |
| P-03 | ¿Cuánto dura la reserva y qué ve el resto del equipo? | **cerrada** → D-15 |
| P-04 | ¿Un dictamen vencido habilita re-dictaminar? | **cerrada** → D-17 |
| P-05 | ¿Con qué criterios se asigna la prioridad inicial? | **cerrada** → D-21, D-22, D-23 |
| P-06 | ¿Qué pasa con los reclamos no visitados al cerrar la jornada? | **cerrada** → D-24 |
| P-07 | ¿Quién es el rol Lector en la práctica? | **cerrada** → D-26 |
| P-08 | ¿Qué es la "zona" al planificar una ruta? | **cerrada** → D-25 |
| A-01 | ¿Cuántos ingenieros dictaminan en campo? | **cerrada** → D-35 |
| A-02 | ¿Dónde queda la sede? | **cerrada** → D-36 |
| A-03 | ¿La etiqueta de tormenta existe? | **cerrada** → D-37, DV-09 |
| A-04 | ¿Qué dispositivo usan en la calle? | **cerrada** → D-38 · falta confirmar si es Android |
| A-05 | ¿Quién paga los datos móviles? | **cerrada** → D-38 |
| A-06 | ¿Hay lista oficial de especies? | **cerrada** → D-39, DV-14 |
| A-07 | ¿Qué forma tiene la matrícula? | **cerrada** → D-40, DV-10 |
| A-08 | ¿Qué forma tiene el número de reclamo? | **cerrada** → D-41 |
| A-09 | ¿Existe la jefatura? | **cerrada** → D-42, DV-11 |
| A-10 | ¿Con qué criterio se decide la complejidad? | **cerrada** → D-43, DV-15 · faltan los cortes |
| A-11 | ¿Qué pasa cuando vence el dictamen? | **cerrada** → D-44, confirma D-17 |
| A-12 | ¿Cómo escriben los vecinos? | **abierta** · se conocen los canales, faltan los textos |
| B-01 | ¿El SUA acepta escritura externa? | **cerrada** → D-45 |
| B-02 | ¿Los reclamos traen coordenadas? | **cerrada** → D-46, DV-12 |
| B-03 | ¿El motivo viene categorizado? | **cerrada** → D-47, confirma D-31 |
| B-04 | ¿Con qué se identifica un agente? | **cerrada** → D-48, DV-13 |
