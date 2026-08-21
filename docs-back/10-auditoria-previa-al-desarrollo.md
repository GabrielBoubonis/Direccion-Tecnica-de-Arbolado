# Auditoría previa al desarrollo

> Última actualización: 21/08/2026 · Estado: **preparada, sin ejecutar**
> Se corre **después del feedback del docente** y **antes de escribir la primera línea de código de producción**.
> La ejecuta Claude; Lucas fija el alcance, resuelve lo funcional y aprueba el resultado.

---

## 1. Por qué existe este documento

La auditoría del 20/08 recorrió **una sola cosa**: una jornada sin conexión, de punta a punta. Encontró **doce hallazgos, tres graves**, y produjo **cinco requerimientos que el documento académico no tenía** (RF-33, RF-34, RF-35, RF-36 y RNF-14).

Eso deja una conclusión incómoda y útil: **auditar un eje encontró doce problemas, así que quedan ejes sin auditar**. Esta auditoría recorre el resto.

**Un error de diseño encontrado en el código cuesta reescribir módulos; encontrado en el documento cuesta editar un párrafo.** Ninguno de los cinco requerimientos nuevos costó más que redactarlo, porque no había código escrito que los contradijera. Esa es toda la razón de correr la auditoría ahora y no después.

### Qué NO es esta auditoría

No es una revisión de estilo, ni una relectura buscando erratas, ni una verificación de que los documentos coincidan entre sí — eso es el eje 1 y es lo más barato de los ocho. **Es un intento deliberado de romper el diseño**: buscar el caso de campo que no está previsto, el flujo que termina en un callejón, la regla que se contradice con otra, el dato que se pierde.

Una auditoría que sale limpia a la primera es una auditoría mal hecha.

---

## 2. Cuándo se corre y qué la dispara

| Momento | Qué pasa |
| --- | --- |
| **Ahora** | Este documento queda preparado. No se ejecuta |
| Vuelve el feedback del docente | Lucas ajusta el alcance de §3 según lo que el profesor haya marcado |
| Antes de Fase 2 | Se ejecuta completa y se registra el resultado en §7 |
| Se resuelven los hallazgos | Los documentos temáticos los absorben, igual que con la auditoría del 20/08 |
| **Recién entonces** | Arranca el módulo 0 de `T13-plan-de-implementacion.md` |

**El feedback del docente puede agregar ejes, no sacarlos.** Si el profesor marca algo del documento académico, ese punto entra como eje adicional. Los ocho de §3 se corren igual.

---

## 3. Los ocho ejes

Cada eje tiene una **pregunta que lo ordena**. La pregunta no es retórica: es lo que se busca contestar con evidencia del documento, no con memoria.

### Eje 1 · Coherencia entre documentos

> *¿Dice lo mismo el mismo hecho en los cuatro lugares donde está escrito?*

El diseño vive en tres capas —funcional (`01` a `08`), técnica (`T1` a `T13`) y el `.docx` académico— y cada regla suele aparecer en dos o tres. La auditoría del 20/08 encontró **dos contradicciones directas** entre documentos que llevaban días conviviendo: las fotos que subían antes y después del dictamen a la vez (H-01), y el orden estricto de la cola que el mismo párrafo desmentía.

Qué se revisa:

- Cada regla de negocio, contra su versión funcional, su versión técnica y su versión en el `.docx`.
- Cada parámetro configurable, contra su valor inicial en los tres lugares donde figura.
- Cada código de error, contra el nombre canónico de `T6` §10.
- Cada tabla del modelo de datos, contra su DDL en `T5`.
- Cada puerto de `01-arquitectura.md`, contra su interfaz en `T2`.

**Método:** lista de hechos verificables, uno por fila, con las tres referencias al lado. Un hecho que aparece en un solo documento no es un error, pero **un hecho que aparece en dos y no coincide sí lo es**.

### Eje 2 · Cobertura de requerimientos

> *¿Cada RF y cada RNF tiene flujo principal, alternativos, dueño en el código y escenario en el driver?*

Cuatro columnas por requerimiento, y las cuatro tienen que estar llenas:

| Columna | Qué se verifica |
| --- | --- |
| **Flujo principal** | Está escrito, con actor, entrada y salida |
| **Flujos alternativos** | **Todos** los que puedan ocurrir. Es la columna que falla |
| **Dueño** | Qué caso de uso de `T4` y qué módulo de `T13` lo implementan |
| **Escenario** | Qué escenario del driver lo demuestra |

**La tercera columna es la que importa.** La auditoría del 20/08 no encontró un flujo principal roto: encontró **ocho caminos alternativos que no existían** — qué pasa si el dispositivo se pierde, si la certificadora no responde, si el reloj está mal, si un borrador queda abandonado, si se anula un dictamen ya entregado.

Un diseño con todos los flujos principales y sin alternativos es un diseño que funciona en la demo y se rompe la primera semana.

**Alcance:** RF-01 a RF-36 y RNF-01 a RNF-14. Treinta y seis más catorce, ninguno se saltea.

### Eje 3 · La jornada de campo, otra vez y completa

> *¿Qué pasa en cada situación real que puede darse entre que el ingeniero sale de Moreno 2350 y vuelve?*

La auditoría anterior recorrió la jornada **sin conexión**. Esta recorre la jornada **entera**, incluyendo lo que pasa con señal, y sobre todo lo que pasa **a mitad de camino** — que es donde vive lo incómodo.

Situaciones que hay que poder contestar sin dudar:

| Situación | ¿Está contestada? |
| --- | --- |
| El árbol del reclamo **ya no está**: lo sacó una tormenta o un vecino | |
| El árbol está, pero **la dirección apunta a otra cuadra** | |
| Hay **dos árboles** en la dirección y el reclamo no dice cuál | |
| El vecino **no deja** medir el ejemplar, o hay un perro suelto | |
| El ingeniero llega y el caso **ya fue intervenido** por una cuadrilla | |
| Se **cambia de modo de traslado** a mitad de jornada | |
| La jornada se **corta antes de tiempo**: lluvia, urgencia, salud | |
| Aparece una **urgencia en la calle** que no estaba en la ruta | |
| El ingeniero **se equivoca de reclamo** y carga el dictamen en otro | |
| Dos ingenieros **se cruzan** en la misma cuadra | |
| El captor **se le cae y se rompe** a media jornada | |
| El ingeniero **termina antes** y quiere tomar más trabajo | |

**Ninguna de las doce está resuelta hoy con nombre propio en el diseño.** Algunas probablemente se resuelvan solas con lo que ya está escrito —el mapa corregible, el alta de oficio, la reserva liberable—; otras seguramente no. El trabajo del eje es **decidir cuáles y escribir la respuesta**, no dar por sentado que el diseño ya las cubre.

> **Este eje es funcional, no técnico.** Las preguntas se le llevan a Lucas en términos de comportamiento observable —*"el ingeniero llega y el árbol no está: ¿qué ve, y qué le queda al reclamo?"*— y el mecanismo se decide después.

### Eje 4 · La operación en la Municipalidad

> *¿Qué pasa dentro de la repartición, más allá de la calle?*

El diseño está muy trabajado del lado del ingeniero en campo y **menos del lado de la oficina**. Situaciones a cubrir:

| Situación | ¿Está contestada? |
| --- | --- |
| Un agente **se va de la repartición** con reclamos reservados y dictámenes firmados | |
| Un agente **cambia de rol** — el Operario pasa a Jefe, o al revés | |
| Un dictamen firmado **se impugna** desde afuera | |
| La cuadrilla **no puede ejecutar** lo que el dictamen autoriza | |
| Llega un **pedido de informe** de otra área sobre un expediente | |
| El SUA **cambia** el formato de un campo, o agrega un subtipo | |
| Se **vuelve a cargar** un reclamo que ya existe con otro número | |
| El Administrador **cambia un parámetro** con jornadas en curso | |

La última merece atención especial: `config_firma` está versionada justamente para eso, pero **`parametro` no lo está**, y `minutos_por_dictamen` cambiado a mitad de una jornada confirmada puede dejar una ruta calculada con un número y ejecutándose con otro.

### Eje 5 · Concurrencia y carrera

> *¿Qué pasa cuando dos cosas ocurren al mismo tiempo?*

El diseño tiene bien resuelto **un** caso de carrera: dos ingenieros pidiendo el mismo reclamo, contenido por el índice único parcial de `reserva`. Faltan verificar los demás:

| Carrera | Qué habría que garantizar |
| --- | --- |
| Dos jornadas que se preparan a la vez sobre la misma zona | |
| Un Administrador que desblinda mientras el ingeniero está sincronizando | |
| Una directiva obligatoria que se crea con jornadas ya confirmadas | |
| Un usuario que se desactiva con una jornada en curso | |
| Un captor que se da de baja mientras su cola está subiendo | |
| Dos fotos con el mismo `orden` para el mismo dictamen | |
| El trabajo de vencimientos y una anulación manual, sobre el mismo dictamen | |
| Un reclamo que se dictamina justo cuando el trabajo de escalamiento lo sube de color | |

**Para cada uno hay que decir dónde está el candado**, y si es la base o el código. El proyecto ya tomó una posición sobre esto —*"lo impone la base, no depende de que el código se acuerde"*— y el eje es verificar que se sostenga en los ocho casos, no solo en el primero.

### Eje 6 · Infraestructura y despliegue

> *¿Esto se puede poner a andar en la Municipalidad, y qué hace falta para eso?*

La auditoría del 20/08 produjo un requisito de despliegue que nadie había escrito: **el captor tiene que tener la aplicación instalada como PWA, no abierta en una pestaña**, porque de eso depende que el navegador no borre dictámenes firmados. Es muy probable que haya más condiciones así.

| Qué revisar | Por qué |
| --- | --- |
| Lista completa de **condiciones de entorno** que el CIL tiene que cumplir | Hoy están desparramadas por seis documentos |
| Qué pasa si **Supabase se cae** a mitad de una jornada | |
| Qué pasa si **OSRM** o el geocodificador dejan de responder | Parcialmente cubierto (T7), verificar |
| **Copias de seguridad**: qué se respalda, cada cuánto, y cómo se restaura | **No está escrito en ningún lado** |
| Cómo se **migra** el día de la transferencia: orden, datos, qué se lleva y qué se tira | Declarado como objetivo, sin procedimiento |
| Qué **registros** deja el sistema y quién los mira | |
| Cómo se **monitorea** que los nueve trabajos programados corrieron | T9 §9 lo pide, falta el cómo |

**Las copias de seguridad son la ausencia más grave de la lista.** El sistema emite documentos con validez legal y el diseño no dice una palabra sobre respaldo ni recuperación. Que el proveedor haga backups no es lo mismo que tener un procedimiento de restauración probado.

### Eje 7 · Seguridad y privacidad, adversarial

> *Si alguien quisiera hacer daño con este sistema, ¿por dónde entraría?*

No es repasar la lista de controles que ya están escritos: es intentar sortearlos.

| Intento | ¿Lo contiene el diseño? |
| --- | --- |
| Un Operario que le pega directo a la API para firmar por otro | Sí — RLS. **Verificar en vivo** |
| Un Lector que consulta el texto de los vecinos | Declarado en T6 §11. Verificar que la RLS lo cumpla |
| Un Administrador que se agrega a sí mismo como firmante | `config_firma` es editable por él. **¿Queda auditado? ¿Alcanza?** | 
| Alguien que lee la auditoría y la modifica | "Nadie escribe directo" — verificar que no haya `update` posible |
| Una URL firmada de foto que se comparte antes de vencer | 60 s. Verificar que no se guarden ni se listen |
| Un captor prestado a otra persona | RNF-14 lo mitiga. **¿Del todo?** |
| Un dictamen reenviado con el cuerpo alterado | Idempotencia por `id`. **¿Qué pasa si cambia el cuerpo con la misma clave?** |
| Enumerar usuarios municipales por el login | Mensaje genérico + límite de intentos. Verificar |

**La tercera y la séptima son las que más incomodan.** El Administrador puede cambiar quién firma; que quede auditado es necesario pero puede no ser suficiente. Y la idempotencia por `id` protege contra reenvíos idénticos — **no está escrito qué pasa si llega la misma clave con un cuerpo distinto**, que es exactamente lo que haría alguien que quisiera aprovecharla.

### Eje 8 · Sobreingeniería, en el sentido contrario

> *¿Qué de todo esto no hace falta?*

Los siete ejes anteriores empujan a agregar. Este empuja a sacar, y se corre **último y a propósito**, para que lo que sobreviva lo haga con argumento.

| Pregunta | Sobre qué |
| --- | --- |
| ¿Los catorce puertos se justifican **uno por uno**? | Un puerto que nunca va a tener segunda implementación es una interfaz de más |
| ¿Las cuatro tablas de configuración hacen falta, o alcanza con menos? | `parametro`, `regla_prioridad`, `regla_complejidad`, `config_firma` |
| ¿Los nueve trabajos programados tienen que ser nueve? | |
| ¿Las tres capas de validación de RF-14 se sostienen? | Front, backend y `check` en la base |
| ¿Hay tablas que nadie lee? | |
| ¿Hay endpoints que ningún caso de uso usa? | |
| ¿Hay estados en las máquinas de estado a los que no se llega? | |

**El criterio para sacar algo no es "parece de más": es que no haya un caso de uso, un requerimiento o un escenario del driver que lo necesite.** Si algo sobrevive a esa pregunta, se queda y queda justificado — que es más valioso que sacarlo.

---

## 4. Cómo se ejecuta

| Paso | Qué |
| --- | --- |
| 1 | Se corre **un eje por vez**, en orden. Los ejes 1 y 2 son mecánicos; del 3 al 7 son de criterio; el 8 se corre último |
| 2 | Cada hallazgo se anota con **evidencia**: documento, sección, y qué dice exactamente |
| 3 | Se clasifica: **grave**, **importante** o **menor** (§5) |
| 4 | Lo funcional se le pregunta a Lucas **en términos de comportamiento observable**, nunca de mecanismo |
| 5 | Lo técnico se decide y se documenta |
| 6 | Los documentos temáticos **absorben** las decisiones, en el mismo commit |
| 7 | Los requerimientos nuevos se registran como desvío en `99-desvios.md` |

**Regla que se hereda de la auditoría anterior: no se cierra un hallazgo sin decir qué se pierde.** D-64 no dice "sesión única y listo": dice que una batería agotada a las 14:00 termina la jornada, y por qué se acepta igual. Un hallazgo cerrado sin costo declarado es un hallazgo cerrado a medias.

---

## 5. Cómo se clasifica un hallazgo

| Nivel | Criterio | Qué obliga |
| --- | --- | --- |
| **Grave** | Se pierde trabajo, se corrompe un dato, o un documento legal queda ambiguo | Se resuelve **antes** de codear. Sin excepción |
| **Importante** | El sistema funciona pero hay un camino sin respuesta, o una decisión sin fundamento escrito | Se resuelve antes de codear el módulo afectado |
| **Menor** | Inconsistencia de redacción, dato desactualizado, referencia rota | Se corrige, sin bloquear |

**El criterio de "grave" es deliberadamente estrecho y siempre el mismo**, porque es el que el proyecto viene sosteniendo desde el principio: *no se descarta trabajo de campo*. Los tres graves del 20/08 caían ahí — la FK que rompía el primer dictamen con fotos, el dictamen perdido indistinguible de un caso no visitado, y la firma que fallaba sin camino de salida.

---

## 6. Lo que ya se sabe que hay que revisar

No son hallazgos: son **puntos que quedaron marcados** al aplicar la auditoría anterior y que esta tiene que mirar de frente.

| # | Punto | Eje |
| --- | --- | --- |
| 1 | **`parametro` no está versionada** y `config_firma` sí. Cambiar `minutos_por_dictamen` con jornadas confirmadas puede dejar rutas calculadas con un número y ejecutándose con otro | 4 |
| 2 | **No hay procedimiento de copia de seguridad ni de restauración**, en un sistema que emite documentos legales | 6 |
| 3 | **No está escrito qué pasa si llega la misma `Idempotency-Key` con un cuerpo distinto** | 7 |
| 4 | El **blindaje se escribe en el módulo 4 y se respeta en el módulo 2**. Si los trabajos del 2 no aprenden el `not exists`, el blindaje existe y no protege nada | 2 |
| 5 | **El trigger de inmutabilidad tuvo que reescribirse** al sumar los campos de certificación: como estaba, rechazaba cualquier `update` que dejara el dictamen en `firmado`, incluido marcar `sincronizado_origen`. **Hay que buscar si hay más triggers o `check` con el mismo problema** | 1, 5 |
| 6 | **`sua_sim` no tiene tabla de fotos** y `reclamo_foto` es nuestra. Verificar que el día de la transferencia el `IReclamoProvider` real pueda recibirlas, o declarar que no | 6 |
| 7 | **El protocolo de tormenta no interactúa con el blindaje** en ningún documento. Una tormenta que entra con jornadas ya confirmadas no tiene comportamiento definido | 3, 5 |
| 8 | **El balanceador y la directiva de jornada pueden pedir cosas incompatibles**: una directiva obligatoria que restringe categoría y zona, más una distribución por porcentaje de prioridad, puede no tener solución. `RF-25` redistribuye por falta de stock, pero **no está escrito qué gana cuando la directiva vuelve el cupo imposible** | 2, 4 |

**El punto 5 es el más instructivo de los ocho** y conviene decirlo en la defensa: se encontró **escribiendo** el esquema, no leyéndolo. Es la diferencia entre revisar un documento y ejercitarlo.

> Un noveno punto se encontró y **se corrigió en el acto**, porque costaba una línea: `ruta` guardaba minutos y eficiencia pero **ninguna distancia**, así que el resumen de la jornada prometía kilómetros que la tabla no tenía. Se sumó `distancia_metros`. Queda anotado como ejemplo de la diferencia de costo entre encontrar algo ahora y encontrarlo con el módulo 4 escrito.

**El punto 7 es el que más huele a hallazgo grave.** El protocolo de tormenta arma rutas de emergencia sobre casos etiquetados de los últimos tres días; el blindaje impide tocar reclamos que otro tiene en la calle. Qué gana cuando se cruzan no está escrito en ninguna parte, y una tormenta es exactamente el momento en que el sistema no puede quedarse pensando.

---

## 7. Resultado

> Se completa al ejecutar. Hoy está vacío a propósito: **un documento de auditoría con resultados escritos antes de auditar no es una auditoría.**

| Eje | Hallazgos | Graves | Estado |
| --- | --- | --- | --- |
| 1 · Coherencia entre documentos | — | — | sin ejecutar |
| 2 · Cobertura de requerimientos | — | — | sin ejecutar |
| 3 · La jornada de campo | — | — | sin ejecutar |
| 4 · La operación en la Municipalidad | — | — | sin ejecutar |
| 5 · Concurrencia y carrera | — | — | sin ejecutar |
| 6 · Infraestructura y despliegue | — | — | sin ejecutar |
| 7 · Seguridad adversarial | — | — | sin ejecutar |
| 8 · Sobreingeniería | — | — | sin ejecutar |

---

## 8. Qué habilita terminarla

Cuando esta auditoría esté ejecutada, sus hallazgos resueltos y absorbidos por los documentos temáticos, y los cinco requerimientos nuevos estén en el `.docx`, **el diseño está aprobado** y arranca el módulo 0 de `T13-plan-de-implementacion.md`.

Hasta entonces vale lo del protocolo: **no se escribe una sola línea de código de producción.** Las únicas excepciones siguen siendo preparar infraestructura vacía y escribir el driver, porque son herramientas de verificación y no producto.
