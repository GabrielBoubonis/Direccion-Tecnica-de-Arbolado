# Protocolo de trabajo — Backend Arbolado

> Documento vivo. Se actualiza cada vez que cambia una regla, en el mismo commit que el cambio.
> Última actualización: 18/08/2026 · Rama: `VillegaBackBranch`

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
| Arquitectura y puertos | en curso | — | — | — |
| Modelo de datos y RLS | — | — | — | — |
| Autenticación y roles | — | — | — | — |
| Reclamos y filtros | — | — | — | — |
| Dictamen técnico | — | — | — | — |
| Rutas y balanceador | — | — | — | — |
| Protocolo de tormenta | — | — | — | — |
| Dashboard | — | — | — | — |
| Panel de administrador | — | — | — | — |
| Sincronización offline | — | — | — | — |
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

## 9. Preguntas abiertas

Se listan acá y se van cerrando; cada una que se cierra pasa a la tabla de decisiones.

| # | Pregunta | Estado |
| --- | --- | --- |
| P-01 | ¿Qué justifica que un ingeniero abra un reclamo nuevo, y en qué se diferencia de uno del SUA? (minuta 12/08) | abierta |
| P-02 | ¿Qué pasa si el ingeniero dictamina, sin señal, un reclamo que otro ya dictaminó? | abierta |
| P-03 | ¿Cuánto dura la reserva de un reclamo y qué ve el resto del equipo mientras tanto? | abierta |
| P-04 | ¿Un dictamen vencido a los 18 meses habilita re-dictaminar el reclamo? | abierta |
