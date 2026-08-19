# T9 — Trabajos programados y el reloj

> Diseño técnico · Última actualización: 19/08/2026 · Estado: **sin aprobar**
> Responde: qué corre solo, cuándo, con qué garantías, y por qué la hora se pide por interfaz.

---

## 1. Por qué hay trabajos programados

Dos reglas centrales del sistema **tienen que ocurrir aunque nadie abra la aplicación**:

- **El escalamiento de prioridad** (RF-11). Un reclamo que nadie mira durante seis meses es justamente el que más necesita escalar. Si el color se calculara al leer, el caso olvidado —el que el proyecto existe para rescatar— seguiría olvidado y además verde.
- **El vencimiento del dictamen a los dieciocho meses** (RF-19). Si el reclamo volviera a la cola recién cuando alguien lo consulta, el aviso de "próximos a vencer" de RF-05 no tendría de dónde salir.

Calcular al leer también complicaría filtrar y ordenar por prioridad cuando el volumen crece, y **no dejaría rastro** de cuándo escaló cada reclamo — que es justamente lo que permite contestar en la defensa *"¿por qué este está en rojo?"*.

---

## 2. Los seis trabajos

Se programan con `pg_cron` en la migración `0011`. Horario de Argentina.

| # | Trabajo | Cuándo | Qué hace |
| --- | --- | --- | --- |
| 1 | `escalar_prioridades` | 03:00 diario | Aplica `escalarPorTiempo` y escribe historial por cada salto |
| 2 | `marcar_vencimientos` | 03:10 diario | Dictámenes a 18 meses → `vencido`, reclamo → `vencido_redictaminar` |
| 3 | `liberar_reservas` | 20:05 diario | Libera las vencidas; los no visitados vuelven a la cola |
| 4 | `geocodificar_pendientes` | 02:00 diario | Procesa la cola y reintenta las `fallida` |
| 5 | `reintentar_sincronizacion` | cada 15 min | Reintenta marcar `dictaminado` en el origen |
| 6 | `purgar_rutas` | 04:00 domingos | Borra recorridos más viejos que la retención (T10) |

**El orden de 1 y 2 no es casual.** Primero escalan las prioridades, después se marcan los vencimientos: así un reclamo que vuelve a la cola por vencimiento entra ya con la prioridad del día, y no con una de ayer.

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
    dictamen.estado ← 'vencido'
    reclamo_estado.estado_modulo ← 'vencido_redictaminar'
    -- el dictamen viejo NUNCA se borra: queda consultable como historial
```

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

## 8. Trabajo 6 — Purga de recorridos

> Privacidad · C-02 pendiente de definir

```
Borrar detalle_ruta y ruta con fecha_planificacion < hoy − dias_retencion_rutas
-- los dictámenes NO se tocan: son documentos con validez legal
```

Un historial de recorridos con horarios estimados es, técnicamente, **un registro de los movimientos de un trabajador**. Los dictámenes se guardan para siempre porque son documentos legales; las rutas no tienen esa necesidad, y pasado su valor estadístico son más riesgo que utilidad — sobre todo si mañana alguien las usa para evaluar el rendimiento de una persona.

**El plazo exacto está pendiente de definir con la repartición** (C-02). Mientras tanto el trabajo existe, está programado y con la retención sin fijar: el día que se defina, es cambiar un parámetro.

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
