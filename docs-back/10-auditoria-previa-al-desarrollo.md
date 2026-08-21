# Auditoría previa al desarrollo

> Última actualización: 21/08/2026 · Estado: **preparada, sin ejecutar** — con los ejes 3 y 4 **adelantados** (ver §3)
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

**Alcance:** RF-01 a RF-38 y RNF-01 a RNF-14. Treinta y ocho más catorce, ninguno se saltea.

### Eje 3 · La jornada de campo, otra vez y completa

> *¿Qué pasa en cada situación real que puede darse entre que el ingeniero sale de Moreno 2350 y vuelve?*

La auditoría anterior recorrió la jornada **sin conexión**. Esta recorre la jornada **entera**, incluyendo lo que pasa con señal, y sobre todo lo que pasa **a mitad de camino** — que es donde vive lo incómodo.

> **Adelantado el 21/08.** Las doce situaciones se resolvieron antes de correr la auditoría, porque eran decisiones **funcionales** que no dependían de nadie externo. El razonamiento está en `11-decisiones-20260821.md`.

| Situación | Cómo se resolvió |
| --- | --- |
| El árbol **ya no está** | Dictamen "sin trabajo", motivo `ejemplar_inexistente`; cierra definitivo (D-68, D-83) |
| El árbol está, pero **la dirección apunta a otra cuadra** | Corrige el punto en la pre-confirmación; ninguna geocodificación posterior lo pisa |
| Hay **dos árboles** y no dice cuál | Elige uno y corrige el punto; el otro va como alta de oficio (D-79) |
| El vecino **no deja** medir, o hay un perro suelto | Parada no visitada con motivo; **no se dictamina a medias** (D-71) |
| El caso **ya fue intervenido** | Dictamen "sin trabajo", motivo `ya_intervenido` (D-68) |
| **Derivado por error**: árbol privado, otra jurisdicción | Dictamen "sin trabajo", motivo `fuera_de_alcance` (D-91) |
| La jornada se **corta antes de tiempo** | Cierre anticipado con motivo: desblinda y devuelve en el momento (D-74) |
| Aparece una **urgencia en la calle** | Alta de oficio con la prioridad que fija el ingeniero (D-18, D-85) |
| **Se equivoca de reclamo** y firma | Solicita la anulación; la ejecuta el Administrador (D-69) |
| Dos ingenieros **se cruzan** | Cubierto por la reserva exclusiva y el blindaje |
| El captor **se rompe** a media jornada | Baja de captor y cuarentena (RF-35, D-63); lo cargado se pierde solo si no vuelve |
| **Termina antes** y quiere más trabajo | Amplía la jornada desde donde está, sujeto a la ventana laboral (D-72, RF-37) |
| **Le sacan un caso** a media jornada | Novedades con señal: aviso con motivo y ruta recalculada (D-77) |

**Lo que queda para el eje 3 cuando se corra:** verificar que estas trece estén efectivamente escritas en los documentos temáticos y con escenario en el driver, y **buscar las que todavía no se nos ocurrieron**. Trece respuestas no son la garantía de que no falte una decimocuarta.

> **Este eje es funcional, no técnico.** Las preguntas se le llevan a Lucas en términos de comportamiento observable —*"el ingeniero llega y el árbol no está: ¿qué ve, y qué le queda al reclamo?"*— y el mecanismo se decide después.

### Eje 4 · La operación en la Municipalidad

> *¿Qué pasa dentro de la repartición, más allá de la calle?*

> **Adelantado el 21/08**, igual que el eje 3.

| Situación | Cómo se resolvió |
| --- | --- |
| Un agente **se va** con reclamos blindados y dictámenes sin subir | El panel corta el paso y muestra qué queda colgando; el Administrador decide (D-78) |
| Un agente **cambia de rol** | Mismo control que la baja |
| La cuadrilla **no puede ejecutar** lo autorizado | **No vuelve al sistema.** La reentrada es un reclamo nuevo. Exclusión declarada (D-80) |
| Se **vuelve a cargar** un reclamo que ya existe con otro número | El dictamen puede cerrar los duplicados del mismo ejemplar (RF-38) |
| El Administrador **cambia un parámetro** con jornadas en curso | `parametro` pasa a versionada; las jornadas confirmadas siguen con la suya (D-76) |
| El Jefe quiere **reasignar** trabajo entre ingenieros | **No se puede.** Exclusión declarada: la facultad del Jefe es la directiva (D-86) |
| El **rezago histórico** inunda la matriz de prioridad | Escala igual y se separa por antigüedad (D-81) |

**Lo que queda abierto para el eje 4:**

- Un dictamen firmado **se impugna** desde afuera. Probablemente se resuelva con la anulación que ya existe, pero **no está escrito** y conviene decirlo con nombre propio.
- Llega un **pedido de informe** de otra área sobre un expediente.
- El SUA **cambia** el formato de un campo o agrega un subtipo. Es el escenario que pone a prueba `IReclamoProvider`, que es la promesa central de la arquitectura.

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
| 1 | ~~`parametro` no está versionada~~ · **Resuelto el 21/08** (D-76): pasa a versionada y la jornada guarda con cuál se armó | — |
| 2 | **Copia de seguridad**: el objetivo quedó fijado el 21/08 (D-88, cero pérdida de dictámenes firmados), pero **el procedimiento de restauración sigue sin escribirse ni probarse** | 6 |
| 3 | **No está escrito qué pasa si llega la misma `Idempotency-Key` con un cuerpo distinto** | 7 |
| 4 | El **blindaje se escribe en el módulo 4 y se respeta en el módulo 2**. Si los trabajos del 2 no aprenden el `not exists`, el blindaje existe y no protege nada | 2 |
| 5 | **El trigger de inmutabilidad tuvo que reescribirse** al sumar los campos de certificación: como estaba, rechazaba cualquier `update` que dejara el dictamen en `firmado`, incluido marcar `sincronizado_origen`. **Hay que buscar si hay más triggers o `check` con el mismo problema** | 1, 5 |
| 6 | **`sua_sim` no tiene tabla de fotos** y `reclamo_foto` es nuestra. Verificar que el día de la transferencia el `IReclamoProvider` real pueda recibirlas, o declarar que no | 6 |
| 7 | ~~El protocolo de tormenta no interactúa con el blindaje~~ · **Resuelto el 21/08** (D-70): el blindaje aguanta y solo el Jefe puede forzarlo; con señal, el ingeniero se entera en el momento (D-77) | — |
| 8 | **El balanceador y la directiva de jornada pueden pedir cosas incompatibles**: una directiva obligatoria que restringe categoría y zona, más una distribución por porcentaje de prioridad, puede no tener solución. `RF-25` redistribuye por falta de stock, pero **no está escrito qué gana cuando la directiva vuelve el cupo imposible** | 2, 4 |

**El punto 5 es el más instructivo de los ocho** y conviene decirlo en la defensa: se encontró **escribiendo** el esquema, no leyéndolo. Es la diferencia entre revisar un documento y ejercitarlo.

> Un noveno punto se encontró y **se corrigió en el acto**, porque costaba una línea: `ruta` guardaba minutos y eficiencia pero **ninguna distancia**, así que el resumen de la jornada prometía kilómetros que la tabla no tenía. Se sumó `distancia_metros`. Queda anotado como ejemplo de la diferencia de costo entre encontrar algo ahora y encontrarlo con el módulo 4 escrito.

**El punto 7 era el que más olía a hallazgo grave y se resolvió antes de correr la auditoría**, junto con el 1 y buena parte del 8. Es la mejor señal de que adelantar los ejes 3 y 4 valía la pena: **tres de los nueve puntos marcados cayeron sin necesidad de auditar nada, solo preguntando lo que faltaba preguntar.**

Los que quedan —el 2, el 3, el 4, el 5 y el 6— son técnicos y se resuelven mirando el diseño, no preguntándole al analista.

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
