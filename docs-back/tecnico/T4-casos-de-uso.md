# T4 — Casos de uso

> Diseño técnico · Última actualización: 19/08/2026 · Estado: **sin aprobar**
> Responde: cada operación paso a paso — precondiciones, orden de validación, errores, transaccionalidad.

---

## 1. Qué es un caso de uso acá

Un caso de uso **orquesta**: pide datos a los puertos, llama a las funciones puras del núcleo, decide y persiste. No sabe qué base de datos hay abajo ni que existe HTTP.

Firma uniforme:

```ts
export async function nombreDelCaso(
  entrada: EntradaTipada,
  ctx: Contexto,        // { actor: Perfil, puertos: Contenedor, reloj: IRelojProvider }
): Promise<SalidaTipada>
```

**El orden de validación importa y está fijado en cada caso.** Se valida siempre de lo más barato y general a lo más caro y específico: permiso → existencia → estado → coherencia → efectos. Así el error que recibe el ingeniero es el primero que le importa, no el último que falló.

---

## 2. Mapa de casos de uso

| # | Caso de uso | Rol mínimo | CU del documento |
| --- | --- | --- | --- |
| 1 | Iniciar sesión | — | CU-01 |
| 2 | Ver dashboard | Lector | CU-02 |
| 3 | Listar reclamos | Operario | CU-03 |
| 4 | Consultar reclamo por dirección | Operario | pedido de la minuta |
| 5 | Validar par (N° SUA, año) | Operario | CU-04 (paso 1) |
| 6 | Preparar jornada (reserva + propuesta) | Operario | CU-06 ampliado |
| 7 | Ajustar jornada en pre-confirmación | Operario | nuevo (D-53) |
| 8 | Confirmar jornada | Operario | CU-06 |
| 9 | Emitir y firmar dictamen | Operario | CU-05 |
| 10 | Consultar dictamen e historial | Lector | CU-05 |
| 11 | Anular dictamen | Administrador | nuevo |
| 12 | Dar de alta un reclamo | Operario | CU-07 |
| 13 | Listar casos de tormenta | Operario | CU-07 |
| 14 | Armar ruta de tormenta | Operario | CU-07 |
| 15 | Gestionar usuarios y roles | Administrador | CU-08 |
| 16 | Configurar parámetros y adaptadores | Administrador | CU-09 |
| 17 | Configurar la firma digital | Administrador | nuevo (D-51) |
| 18 | Cargar cortes de complejidad | Administrador | nuevo (D-49) |
| 19 | Crear y bajar directivas de jornada | Jefe | nuevo (D-27) |
| 20 | Generar entregable para concesionarias | Administrador | nuevo (D-26) |
| 21 | Consultar auditoría | Administrador | nuevo |

---

## 3. CU-01 · Iniciar sesión

> RF-01, RF-02 · Puertos: `IAuthProvider`, `IPerfilRepository`, `IAuditoriaRepository`

**Entrada**: `{ identificador, password }` — el identificador es el **usuario de red** (`gboubon0`), no un correo (D-48).

| # | Paso |
| --- | --- |
| 1 | Se verifica el límite de intentos por identificador y por origen (T10) |
| 2 | `auth.autenticar(identificador, password)` |
| 3 | Si falla → se registra `login_fallido` y se devuelve **el mismo mensaje genérico** que si el usuario no existiera |
| 4 | `perfiles.porUsuarioId(identidad.usuarioId)` |
| 5 | Si no hay perfil, o `activo = false` → `NO_AUTENTICADO`, mensaje genérico |
| 6 | Se emite el token con los claims de T10 y se devuelve el perfil |

**Ante credenciales incorrectas se devuelve siempre el mismo mensaje**, sin revelar cuál de los dos campos falló (RF-01). Un mensaje distinto para "usuario inexistente" convierte el login en un verificador de nombres de usuario municipales.

**Desactivar un usuario revoca el acceso a la app sin tocar la cuenta institucional** (RF-31): el paso 5 corta antes de emitir token. El día de la transferencia, el directorio municipal sigue siendo el dueño de la credencial; el módulo solo decide si esa persona entra a *esta* aplicación.

---

## 4. CU-06 · Preparar jornada — el caso más delicado

> RF-21 a RF-25 · Decisiones D-14, D-53 · Desvío DV-16
> Puertos: `IReclamoProvider`, `IGeoRepository`, `IReservaRepository`, `IRuteoProvider`, `IParametroRepository`, `IRutaRepository`

**Entrada**: `{ criterio: 'horas'|'casos', valor, zona: {distrito, barrio?}, modoTraslado, modoBalanceo, distribucion? }`

| # | Paso | Detalle |
| --- | --- | --- |
| 1 | Verificar rol | Operario o Jefe. El Administrador no planifica: no va a la calle |
| 2 | Buscar directiva aplicable | `directivaAplicable(dirs, perfil, hoy)` (T3 §11) |
| 3 | Aplicar la directiva al filtro | Si es **obligatoria** y la entrada la excede → `DIRECTIVA_OBLIGATORIA_VIOLADA` |
| 4 | Listar candidatos | Estado `sin_dictaminar` o `vencido_redictaminar`, **sin reserva activa**, en la zona |
| 5 | Traer sus puntos | `geo.puntos(claves)` |
| 6 | Apartar los que no tienen punto | Precisión `fallida` → **no entran a la ruta**, pero se informan aparte |
| 7 | Calcular el cupo | Por horas: `(horas·60 − trasladoEstimado) / minutosPorDictamen`. Por casos: el número dado |
| 8 | Balancear | `balancear(...)` con redistribución si falta stock (RF-25) |
| 9 | **Reservar** | `reservas.tomar(seleccionadas, usuarioId, venceEn)` |
| 10 | Recalcular si hubo ocupados | Se reemplazan por los siguientes candidatos y se vuelve al paso 8, **una sola vez** |
| 11 | Pedir la matriz de tiempos | `ruteo.matrizTiempos([sede, ...puntos, sede], modo)` |
| 12 | Ordenar visitas | `ordenarVisitas(...)` (T7) |
| 13 | Persistir la jornada | Estado `pre_confirmada` |
| 14 | Devolver la propuesta | Con orden, horarios estimados, desglose, eficiencia y **los casos sin punto** |

### La reserva ocurre en el paso 9, no al confirmar

Es el punto entero de la pantalla de pre-confirmación (D-53). El ingeniero puede tomarse el tiempo que necesite para revisar la jornada **sabiendo que nadie le va a sacar un caso mientras decide**.

Si la reserva esperara a la confirmación, cada minuto de revisión sería un minuto de riesgo de perder el trabajo, y el diseño lo estaría empujando a apurarse justo donde conviene que mire con calma.

### Por qué el recálculo del paso 10 ocurre una sola vez

Con cuatro a seis ingenieros compitiendo (A-01) el choque es infrecuente. Reintentar indefinidamente podría dejar la petición colgada; reintentar una vez cubre el caso realista —dos personas planificando a la misma hora— y acota el peor caso. Si en el segundo intento sigue faltando cupo, se devuelve la jornada con los casos que sí se pudieron reservar y se informa cuántos faltaron.

### Tomar trabajo requiere conexión

Es pedirle al sistema una asignación exclusiva: no se puede resolver offline. Cargar y firmar el dictamen, en cambio, no requiere señal. Ese es el principio "**se toma con señal, se ejecuta sin señal**" (D-14), y es lo que convierte el choque entre ingenieros de caso normal en caso excepcional.

---

## 5. CU-06b · Ajustar en pre-confirmación

> Decisión D-53 · Puertos: `IGeoRepository`, `IReservaRepository`, `IRutaRepository`

**Entrada**: uno o varios ajustes sobre la jornada `pre_confirmada`.

| Ajuste | Efecto | Por qué se hace acá |
| --- | --- | --- |
| Corregir un punto del mapa | `geo.corregir(...)`, queda `corregido_por_usuario` | Es el momento con señal **y** con el mapa a la vista. En la calle, con una barra y el sol de frente, no se corrige nada |
| Sacar un caso | Libera la reserva con motivo `manual`; vuelve a la cola | Si el ingeniero ya sabe que ese caso no da, liberarlo temprano se lo deja a otro |
| Corregir la categoría inferida | `categoriaOrigen = 'corregida'` | Antes de que el escalamiento y la ruta usen una categoría equivocada |
| Reordenar o fijar una parada | Marca `ordenForzado` | El orden óptimo es una sugerencia, no una orden: el ingeniero conoce la calle |

Los reclamos con precisión `fallida` o `solo_calle` se devuelven **destacados**: son los que más se benefician de un minuto de atención antes de salir y los que más tiempo hacen perder si se descubren en la calle.

Cada ajuste **recalcula la ruta** y devuelve la propuesta actualizada. La jornada sigue en `pre_confirmada`; las reservas ya están tomadas y no se tocan salvo que se saque un caso.

---

## 6. CU-06c · Confirmar jornada

| # | Paso |
| --- | --- |
| 1 | Verificar que la jornada es del actor y está `pre_confirmada` |
| 2 | Recalcular la ruta definitiva y pedir la **geometría** a `IRuteoProvider` |
| 3 | Persistir ruta, paradas, distribución aplicada, directiva aplicada y proveedor usado |
| 4 | Pasar la jornada a `confirmada` y la ruta a `planificada` |
| 5 | Devolver el **paquete de precarga offline** (T8) |

**Se guarda la geometría, no se recalcula.** Pedido explícito de la minuta: *"el mapa va a tener que quedar igual hasta que se oprima un botón de restablecer, porque ese mapa es el que tienen que seguir todo el día"*. Persistirla lo vuelve imposible por diseño, no por cuidado del programador.

La ruta registra **bajo qué directiva se armó** (D-28). Sin ese dato, en dos meses nadie puede explicar por qué se dictaminaron esos casos y no otros.

---

## 7. CU-05 · Emitir y firmar el dictamen

> RF-12 a RF-20 · El caso central del sistema
> Puertos: casi todos

**Entrada**: el dictamen completo, con `id` **generado en el dispositivo** (clave de idempotencia).

### Orden de validación — fijo

| # | Validación | Error si falla |
| --- | --- | --- |
| 1 | El rol puede firmar según `config_firma` | `ROL_NO_FIRMA` |
| 2 | ¿Ya se procesó este `id`? | Devuelve la respuesta original, sin ejecutar de nuevo |
| 3 | El reclamo existe (par N° SUA + año) | `RECLAMO_NO_ENCONTRADO` |
| 4 | Es Tipo `Reclamo` / Subtipo `Problemas con el arbolado público` | `RECLAMO_FUERA_DE_ALCANCE` |
| 5 | No tiene dictamen vigente | `RECLAMO_YA_DICTAMINADO` |
| 6 | Hay **reserva activa a nombre del actor** | `SIN_RESERVA_PROPIA` |
| 7 | Coherencia de intervenciones | `INTERVENCIONES_EXCLUYENTES` |
| 8 | Coherencia de clasificación (urgente vs largo plazo) | `CLASIFICACION_CONTRADICTORIA` |
| 9 | Campos obligatorios del formulario físico completos | `DATOS_INVALIDOS` |

**El paso 6 es la traducción de D-14**: no se dictamina un reclamo que no esté reservado a nombre del ingeniero. La única excepción es el alta de oficio (CU-07), porque un reclamo recién creado no puede estar tomado por nadie.

### La firma, en un solo paso indivisible

| # | Acción |
| --- | --- |
| 1 | Se calcula el **hash** del contenido, con serialización canónica |
| 2 | Se registra el **sello de tiempo** del servidor, con legajo, rol y versión de `config_firma` |
| 3 | Se fija el **vencimiento a 18 meses** desde `fecha_dictamen` |
| 4 | El dictamen queda en **solo lectura**: no se actualiza ni se borra |
| 5 | El reclamo pasa a **dictaminado** vía `IReclamoProvider` (RF-20) |
| 6 | Se **libera la reserva** con motivo `dictaminado` |
| 7 | Se registra en **auditoría** |

**O el dictamen existe entero y firmado, o no existe.** Los pasos 1 a 4, 6 y 7 son una sola transacción de base.

El paso 5 es la excepción, y hay que decirlo con todas las letras: **es una llamada a un sistema externo y no puede participar de la transacción local**. Se ejecuta después de confirmar, y si falla, el dictamen queda firmado con una marca de sincronización pendiente que un job reintenta. La alternativa —deshacer un dictamen firmado porque el SUA no respondió— sería descartar trabajo de campo válido por un problema de red.

### Discrepancia de relojes

Si `fecha_dictamen` (dispositivo) resulta posterior a `fecha_recepcion` (servidor) o anterior a la reserva, **no se rechaza**: se registra la discrepancia en auditoría. Rechazar el trabajo de una persona porque su celular tiene la hora mal sería peor que anotarlo.

### El choque excepcional

Si el paso 5 falla porque otro ya dictaminó ese reclamo, **la carga no se pierde**: queda como `dictamen_borrador` consultable, con el motivo del rechazo y quién dictaminó primero (D-16). Veinte minutos de trabajo frente a un árbol no se descartan por una condición de carrera.

---

## 8. CU-04 · Validar el par (N° SUA, año)

> RF-12 · Decisión D-41 · Es **el primer paso obligatorio del dictamen**

**Entrada**: `{ nroSua, anio }` — **dos campos separados**: se elige el año y se busca el número dentro de ese año.

| Resultado | Qué devuelve |
| --- | --- |
| No existe | `RECLAMO_NO_ENCONTRADO` |
| Fuera de alcance | `RECLAMO_FUERA_DE_ALCANCE` |
| Ya dictaminado y vigente | `RECLAMO_YA_DICTAMINADO`, con fecha y vencimiento del dictamen existente |
| Dictaminado pero vencido | **Habilita**, marcando que es re-dictaminado (D-17) |
| Sin reserva propia | Habilita la consulta pero **avisa** que hay que reservarlo antes de dictaminar |
| Disponible | Devuelve la ficha completa para precargar el formulario |

Se valida **en el dispositivo antes de consultar al servidor**: número solo dígitos, año dentro del rango configurado. Sin señal, eso significa que el ingeniero se entera al instante de que se equivocó tipeando, en vez de esperar a tener conexión para descubrirlo. Es lo primero que toca el usuario en el momento más incómodo: de pie, en la calle, con sol.

---

## 9. CU-07 · Dar de alta un reclamo

> Decisión D-18 · Puerto: `IReclamoProvider`

Habilitado en **tres situaciones**: de oficio, a pedido de un vecino que lo aborda en la calle, y durante el protocolo de tormenta.

| # | Paso |
| --- | --- |
| 1 | Se crea **a través de `IReclamoProvider.crear`**, no directo en el esquema propio |
| 2 | Se calcula la prioridad inicial y se infiere la categoría |
| 3 | Se geocodifica la dirección |
| 4 | Se marca `origen_alta` y `creado_por_usuario` |
| 5 | Si es de tormenta, se marca la etiqueta y la fecha |
| 6 | Se reserva automáticamente a nombre de quien lo creó |

**El paso 1 es la justificación que pedía la minuta del 12/08**: no se crea un reclamo paralelo, **se lo hace entrar al circuito formal**. Sin esto, el ingeniero dictaminaría un árbol cuyo expediente no existe y ninguna cuadrilla podría intervenirlo legalmente.

El paso 6 permite dictaminarlo de inmediato sin violar "no se dictamina sin reserva propia": un reclamo recién creado no puede estar tomado por nadie.

**Se puede hacer sin señal.** El alta entra a la cola offline como cualquier otra operación, con `id` de idempotencia (T8).

---

## 10. CU-07b · Protocolo de tormenta

> RF-28, RF-29, RF-30 · Decisión D-37 · Desvío DV-09

| Regla | Detalle |
| --- | --- |
| Visibilidad | La sección aparece **solo si hay casos** etiquetados |
| Ventana | Últimos 3 días, configurable |
| Prioridad | Todos iguales entre sí: **no se aplica la escala de colores ni el balanceador** |
| Ruta | Mínima distancia y tiempo total, sin cupos por prioridad |
| Alta en campo | El ingeniero puede registrar casos nuevos con etiqueta de tormenta |

**La etiqueta todavía no existe en el SUA**: la tiene que agregar el CIL (A-03). El adaptador la lee como si existiera, para que el día que la implementen el circuito cierre solo. Mientras tanto la marcan el **Administrador** sobre reclamos existentes y el **Jefe**, o el ingeniero al dar de alta un caso en campo durante el temporal.

Si dependiera solo del CIL, el módulo quedaría inutilizable justo el peor día del año.

---

## 11. CU-02 · Dashboard

> RF-03 a RF-06 · Rol Lector

| Métrica | Detalle |
| --- | --- |
| Totales por estado y por prioridad | Con **filtro por distrito** (pedido de la minuta) |
| Próximos a vencer | Dictámenes a 30 días o menos (RF-05) |
| Reclamos por antigüedad | Muestra el rezago, que es el problema que ataca el proyecto |
| Casos de tormenta activos | Solo si hay |
| Reservas activas del equipo | Solo para Jefe y Administrador |

Se calcula con consultas agregadas, no trayendo filas al servidor de aplicación. El Lector **no puede** ver el detalle de un reclamo ni el texto del vecino: ve agregados. Es consulta ejecutiva, y no necesita datos personales para eso (T10).

---

## 12. Casos de administración

| Caso | Rol | Nota |
| --- | --- | --- |
| Gestionar usuarios y roles | Administrador | Asigna rol y distrito. **Ya no carga matrículas** (D-50) |
| Configurar parámetros | Administrador | Minutos por dictamen, días de escalamiento, TTL de reserva, ventana de tormenta |
| Elegir adaptadores | Administrador | `adaptador_ruteo`, `adaptador_geocodificacion` — **sin desplegar** (RF-32) |
| Configurar firma digital | Administrador | Roles habilitados, certificadora, hash, leyenda del pie. Genera **versión nueva** (D-51) |
| Cargar cortes de complejidad | Administrador | Enciende la sugerencia de RF-15 (D-49) |
| Crear directivas | **Jefe** y Administrador | Con ámbito, vigencia que caduca sola y marca de obligatoria (D-27, D-30) |
| Generar entregable para concesionarias | Administrador | Ver abajo |
| Consultar auditoría | Administrador | Solo lectura, nadie escribe directo |

### El entregable para concesionarias

> Decisión D-26

Las concesionarias **no son usuarias del sistema**: no tienen cuenta, ni rol, ni acceso. Reciben un archivo que solo genera el Administrador, con los dictámenes firmados y vigentes que les toca ejecutar.

Lleva **ubicación del ejemplar, acción autorizada, complejidad y vigencia del dictamen**. No lleva la descripción del vecino, ni las fotos del reclamo, ni el circuito interno.

Es la decisión correcta en privacidad: son una empresa privada externa a la repartición, y darles acceso al sistema completo significaría exponerles datos de vecinos que no necesitan para podar un árbol.

Se guarda el registro de **cada generación** —quién, cuándo, con qué filtros y qué dictámenes salieron—, no solo el archivo. Si mañana hay una discusión sobre qué se le informó a una contratista y cuándo, hay respuesta.

---

## 13. Qué es transaccional y qué no

| Operación | Alcance |
| --- | --- |
| Firma del dictamen | **Transacción única**: dictamen + liberación de reserva + auditoría |
| Actualización del estado en el SUA | **Fuera de la transacción**, con reintento por job |
| Toma de reservas múltiples | Transacción única: se toman todas las disponibles o ninguna del lote |
| Ajustes de pre-confirmación | Cada ajuste es su propia transacción |
| Confirmación de jornada | Transacción única: ruta + paradas + estado |
| Jobs nocturnos | Por lotes, **idempotentes**: correrlos dos veces no cambia el resultado |

**La única frontera transaccional que no se puede cerrar es la del sistema externo**, y está declarada. Todo lo demás vive en una sola base y se resuelve con una transacción.
