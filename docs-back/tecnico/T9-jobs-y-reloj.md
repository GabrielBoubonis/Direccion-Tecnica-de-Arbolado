# T9 — Trabajos programados y el reloj

> Diseño técnico · Última actualización: 21/08/2026 · Estado: **sin aprobar**
> Absorbe la auditoría del 20/08 —**ningún trabajo toca un reclamo blindado**, consolidación antes de purgar, certificación diferida, purga de idempotencia, freno por reloj discrepante—
> y las decisiones del 21/08: el color con el que vuelve un reclamo vencido, y los dictámenes que no vencen.
> Responde: qué corre solo, cuándo, con qué garantías, y por qué la hora se pide por interfaz.

---

## 1. Por qué hay trabajos programados

Dos reglas centrales del sistema **tienen que ocurrir aunque nadie abra la aplicación**:

- **El escalamiento de prioridad** (RF-11). Un reclamo que nadie mira durante seis meses es justamente el que más necesita escalar. Si el color se calculara al leer, el caso olvidado —el que el proyecto existe para rescatar— seguiría olvidado y además verde.
- **El vencimiento del dictamen a los dieciocho meses** (RF-19). Si el reclamo volviera a la cola recién cuando alguien lo consulta, el aviso de "próximos a vencer" de RF-05 no tendría de dónde salir.

Calcular al leer también complicaría filtrar y ordenar por prioridad cuando el volumen crece, y **no dejaría rastro** de cuándo escaló cada reclamo — que es justamente lo que permite contestar en la defensa *"¿por qué este está en rojo?"*.

---

## 2. Los diez trabajos

Se programan con `pg_cron` en la migración `0011`. Horario de Argentina.

| # | Trabajo | Cuándo | Qué hace | ¿Saltea blindados? |
| --- | --- | --- | --- | --- |
| 1 | `escalar_prioridades` | 03:00 diario | Aplica `escalarPorTiempo` y escribe historial por cada salto | **Sí** |
| 2 | `marcar_vencimientos` | 03:10 diario | Dictámenes a 18 meses → `vencido`, reclamo → `vencido_redictaminar` | **Sí** |
| 3 | `liberar_reservas` | 20:05 diario | Libera las vencidas; los no visitados vuelven a la cola | — (es quien libera) |
| 4 | `geocodificar_pendientes` | 02:00 diario | Procesa la cola y reintenta las `fallida` | **Sí** |
| 5 | `reintentar_sincronizacion` | cada 15 min | Reintenta marcar `dictaminado` en el origen | No aplica |
| 6 | `purgar_rutas` | 04:00 domingos | **Consolida** el resumen y recién después borra el detalle | No aplica |
| 7 | `purgar_idempotencia` | 04:30 domingos | Borra claves de más de 30 días | No aplica |
| 8 | `reintentar_certificacion` | cada 30 min | Reintenta la certificación externa con espera creciente | No aplica |
| 9 | `marcar_borradores_inactivos` | 05:00 diario | A los 30 días sin actividad pasan a `inactivo`. **Nunca los borra** | No aplica |
| 10 | `caducar_ventanas_laborales` | 05:10 diario | Desactiva las ventanas y directivas cuya vigencia terminó | No aplica |

El trabajo 10 existe por la misma razón que la vigencia de las directivas: **nadie tiene que acordarse de apagar una campaña.** Una ventana laboral de verano que sigue vigente en junio limitaría la jornada sin que nadie entienda por qué.

**El orden de 1 y 2 no es casual.** Primero escalan las prioridades, después se marcan los vencimientos: así un reclamo que vuelve a la cola por vencimiento entra ya con la prioridad del día, y no con una de ayer.

### La columna que más importa de esa tabla (RF-34)

**Los trabajos 1, 2 y 4 no tocan un reclamo blindado.** Es la mitad del valor del blindaje y no una optimización.

```sql
-- El patrón, idéntico en los tres
where not exists (
  select 1 from arbolado.reserva r
   where r.nro_reclamo_sua = e.nro_reclamo_sua and r.anio = e.anio
     and r.liberada_en is null and r.blindada
)
```

Sin ese `not exists`, `escalar_prioridades` corre a las tres de la mañana y le sube la prioridad a un reclamo que un ingeniero lleva precargado en el bolsillo desde ayer a la tarde. Cuando vuelve y sincroniza, el servidor y el dispositivo discrepan sobre un dato que él **nunca pudo ver cambiar**, porque estaba sin señal. **El dato no se puede mover bajo los pies del que está en la calle.**

Lo mismo con `geocodificar_pendientes`: mover el punto de un reclamo que alguien está yendo a visitar es peor que dejarlo mal, porque el ingeniero ya salió con el mapa viejo.

`liberar_reservas` es la excepción obvia: es justamente el trabajo que **termina** el blindaje al cierre de la jornada.

---

## 3. Trabajo 1 — Escalamiento de prioridades

> RF-11 · Decisiones D-11, D-22

```
Para cada reclamo sin dictaminar o vencido_redictaminar:
    ritmo   ← días de escalamiento de su categoría (30 / 60 / 90)
    nueva   ← escalarPorTiempo(estado, hoy, ritmos)     -- función pura
    si nueva ≠ prioridad_vigente:
        actualizar prioridad_vigente y fecha_ultimo_escalamiento
        insertar en escalamiento_historial (de, a, motivo='tiempo')
```

| Categoría | Escala cada | Fundamento |
| --- | --- | --- |
| Riesgo estructural | 30 días | Riesgo directo a personas |
| Cableado o media tensión | 30 días | Riesgo eléctrico y corte de servicio |
| Infraestructura | 60 días | Daño patrimonial progresivo |
| Obstrucción | 60 días | Valor por defecto de la minuta |
| Poda estética | 90 días | Sin riesgo asociado |

**Rojo se queda en rojo.** No hay nivel superior y la prioridad nunca baja.

**Una fila de historial por cada salto**, con motivo `tiempo` y `ejecutado_por` nulo porque fue automático. Es lo que permite abrir cualquier reclamo urgente en la defensa y explicar el color con un dato en lugar de una explicación.

**Es idempotente**: correrlo dos veces el mismo día no produce un segundo salto, porque la función pura decide contra `fecha_ingreso` y no contra "cuántas veces corrí".

---

## 4. Trabajo 2 — Vencimientos

> RF-19, RF-05 · Decisión D-17 · Desvío DV-05

```
Para cada dictamen firmado con fecha_vencimiento < hoy:
    -- fecha_vencimiento es NULA si el dictamen no autoriza nada: no entra   (D-83)
    -- SALTEAR si discrepancia_reloj = 'grave' y fecha_confirmada_en es nula  (D-67)
    -- SALTEAR si el reclamo está blindado                                    (RF-34)
    dictamen.estado ← 'vencido'
    reclamo_estado.estado_modulo ← 'vencido_redictaminar'
    -- conserva prioridad_vigente y reinicia el reloj de escalamiento (D-82)
    reclamo_estado.fecha_ultimo_escalamiento ← hoy
    -- el dictamen viejo NUNCA se borra: queda consultable como historial
```

### Vuelve con el color que tenía, y sigue escalando (D-82)

El reclamo **conserva `prioridad_vigente`** y el reloj de escalamiento cuenta desde el vencimiento. Rojo se queda en rojo.

Se había propuesto volver en verde —la evaluación venció, nadie sabe hoy qué riesgo tiene— y se descartó: **lo que venció es la autorización, no el problema.** Un árbol que necesitaba poda hace 18 meses y no se podó no necesita menos poda, necesita más. Volver en verde reiniciaría el reloj de un caso que ya esperó año y medio, que es la mecánica que produce rezago.

### Los dictámenes "sin trabajo" no entran a este trabajo (D-83)

No tienen `fecha_vencimiento` —es nula por restricción de la base— así que el `where` los deja afuera solo. **No hay que acordarse de exceptuarlos: no pueden entrar.**

El vencimiento existe porque una autorización para intervenir caduca. Si el dictamen no autorizó nada, no hay nada que caduque, y el reclamo quedó en `cerrado_definitivo`.

### El freno por reloj discrepante (D-67)

`fecha_vencimiento` se calcula desde `fecha_dictamen`, que es **el reloj del celular**. Si al recibirlo la diferencia con el reloj del servidor superaba las 24 horas, el dictamen se aceptó igual —no se castiga al ingeniero por el reloj del equipo que le dieron— pero quedó marcado con **discrepancia grave**.

**Este trabajo no lo procesa** hasta que el Administrador confirme o corrija la fecha desde el panel, y esa corrección queda auditada con la fecha vieja y la nueva.

Un vencimiento legal es una fecha que alguien tiene que poder defender. Que la fije un reloj demostrablemente roto, y que después un trabajo automático la ejecute sin preguntarle a nadie, es peor que pedirle a una persona que la mire una vez. El índice parcial `ix_dictamen_reloj_grave` hace que la lista de pendientes de confirmar sea barata de consultar.

Al vencer, **el reclamo vuelve a la lista de pendientes** marcado como `vencido_redictaminar`. Es lo que confirmó la repartición (A-11): *"después de 18 meses el dictamen ya no es acorde a la problemática real del árbol, por lo tanto se vuelve a dictaminar"*.

Fundamento forestal: en dieciocho meses el ejemplar creció, se pudo secar o alguien pudo intervenirlo. La evaluación anterior ya no autoriza legalmente una intervención.

El dashboard avisa los que vencen en treinta días o menos (RF-05), así que **el aviso llega antes de que el trabajo se pierda**. Es la diferencia entre un vencimiento que se anticipa y uno que se descubre.

---

## 5. Trabajo 3 — Liberación de reservas

> Decisiones D-15, D-24

```
Para cada reserva activa con vence_en < ahora:
    liberar con motivo 'vencida'
    si el reclamo no fue dictaminado:
        estado_modulo ← 'sin_dictaminar'   -- vuelve a la cola
```

La reserva **vence al cierre de la jornada**, configurable. Lo que no se visitó queda libre para quien esté más cerca mañana.

Una reserva que no vence sería una forma silenciosa de sacar casos de circulación: alguien planifica veinte, visita doce, y los otros ocho quedan bloqueados sin que nadie se entere.

**Un dictamen que llega después del vencimiento se acepta igual** (T8 §7). La `fecha_dictamen` —el reloj del dispositivo, frente al árbol— es la que manda. Rechazarlo sería castigar al ingeniero por la calidad de la señal.

---

## 6. Trabajo 4 — Geocodificación pendiente

> Decisión D-46 · Desvío DV-12

```
Tomar hasta N reclamos sin punto o con precision='fallida'
Para cada uno, respetando 1 consulta por segundo:
    resultado ← geocodificador.geocodificar(direccion normalizada)
    guardar punto y precisión declarada
    -- NUNCA pisar un punto con origen 'corregido_por_usuario'
```

**La última línea es la más importante del trabajo.** El punto que corrigió un ingeniero parado frente al árbol vale más que cualquier resultado de un geocodificador, y ninguna corrida posterior lo toca.

Se reintentan las `fallida` porque los geocodificadores mejoran sus datos: una dirección que hoy no resuelve puede resolver el mes que viene. Se limita a un número por corrida para respetar la política de uso del proveedor (T7 §2).

Nunca corre en el camino crítico de armar una ruta: si el geocodificador está caído, la jornada se arma igual con los reclamos que ya tienen punto.

---

## 7. Trabajo 5 — Reintento de sincronización con el origen

> RF-20 · Puerto `IReclamoProvider`

```
Para cada dictamen firmado con sincronizado_origen = false:
    reclamos.marcarDictaminado(clave, ref)
    si sale bien: sincronizado_origen ← true
```

Es la única frontera transaccional que el diseño **no** puede cerrar (T4 §13): actualizar el estado en el SUA es una llamada a un sistema externo y no puede participar de la transacción local.

Si falla en el momento de firmar, el dictamen queda firmado igual con marca de pendiente, y este trabajo lo reintenta cada quince minutos. **Deshacer un dictamen firmado porque el SUA no respondió sería descartar trabajo de campo válido por un problema de red.**

El índice parcial `ix_dictamen_pendiente_sync` hace que esta consulta sea barata aunque la tabla crezca: son pocas filas y tienen su propio índice angosto.

Un dictamen que lleva más de veinticuatro horas sin sincronizar **aparece en el panel del Administrador**. Un reintento silencioso que nunca funciona es peor que un error visible.

---

## 8. Trabajo 6 — Consolidación y purga de recorridos

> Privacidad · Decisión **D-56**

```
Para cada ruta con fecha_planificacion < hoy − dias_retencion_detalle_ruta (90):
    1. si no existe ruta_resumen: CONSOLIDAR
       (casos visitados, km, minutos, eficiencia, directiva aplicada)
    2. recién entonces borrar detalle_ruta y ruta.geometria
-- los dictámenes NO se tocan: son documentos con validez legal
```

**Dejó de ser un borrado y pasó a ser una consolidación seguida de un borrado, y el orden es la decisión.** La eficiencia de la jornada se calcula a partir de los horarios de parada: borrarlos sin consolidar primero **se llevaba puesta la estadística**, que es exactamente el dato que la repartición quiere conservar.

En condiciones normales `ruta_resumen` ya existe, porque se escribe al **cerrar la jornada**. El paso 1 acá es la red de seguridad para las rutas que se cerraron mal o quedaron abiertas.

| Dato | Retención |
| --- | --- |
| Horarios de cada parada y geometría del recorrido | **90 días** |
| Resumen: casos, kilómetros, eficiencia | Indefinido |
| Qué casos entraron y bajo qué directiva se armó la jornada | Indefinido |

Un historial de recorridos con horarios es, técnicamente, **un registro de los movimientos de un trabajador**. Los dictámenes se guardan para siempre porque son documentos legales; el rastro parada por parada no tiene esa necesidad, y pasado su valor estadístico es más riesgo que utilidad — sobre todo si mañana alguien lo usa para evaluar el rendimiento de una persona.

**El argumento, para la defensa:** *se conserva el dato que justifica una decisión administrativa y se destruye el que solo serviría para vigilar a un empleado.* La justificación del ingeniero no se borra nunca; su rastro sí.

---

## 8 bis. Trabajo 7 — Purga de claves de idempotencia

> Hallazgo **H-11**

```
Borrar arbolado.idempotencia con creada_en < ahora − 30 días
```

`idempotencia` guarda **la respuesta completa de cada operación en `jsonb`** y no tenía retención ni trabajo de purga: crecía para siempre. En un sistema donde la cola offline reintenta, esa tabla recibe una fila por cada operación que alguna vez se envió.

Treinta días está **muy por encima de cualquier ventana de reintento real** —la más larga que contempla el diseño es la de un captor que estuvo una semana sin volver— y muy por debajo de lo que convertiría esta tabla en un problema de tamaño.

---

## 8 ter. Trabajo 8 — Reintento de certificación externa

> Decisión **D-65** · Desvío DV-19

```
Para cada dictamen firmado con estado_certificacion = 'pendiente':
    respetar la espera creciente según intentos_certificacion
    resultado ← certificadora.certificar(hash_documento, sello_tiempo)
    registrar SIEMPRE una fila en certificacion_intento
    si sale bien: estado_certificacion ← 'certificado', certificado_en ← ahora
```

Es el mismo patrón del trabajo 5, y por el mismo motivo: **la certificación externa es una llamada a un sistema que no controlamos y no puede participar de la transacción de firma**.

**Firmar es local y no puede fallar; certificar sí.** Si falla, el dictamen queda **firmado y válido puertas adentro** —inmutable, auditable, contando para el vencimiento— y la única consecuencia, deliberadamente acotada, es que **no puede salir en un entregable a concesionarias (RF-33) hasta estar certificado**, porque ahí es donde la validez se ejerce frente a un tercero.

El Administrador puede **forzar el reintento** de uno o de todo el lote desde el panel, y ese forzado también deja fila con su nombre. Mientras haya pendientes, el dashboard lo muestra como alerta junto a los que vencen en ≤30 días (RF-05).

**No es problema del ingeniero.** Él firmó y su dictamen está cerrado; la pendencia es del sistema y se resuelve del lado de la administración.

---

## 8 quater. Trabajo 9 — Borradores inactivos

> Decisión **D-57**

```
Para cada dictamen_borrador activo con ultima_actividad < hoy − 30 días:
    estado ← 'inactivo'
-- NO se borra. Nunca. El descarte lo hace una persona.
```

Es el trabajo más corto del sistema y el que más se discutió. Un borrador puede tener adentro **trabajo de campo real**: existe justamente para no descartar la carga de quien dictaminó un caso que otro ya había dictaminado (D-16).

Pasar a `inactivo` lo saca de la bandeja principal y lo pone en una aparte, para que el ingeniero decida si lo retoma o lo descarta. **El sistema nunca decide por él.** Era el único punto del diseño donde se perdía trabajo humano sin que nadie lo mirara.

---

## 9. Garantías comunes a todos los trabajos

| Garantía | Cómo se logra |
| --- | --- |
| **Idempotencia** | Correrlo dos veces no cambia el resultado. Todos deciden contra el estado, no contra un contador |
| **Por lotes** | Se procesan de a mil filas; un trabajo no bloquea la base |
| **Registrados** | Cada corrida deja cuántas filas tocó y cuánto tardó |
| **Sin superposición** | Un bloqueo consultivo de Postgres impide dos corridas simultáneas del mismo trabajo |
| **Visibles** | El panel del Administrador muestra última corrida, duración y filas afectadas |

La última es la que hace la diferencia en la práctica: **un trabajo que falla en silencio durante dos semanas es peor que no tenerlo**, porque el sistema aparenta estar priorizando y no lo está.

**Una garantía más, que sale de la auditoría: ningún trabajo destruye sin haber conservado antes.** Se cumple de tres formas distintas y las tres son deliberadas:

| Trabajo | Qué destruye | Qué conserva primero |
| --- | --- | --- |
| `purgar_rutas` | Horarios y geometría | El resumen de la jornada y la directiva aplicada |
| `purgar_idempotencia` | Respuestas cacheadas | Nada que conservar: el dato original vive en su tabla |
| `marcar_borradores_inactivos` | **Nada** | Es el punto: mueve, no borra |

Y ninguno toca lo que un ingeniero tiene en la calle: **los tres trabajos que modifican reclamos saltean los blindados** (§2).

---

## 10. El reloj como puerto

> `IRelojProvider` (T2 §4.13)

```ts
export interface IRelojProvider { ahora(): Date; hoy(): string; }
```

Parece exagerado para dos líneas. **Sin él, RF-11 y RF-19 no son verificables.**

El driver necesita poder decir *"hacé de cuenta que pasaron catorce meses"* para comprobar la secuencia completa de saltos de prioridad, y *"hacé de cuenta que pasaron diecinueve"* para comprobar el vencimiento. Con `new Date()` incrustado en el núcleo, esas dos reglas solo se podrían probar **esperando catorce meses**.

```ts
// El driver, escenario 'escalamiento-14-meses'
const reloj = new RelojFijo('2026-08-19');
crearReclamo({ categoria: 'obstruccion', fechaIngreso: '2026-08-19' });

reloj.avanzar({ dias: 61 });  await correrJob('escalar');  // verde → amarillo
reloj.avanzar({ dias: 60 });  await correrJob('escalar');  // amarillo → naranja
reloj.avanzar({ dias: 60 });  await correrJob('escalar');  // naranja → rojo
reloj.avanzar({ dias: 60 });  await correrJob('escalar');  // rojo se mantiene

verificar(historial).tieneSaltos(3);   // no cuatro: rojo es el techo
```

Cuatro líneas, ejecutable en la defensa, y demuestra RF-11 completo. **Esa es toda la razón de existir del puerto, y alcanza para justificarlo.**

### La regla que lo acompaña

**En `core/` no se llama nunca a `Date.now()` ni a `new Date()` sin argumentos.** Un escenario estructural del driver recorre los archivos del núcleo y falla si los encuentra (T1 §2, T11).

Es la clase de regla que todo el mundo respeta las primeras dos semanas y después alguien rompe sin darse cuenta, en una función auxiliar, para calcular algo trivial. Verificarla automáticamente cuesta veinte líneas y evita que catorce meses de escalamiento vuelvan a ser inverificables.
