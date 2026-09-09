# T6 — Contrato de la API

> Diseño técnico · Última actualización: 21/08/2026 · Estado: **sin aprobar**
> Responde: cada endpoint con su petición y respuesta reales, códigos de error, idempotencia y paginación.

---

## 1. Reglas generales

| Regla | Detalle |
| --- | --- |
| Base | `/api/v1` — la versión está en la URL desde el primer día |
| Formato | JSON, `UTF-8` |
| Autenticación | `Authorization: Bearer <token>` en todo endpoint salvo `/auth/login` |
| Fechas | ISO 8601 con desplazamiento: `2026-08-19T10:30:00-03:00` |
| Reclamos | Siempre por **(N° SUA, año)**, nunca por id de fila |
| Idempotencia | Cabecera `Idempotency-Key` en todo `POST` que produzca efectos |
| Paginación | `?limite=50&desplazamiento=0`, con `total` en la respuesta |

**Ningún identificador interno de Supabase sale a la API.** El front habla el vocabulario del negocio. El día de la transferencia los ids internos cambian; los funcionales no.

### Forma única de respuesta

```jsonc
{ "ok": true,  "datos": { } }
{ "ok": false, "error": { "codigo": "…", "mensaje": "…", "detalle": { } } }
```

El `mensaje` va escrito para mostrarse tal cual, en castellano y sin tecnicismos. El `codigo` va para que el front decida sin parsear texto. El `detalle` lleva lo que hace falta para armar una pantalla útil sin otra consulta.

---

## 2. Autenticación

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `POST` | `/auth/login` | Recibe `{identificador, password, captorId}`, devuelve token y perfil |
| `POST` | `/auth/logout` | Invalida el token vigente |
| `POST` | `/auth/renovar` | Renueva la sesión. Se llama **a la fuerza al confirmar la jornada** |
| `GET` | `/auth/perfil` | Perfil del usuario de la sesión |

```jsonc
// POST /api/v1/auth/login
{ "identificador": "cbenite0", "password": "…", "captorId": "captor-01" }

// 200
{ "ok": true, "datos": {
  "token": "eyJ…",
  "expiraEn": "2026-08-21T23:59:00-03:00",   // jornada + ventana de sincronización tardía
  "sesionAnteriorCerrada": true,             // había otra sesión de este usuario (RNF-14)
  "perfil": {
    "identificador": "cbenite0", "nombreApellido": "Carla Benítez",
    "legajo": "18442", "rol": "operario",
    "distritoAsignado": "Oeste", "puedeFirmar": true
  }
}}
```

**`captorId` viaja en el login y se valida antes de emitir token.** Si el dispositivo está dado de baja (RF-35), la respuesta es `CAPTOR_DE_BAJA` y no hay token. Es el control más temprano y el más barato: un equipo robado no llega ni a pedir datos.

**Una sola sesión activa por usuario, la que abre manda** (RNF-14). La sesión anterior se invalida por `jti` y su siguiente llamada recibe `SESION_DESPLAZADA` — **nunca `NO_AUTENTICADO` a secas**. Son cosas distintas: una significa "alguien entró con tu usuario en otro lado" y la otra "pasó el tiempo", y mostrarlas igual taparía un problema de seguridad con un cartel de red.

**`expiraEn` cubre la jornada más la ventana de sincronización tardía** (H-07). El diseño acepta un dictamen que sube a las once de la noche cuando Background Sync despierta al Service Worker **con la aplicación cerrada**, y a esa hora no hay a quién pedirle una contraseña. Por eso `POST /auth/renovar` se llama al confirmar la jornada, que es la última señal garantizada del día.

**El campo se llama `identificador`, no `email`** (D-09). Es el usuario de red municipal: `gboubon0` — primera letra del nombre, hasta seis del apellido, número correlativo (B-04). El adaptador de Supabase le agrega el dominio reservado `@arbolado.test` puertas adentro.

**`puedeFirmar` se calcula en el servidor** contra `config_firma`, y el front lo usa solo para mostrar u ocultar el botón. La decisión real se vuelve a tomar al firmar: el front valida por comodidad, el backend por obligación.

Ante credenciales incorrectas se devuelve **siempre el mismo mensaje genérico** (RF-01), sin revelar cuál de los dos campos falló.

---

## 3. Reclamos

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` | `/reclamos` | Listado con filtros y paginación |
| `GET` | `/reclamos/{anio}/{nro}` | Ficha completa de un reclamo |
| `GET` | `/reclamos/validar?anio=&nro=` | **Paso 1 obligatorio del dictamen** (RF-12) |
| `GET` | `/reclamos/por-direccion?calle=&altura=` | Consulta por dirección (pedido de la minuta) |
| `POST` | `/reclamos` | Alta por el ingeniero (RF-07, D-18) |
| `PATCH` | `/reclamos/{anio}/{nro}/categoria` | Corregir la categoría inferida (D-47) |
| `PATCH` | `/reclamos/{anio}/{nro}/punto` | Corregir el punto del mapa (D-53) |

### Filtros de `GET /reclamos`

`estado`, `distrito`, `prioridad`, `categoria`, `tormenta`, `antiguedadMinimaMeses`, `soloDisponibles`, `limite`, `desplazamiento`.

**El filtro por distrito es un pedido explícito del cliente**, tanto en el listado como en el dashboard.

```jsonc
// 200 — un ítem del listado
{
  "nroSua": "1234", "anio": 2026,
  "fechaIngreso": "2026-05-02T09:14:00-03:00",
  "direccionExacta": "Mendoza 3450", "distrito": "Centro", "barrio": "Echesortu",
  "descripcionMotivo": "El árbol está inclinado y toca los cables",
  "prioridadVigente": "rojo",
  "senalRiesgoDetectada": "inclinado",
  "categoria": "riesgo_estructural", "categoriaOrigen": "inferida",
  "estadoModulo": "sin_dictaminar",
  "cantidadReclamosEjemplar": 2,
  "punto": { "lat": -32.9512, "lng": -60.6702, "precision": "aproximada" },
  "reserva": { "identificador": "jgutier0", "nombre": "J. Gutiérrez",
               "desde": "2026-08-19T08:12:00-03:00" }
}
```

**`senalRiesgoDetectada` viaja en la respuesta a propósito.** El front puede mostrar por qué ese reclamo está en rojo, y en la defensa se puede abrir cualquier caso urgente y explicar el color con un dato. Nunca hay un color inexplicable.

**`reserva` viene con nombre y hora**, así el listado muestra quién lo tiene y desde cuándo sin otra consulta (D-15). El reclamo reservado **no desaparece** del listado.

**`punto.precision` viaja siempre.** Un reclamo `aproximada` se dibuja distinto; uno `fallida` viene con `punto: null` y el front lo muestra en el listado pero no en el mapa.

### `GET /reclamos/validar` — el primer paso del dictamen

```jsonc
// 200 — disponible
{ "ok": true, "datos": {
  "habilitado": true, "motivo": null,
  "esRedictaminado": false,
  "requiereReserva": true,
  "reclamo": { /* ficha completa para precargar el formulario */ }
}}

// 409 — ya dictaminado
{ "ok": false, "error": {
  "codigo": "RECLAMO_YA_DICTAMINADO",
  "mensaje": "Ese reclamo ya tiene dictamen vigente del 12/03/2026, vence el 12/09/2027",
  "detalle": { "dictamenId": "…", "fechaDictamen": "2026-03-12", "vence": "2027-09-12" }
}}
```

Se valida **en el dispositivo antes de llamar**: número solo dígitos, año dentro del rango configurado. Sin señal, el ingeniero se entera al instante de que se equivocó tipeando, en vez de descubrirlo al recuperar conexión.

---

## 4. Jornada — el flujo de tres pasos

> Decisión D-53 · Desvío DV-16

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `POST` | `/jornadas/preparar` | Define la jornada, **reserva en el mismo paso**, devuelve la propuesta |
| `PATCH` | `/jornadas/{id}` | Ajustes de la pre-confirmación |
| `POST` | `/jornadas/{id}/confirmar` | **Blinda**, renueva la sesión, arma la ruta definitiva y devuelve el paquete offline |
| `POST` | `/jornadas/{id}/cancelar` | Libera todas las reservas y descarta |
| `POST` | `/jornadas/{id}/ampliar` | Suma casos **desde la posición actual** (D-72). Requiere conexión |
| `POST` | `/jornadas/{id}/cerrar` | Cierre anticipado con motivo: desblinda y devuelve a la cola (D-74) |
| `GET` | `/jornadas/{id}/novedades` | Qué cambió mientras estaba en la calle (D-77) |

```jsonc
// POST /api/v1/jornadas/preparar
{
  "criterio": "horas", "valor": 6,
  "zona": { "distrito": "Oeste" },
  "modoTraslado": "auto",
  "modoBalanceo": "por_porcentaje",
  "distribucion": { "rojo": 25, "naranja": 25, "amarillo": 25, "verde": 25 }
}

// 200
{ "ok": true, "datos": {
  "jornadaId": "…", "estado": "pre_confirmada",
  "reservados": 14, "cupoCalculado": 14,
  "paradas": [
    { "orden": 1, "nroSua": "1234", "anio": 2026, "direccion": "Mendoza 3450",
      "prioridad": "rojo", "horaEstimada": "2026-08-20T08:22:00-03:00",
      "punto": {"lat": -32.95, "lng": -60.67, "precision": "aproximada"} }
  ],
  "resumen": { "minutosTraslado": 96, "minutosDictaminacion": 140, "eficienciaPct": 59.3 },
  "redistribuido": [
    { "prioridad": "rojo", "pedidos": 4, "asignados": 2,
      "motivo": "No había más casos rojos disponibles en la zona" }
  ],
  "sinPunto": [ { "nroSua": "5566", "anio": 2025, "direccion": "Pje. Sin Nombre 12",
                  "precision": "fallida" } ],
  "ocupados": [ { "nroSua": "7788", "anio": 2026, "porQuien": "J. Gutiérrez" } ],
  "directivaAplicada": { "id": "…", "nombre": "Campaña Oeste — cableado",
                         "obligatoria": true }
}}
```

### Cuatro cosas que esta respuesta hace bien

**`reservados` viene antes que nada.** Los casos ya están tomados a nombre del ingeniero **antes** de que empiece a revisar (D-53). Puede tomarse el tiempo que necesite sin riesgo de que otro le saque un caso. Si la reserva esperara a la confirmación, el diseño lo estaría apurando justo donde conviene que mire con calma.

**`redistribuido` no se oculta.** Si pidió 25% de urgentes y solo había dos, se dice, con el motivo (RF-25). Una jornada que devuelve otra mezcla sin avisar obliga al ingeniero a contar casos en el mapa para darse cuenta.

**`sinPunto` viene aparte y no se pierde.** Son los reclamos que la geocodificación no pudo resolver: entran al listado pero no a la ruta, y la pantalla de pre-confirmación los destaca para que se resuelvan antes de salir.

**`ocupados` explica lo que falta.** Si se pidieron catorce y entraron doce, el ingeniero ve por qué y quién los tiene.

### Ampliar, cerrar antes, y enterarse a media jornada

```jsonc
// POST /api/v1/jornadas/{id}/ampliar
{ "cantidad": 4, "desde": { "lat": -32.9601, "lng": -60.6712 } }
```

Reserva, blinda, **recalcula la ruta desde donde está parado** —no desde Moreno 2350— y devuelve el paquete de precarga incremental. Requiere conexión, como todo lo que sea tomar trabajo (D-14).

Si una **ventana laboral** (RF-37) lo alcanza, responde `422 FUERA_DE_VENTANA_LABORAL` o `422 CUPO_AGOTADO`, con el texto de por qué: *"desde las 17:00 no se toman reclamos nuevos"*. **Lo que ya tiene tomado no se toca**: sigue dictaminando y sincronizando, fuera de horario si hace falta.

```jsonc
// POST /api/v1/jornadas/{id}/cerrar
{ "motivo": "lluvia" }     // lluvia | urgencia | salud | fin_de_jornada | otro
```

Desblinda lo no visitado y lo **devuelve a la cola en el momento**, disponible para quien esté cerca esa misma tarde, y consolida el resumen (D-56). No espera al vencimiento de las 20:00: serían seis horas de casos fuera de circulación por nada.

```jsonc
// GET /api/v1/jornadas/{id}/novedades
{ "ok": true, "datos": {
  "retirados": [ { "nroSua": "7788", "anio": 2026, "porQuien": "D. Molina",
                   "motivo": "protocolo_tormenta", "cuando": "…" } ],
  "tormentaEnZona": 2
}}
```

**Esto es lo único que el dispositivo *pregunta* durante la jornada.** Hasta acá hablaba con el servidor dos veces —al confirmar y al cerrar— y todo lo demás era cola de salida. Hizo falta porque el Jefe puede forzar el desblindaje de un caso por tormenta (D-70), y el ingeniero tiene que enterarse antes de manejar treinta cuadras hasta un árbol que ya no le corresponde.

Se llama **después de vaciar la cola, nunca antes**: si el celular se queda sin batería en el medio, lo que se salvó es el trabajo de campo y no la lista de novedades.

### Ajustes

```jsonc
// PATCH /api/v1/jornadas/{id}
{ "correcciones": [
    { "tipo": "punto", "nroSua": "5566", "anio": 2025,
      "punto": { "lat": -32.9601, "lng": -60.6712 } },
    { "tipo": "categoria", "nroSua": "1234", "anio": 2026, "categoria": "cableado" },
    { "tipo": "quitar", "nroSua": "7788", "anio": 2026 },
    { "tipo": "orden", "nroSua": "1234", "anio": 2026, "orden": 1 }
] }
```

Cada ajuste recalcula la ruta y devuelve la propuesta actualizada. Quitar un caso **libera su reserva** y lo devuelve a la cola para otro.

**El front llama a este endpoint con espera, no en cada clic** (H-12). Cada ajuste recalcula contra el servicio de ruteo, y el servidor público de OSRM tiene límite de peticiones: se recalcula cuando el ingeniero deja de tocar, con la espera de `minutos_espera_recalculo_ruta`. Para la defensa, el escenario del driver parte de una ruta ya calculada, así una demo no depende de cómo esté un servicio público un martes a la mañana.

### `POST /jornadas/{id}/confirmar` hace cuatro cosas, y el orden importa

```jsonc
// 200
{ "ok": true, "datos": {
  "jornadaId": "…", "estado": "confirmada",
  "blindados": [ { "nroSua": "1234", "anio": 2026 }, … ],
  "blindajeHasta": "2026-08-21T20:00:00-03:00",
  "captorId": "captor-01",
  "token": "eyJ…", "expiraEn": "2026-08-21T23:59:00-03:00",   // sesión renovada
  "paquete": { "reclamos": […], "ruta": {…}, "parametros": {…}, "catalogos": {…} }
}}
```

| Paso | Qué | Por qué acá |
| --- | --- | --- |
| 1 | **Blindar** los reclamos (RF-34) | Nadie más los toca, **y ningún trabajo automático del servidor los modifica** |
| 2 | **Renovar la sesión** | Cubre la sincronización tardía |
| 3 | Armar la ruta definitiva | |
| 4 | Devolver el **paquete de precarga** | Es la última señal garantizada |

**El paso 1 es el que cambia el diseño.** Sin blindaje, `escalar_prioridades` corre a las tres de la mañana y le sube el color a un reclamo que el ingeniero lleva precargado desde ayer a la tarde: al volver, servidor y dispositivo discrepan sobre un dato que él **nunca pudo ver cambiar**. **El dato no se puede mover bajo los pies del que está en la calle.**

`blindados` viene explícito en la respuesta y el front lo guarda: es lo que le permite mostrar en campo, sin señal, qué casos son suyos y hasta cuándo. Y es lo que vuelve **acotada y enumerada** la peor pérdida posible — si el captor no vuelve, el servidor ya sabe exactamente qué se fue con él.

Del lado del cliente, antes de aceptar el paquete se pide `navigator.storage.persist()` y se verifica el espacio (T8 §3). Si no se puede garantizar, **el ingeniero sale igual pero avisado**: no se le bloquea la jornada por una condición del dispositivo, tampoco se lo deja creer que está a salvo.

---

## 5. Dictamen

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `POST` | `/dictamenes` | Emite y firma, **en un solo paso indivisible** |
| `GET` | `/dictamenes/{id}` | Consulta uno |
| `GET` | `/dictamenes?anio=&nro=` | Vigente e historial de un reclamo |
| `POST` | `/dictamenes/{id}/fotos` | Sube una foto y la referencia |
| `POST` | `/dictamenes/{id}/anular` | Anula, solo Administrador, con motivo |
| `GET` | `/dictamenes/borradores` | Los rescatados de un choque (D-16) |
| `POST` | `/dictamenes/{id}/solicitar-anulacion` | El ingeniero la pide; el Administrador la ejecuta (D-69) |
| `GET` | `/dictamenes/duplicados?nroSua=&anio=` | Otros reclamos vigentes del mismo ejemplar (RF-38) |

```jsonc
// POST /api/v1/dictamenes
// Cabecera: Idempotency-Key: 8f2c…   (el mismo uuid que el id del dictamen)
{
  "id": "8f2c…",                          // generado en el DISPOSITIVO
  "nroSua": "1234", "anio": 2026,
  "fechaDictamen": "2026-08-20T10:30:00-03:00",   // reloj del dispositivo
  "especie": "Tipuana tipu",
  "perimetroTronco": 128.5, "alturaAproximada": 9.2,
  "intervencion": {
    "extraccion": [], "trabajosAereos": ["poda de despeje"],
    "trabajosSubterraneos": [], "sinTrabajo": [], "plantar": []
  },
  "complejidad": "media", "urgencia": "programada",
  "sinTrabajoMotivo": null,        // obligatorio SI sinTrabajo tiene contenido
  "cierraDuplicados": [ { "nroSua": "1240", "anio": 2026 } ],   // RF-38, opcional
  "observacionesTecnicas": "…",
  "fotosDeclaradas": 3,                   // cuántas fotos vienen DESPUÉS
  "captorId": "captor-01",
  "firmaTrazo": [                         // vectores de signature_pad.toData(), NO un PNG
    { "color": "#000", "puntos": [ {"x":12,"y":40,"t":0}, {"x":18,"y":37,"t":16} ] }
  ]
}

// 201
{ "ok": true, "datos": {
  "id": "8f2c…",
  "fechaRecepcion": "2026-08-20T18:05:11-03:00",
  "fechaVencimiento": "2028-02-20",
  "hashDocumento": "a3f1…",
  "selloTiempo": "2026-08-20T18:05:11-03:00",
  "firmante": { "nombre": "Carla Benítez", "legajo": "18442", "rol": "operario" },
  "configFirmaVersion": 3,
  "reclamoActualizadoEnOrigen": true,
  "estadoCertificacion": "pendiente",
  "fotosPendientes": 3,
  "discrepanciaReloj": "ninguna",
  "epocaRecomendada": "Invierno (mayo a agosto)"
}}
```

### `firmaTrazo` son vectores y no una imagen (H-05)

Un PNG de `signature_pad` ronda los 20 a 80 KB, y base64 le suma un tercio. Los vectores de `toData()` pesan 2 a 6 KB, se redibujan a cualquier resolución para el PDF y no pierden calidad.

Es una cuestión de coherencia, no de prolijidad: las fotos se comprimen con cuidado a menos de 400 KB **porque subir menos bytes con una barra de señal es la diferencia entre que el envío entre o quede colgado**, y sería absurdo inflar con una imagen el único envío que no puede fallar.

**Sigue embebido en este cuerpo y eso no se toca.** Si viajara como operación separada podría existir, aunque sea por un rato, un dictamen firmado sin firma. La regla es *o el dictamen existe entero y firmado, o no existe*.

### `fotosDeclaradas` y por qué las fotos van al final (H-01)

El cuerpo declara **cuántas fotos vienen**. El servidor crea esa cantidad de filas en estado `esperando` dentro de la misma transacción, y cada `POST /dictamenes/{id}/fotos` completa una. `fotosPendientes` en la respuesta dice cuántas faltan.

El orden es obligatorio, no una preferencia: `dictamen_foto.dictamen_id` es una clave foránea contra `dictamen`. **Si la foto llegara primero, la FK fallaría** y el primer dictamen con fotos que se sincronizara devolvería un error de integridad. El diseño anterior decía lo contrario y estaba mal.

Y conviene operativamente: con una barra de señal sale primero **lo chico y lo valioso**. Un dictamen firmado al que le falta una foto es un dictamen válido con una foto pendiente; una foto sin dictamen no es nada.

### `estadoCertificacion` responde 201, no error (D-65)

Si `config_firma.exigeCertificacion` está encendida y la certificadora no responde, **el dictamen queda firmado igual** con `estadoCertificacion: "pendiente"` y la respuesta es `201`.

**Firmar es local y no puede fallar; certificar sale de nuestra frontera y sí.** La única consecuencia, deliberadamente acotada: ese dictamen **no puede salir en un entregable a concesionarias** hasta certificarse, porque el entregable es donde la validez se ejerce frente a un tercero. Un trabajo reintenta y el Administrador puede forzarlo.

### Un dictamen tiene que decir algo (D-89)

`extraccion`, `trabajosAereos`, `trabajosSubterraneos` y `sinTrabajo` **no pueden estar los cuatro vacíos**: `422 DICTAMEN_VACIO`. Y si `sinTrabajo` tiene contenido, `sinTrabajoMotivo` es obligatorio: `422 SIN_TRABAJO_SIN_MOTIVO`.

Los motivos son `no_requiere_intervencion`, `ejemplar_inexistente`, `ya_intervenido` y `fuera_de_alcance`. **De ese dato depende que el reclamo cierre para siempre**, así que es un enum y no texto libre: ningún trabajo automático puede leer observaciones.

Las reglas de exclusión de RF-14 garantizaban que las intervenciones no se contradijeran; **no garantizaban que hubiera alguna**. Con las cuatro listas vacías el dictamen se firmaba igual: un documento con validez legal que no autoriza nada ni declara que no hace falta nada.

**La respuesta trae `fechaVencimiento: null` cuando el dictamen no autoriza nada** (D-83), y el reclamo pasa a `cerrado_definitivo` en vez de `dictaminado`.

### `cierraDuplicados` cierra los otros reclamos del mismo árbol (RF-38)

`GET /dictamenes/duplicados` devuelve los reclamos vigentes agrupados sobre el mismo ejemplar. **El ingeniero elige cuáles**, y viajan en el cuerpo del dictamen.

Cada uno pasa a `dictaminado` con referencia al dictamen y al reclamo que lo cubrió, así **el vecino recibe respuesta** y la repartición puede rastrear por qué se cerró sin visita propia (D-87).

**El ingeniero elige, no el sistema**: el agrupamiento por calle y altura puede juntar de más —un mismo número catastral con dos árboles— y cerrar un reclamo ajeno por error es peor que dejarlo abierto.

Si `cierre_duplicados_activo` está apagado, el campo se ignora y **el sistema se comporta exactamente como el circuito documentado**.

### `discrepanciaReloj` acepta pero marca (D-67)

`fechaDictamen` es el reloj del celular. Si la diferencia con el reloj del servidor supera las 24 horas, viene `"grave"`: el dictamen **se acepta igual** —no se castiga a nadie por el reloj del equipo que le dieron— pero **el trabajo de vencimientos no lo procesa** hasta que el Administrador confirme o corrija la fecha.

### El `id` lo genera el dispositivo, y es la clave de todo el offline

Si el celular reintenta el envío tres veces porque la señal va y viene, entra **un** dictamen y no tres. Sin esto, la cola offline duplicaría trabajo de campo. La cabecera `Idempotency-Key` lleva el mismo valor: reenviar devuelve la respuesta original en lugar de ejecutar de nuevo.

### `reclamoActualizadoEnOrigen` dice la verdad

Es el paso que actualiza el estado en el SUA (RF-20), y es una llamada a un sistema externo que **no puede participar de la transacción local**. Si falla, el dictamen queda firmado igual, con marca de sincronización pendiente que un job reintenta, y este campo viene en `false`.

Deshacer un dictamen firmado porque el SUA no respondió sería descartar trabajo de campo válido por un problema de red.

### Errores propios de este endpoint

| Código | HTTP | Cuándo |
| --- | --- | --- |
| `ROL_NO_FIRMA` | 403 | El rol no está en `config_firma.roles_habilitados` |
| `SIN_RESERVA_PROPIA` | 409 | El reclamo no está reservado a nombre del actor (D-14) |
| `RECLAMO_YA_DICTAMINADO` | 409 | Otro llegó primero. **La carga se guarda como borrador** (D-16) |
| `INTERVENCIONES_EXCLUYENTES` | 422 | Extracción junto con poda o corte de raíces (RF-14) |
| `CLASIFICACION_CONTRADICTORIA` | 422 | Urgente y a largo plazo a la vez (RF-15) |
| `RECLAMO_BLINDADO` | 409 | Está en la jornada blindada de otro ingeniero (RF-34) |
| `CAPTOR_DE_BAJA` | 403 | El dispositivo fue dado de baja. **La operación queda en cuarentena, no se pierde** |

```jsonc
// 409 con rescate
{ "ok": false, "error": {
  "codigo": "RECLAMO_YA_DICTAMINADO",
  "mensaje": "J. Gutiérrez dictaminó este reclamo a las 09:41. Tu carga quedó guardada como borrador.",
  "detalle": { "borradorId": "…", "dictaminadoPor": "jgutier0",
               "cuando": "2026-08-20T09:41:00-03:00" }
}}
```

---

## 6. Reservas

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `POST` | `/reservas` | Toma uno o varios reclamos. **Requiere conexión** |
| `GET` | `/reservas` | Las propias; el Jefe y el Administrador ven todas |
| `DELETE` | `/reservas/{id}` | Libera una |

Si se piden varios y algunos están tomados, **se reservan los disponibles y se informa cuáles no**: no se cae la operación entera por uno. En la calle, una jornada que falla completa porque un caso estaba ocupado es una jornada perdida.

**Tomar trabajo requiere conexión**, y es la única operación de campo que lo requiere: es pedirle al sistema una asignación exclusiva, y eso no se puede resolver offline.

---

## 7. Rutas y tormenta

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` | `/rutas/{id}` | Ruta con paradas y geometría persistida |
| `POST` | `/rutas/{id}/visitas` | Marca un caso como visitado |
| `GET` | `/tormenta/casos` | Casos etiquetados de los últimos 3 días |
| `POST` | `/tormenta/ruta` | Ruta de mínima distancia, **sin balanceador** |

La sección de tormenta **solo aparece si hay casos**. En el protocolo todos los casos tienen la misma urgencia entre sí (RF-29), así que no se aplican ni la escala de colores ni los cupos por prioridad.

---

## 8. Dashboard

`GET /dashboard?distrito=Oeste`

```jsonc
{ "ok": true, "datos": {
  "totales": { "sinDictaminar": 412, "dictaminados": 88, "reservados": 14 },
  "porPrioridad": { "verde": 210, "amarillo": 120, "naranja": 60, "rojo": 22 },
  "porAntiguedad": { "menos30d": 44, "de30a90d": 120, "de90a365d": 180, "masDe1a": 68 },
  "proximosAVencer": 7,
  "tormentaActiva": false,
  "reservasDelEquipo": [ /* solo Jefe y Administrador */ ]
}}
```

**`porAntiguedad` está por una razón argumental**: es la métrica que muestra el rezago de más de tres años que describe el relevamiento, que es el problema que el proyecto ataca. Un dashboard que no lo muestra no deja ver si el sistema está sirviendo.

El **Lector ve agregados, no detalle**: no accede al texto del vecino ni a la ficha de un reclamo (T10).

---

## 9. Administración

| Método | Ruta | Qué hace | Rol |
| --- | --- | --- | --- |
| `GET` `POST` `PATCH` | `/admin/usuarios` | Roles, distrito, desactivar (RF-31) | Administrador |
| `GET` `PUT` | `/admin/parametros` | Parámetros de negocio (RNF-09) | Administrador |
| `GET` `PUT` | `/admin/adaptadores` | Adaptador activo, **sin desplegar** (RF-32) | Administrador |
| `GET` `PUT` | `/admin/firma-digital` | El apartado único de firma (D-51) | Administrador |
| `GET` `POST` `PATCH` | `/admin/reglas-complejidad` | Los cortes de RF-15 (D-49) | Administrador |
| `GET` `POST` `PATCH` | `/admin/reglas-prioridad` | Matriz de priorización, incluye apagar reglas | Administrador |
| `GET` `POST` `PATCH` | `/directivas` | Directivas de jornada (D-27) | **Jefe** y Administrador |
| `GET` `POST` `PATCH` | `/admin/concesionarias` | Empresas destinatarias. **Sin cuenta ni acceso** (D-54) | Administrador |
| `POST` | `/admin/entregable-concesionaria/proponer` | Arma los paquetes y **no escribe nada** | Administrador |
| `POST` | `/admin/entregable-concesionaria` | Emite el entregable ya ajustado (RF-33) | Administrador |
| `GET` | `/admin/entregable-concesionaria` | Historial, con los que tienen anulaciones marcados | Administrador |
| `GET` `POST` `PATCH` | `/admin/captores` | Alta, asignación y **baja** de dispositivos (RF-35) | Administrador |
| `GET` `POST` | `/admin/cuarentena` | Liberar o descartar lo retenido de un captor de baja (D-63) | Administrador |
| `POST` | `/admin/jornadas/{id}/desblindar` | Libera un blindaje a mano (RF-34) | Administrador |
| `GET` `POST` | `/admin/certificaciones-pendientes` | La cola y el forzado de reintento (D-65) | Administrador |
| `POST` | `/admin/dictamenes/{id}/confirmar-fecha` | Confirma o corrige una fecha con reloj discrepante (D-67) | Administrador |
| `GET` `POST` | `/admin/anulaciones-solicitadas` | Las que pidieron los ingenieros: ejecutar o rechazar (D-69) | Administrador |
| `GET` `POST` `PATCH` | `/ventanas-laborales` | Franja horaria y cupo, por ámbito (RF-37) | **Jefe** y Administrador |
| `GET` | `/admin/usuarios/{id}/pendientes` | Qué queda colgando antes de dar de baja o cambiar rol (D-78) | Administrador |
| `GET` | `/admin/auditoria` | Consulta de acciones sensibles | Administrador |

```jsonc
// POST /api/v1/admin/entregable-concesionaria/proponer   → NO escribe nada
{ "concesionariaId": "…", "zona": {"distrito": "Oeste"},
  "periodo": { "desde": "2026-06-01", "hasta": "2026-08-20" } }

// 200
{ "ok": true, "datos": { "paquetes": [
  { "accion": "extraccion", "complejidad": "alta", "ejemplares": 7, "dictamenes": ["…"] },
  { "accion": "poda",       "complejidad": "baja", "ejemplares": 23, "dictamenes": ["…"] }
], "excluidos": [
  { "motivo": "pendiente_de_certificacion", "cantidad": 2 },
  { "motivo": "vencido", "cantidad": 1 }
] } }
```

`GET /admin/usuarios/{id}/pendientes` **corta el paso antes de desactivar o cambiar el rol** (D-78): devuelve cuántos reclamos tiene blindados, cuántos dictámenes no llegaron al servidor y qué captor tiene asignado. El Administrador libera lo que corresponda y decide si el captor va a cuarentena.

No se libera todo automáticamente porque, si el captor todavía tiene dictámenes firmados sin subir, devolver esos reclamos a circulación permite que **alguien los dictamine de nuevo** — el problema que el blindaje existe para evitar, reintroducido por la puerta de atrás. Y no se bloquea la baja hasta tener todo limpio porque **alguien que ya se fue no va a sincronizar nunca**, y eso dejaría al Administrador sin poder revocarle el acceso.

`POST /ventanas-laborales` devuelve, además de la fila creada, **la consecuencia calculada**: hasta qué hora terminaría de trabajar un ingeniero con esa ventana, y cuántos casos quedarían sin repartir con ese cupo. **Es la mitad del requerimiento (RF-37), no un extra de interfaz**: si el Administrador configura un cupo sin ver el efecto, el requerimiento no evita repartir trabajo en horarios imposibles — solo mueve el problema de la calle al panel.

**Se propone antes de emitir, y no es un detalle técnico.** `/proponer` devuelve los paquetes armados y **no escribe nada**; el Administrador saca lo que no corresponda y recién entonces llama a `POST`. Es el mismo patrón del balanceador (RF-25), de la pre-confirmación de jornada (§4) y de las sugerencias de especie y categoría (D-52): **el sistema propone, la persona ajusta, después confirma.** La repetición conviene decirla en la defensa: el sistema nunca ejecuta sobre una persona una decisión que ella no pudo mirar antes.

**`excluidos` no se oculta**, por el mismo motivo que `redistribuido` en la jornada: si dos dictámenes no entraron porque están pendientes de certificar, se dice. Un entregable que sale con menos ejemplares sin explicar por qué obliga al Administrador a contarlos a mano.

`POST /dictamenes/{id}/anular` devuelve, si corresponde, los entregables afectados y **a qué empresa hay que notificar**. El sistema no puede des-enviar un PDF; lo que no hace es dejarlo pasar en silencio, porque del otro lado hay una autorización de extracción que ya no vale.

```jsonc
// PUT /api/v1/admin/adaptadores
{ "adaptadorRuteo": "google" }
// La próxima ruta se calcula con el otro proveedor. Sin desplegar. Eso ES RF-32.
```

```jsonc
// PUT /api/v1/admin/firma-digital  → crea una VERSIÓN nueva
{ "rolesHabilitados": ["operario","jefe"],
  "exigeCertificacion": false,
  "algoritmoHash": "SHA-256",
  "leyendaPie": "Dictamen técnico emitido conforme Ordenanza 5.118…" }
```

Cambiar la configuración de firma **nunca actualiza la fila anterior**: inserta una versión nueva. Los dictámenes ya firmados siguen apuntando a la versión con la que se firmaron.

---

## 10. Códigos de error, completo

| Código | HTTP | Significado |
| --- | --- | --- |
| `NO_AUTENTICADO` | 401 | Sin token, vencido o usuario desactivado |
| `SESION_DESPLAZADA` | 401 | Otra sesión del mismo usuario tomó el control (RNF-14). **El aviso lo dice con esas palabras** |
| `CAPTOR_DE_BAJA` | 403 | Dispositivo dado de baja (RF-35). Lo enviado **queda en cuarentena** |
| `RECLAMO_BLINDADO` | 409 | Está en la jornada blindada de otro (RF-34) |
| `FECHA_SIN_CONFIRMAR` | 409 | Se quiso vencer un dictamen con reloj discrepante sin confirmar (D-67) |
| `DICTAMEN_SIN_CERTIFICAR` | 422 | Se quiso incluir en un entregable un dictamen pendiente de certificación (D-65) |
| `DICTAMEN_VACIO` | 422 | Ninguna intervención y ningún "sin trabajo" (D-89) |
| `SIN_TRABAJO_SIN_MOTIVO` | 422 | `sinTrabajo` cargado sin motivo taxonómico |
| `FUERA_DE_VENTANA_LABORAL` | 422 | Se quiso tomar trabajo fuera de la franja horaria (RF-37) |
| `CUPO_AGOTADO` | 422 | Se alcanzó el cupo de reclamos del período |
| `RECLAMO_CERRADO_DEFINITIVO` | 409 | Se quiso dictaminar un reclamo cerrado por "sin trabajo" o por duplicado |
| `ROL_SIN_PERMISO` | 403 | El rol no puede ejecutar esta operación |
| `ROL_NO_FIRMA` | 403 | El rol no está habilitado para firmar |
| `RECLAMO_NO_ENCONTRADO` | 404 | El par (N° SUA, año) no existe |
| `RECLAMO_FUERA_DE_ALCANCE` | 404 | No es Reclamo / Problemas con el arbolado público |
| `RECLAMO_YA_DICTAMINADO` | 409 | Tiene dictamen vigente |
| `RESERVA_TOMADA_POR_OTRO` | 409 | Otro lo tiene reservado |
| `SIN_RESERVA_PROPIA` | 409 | No está reservado a nombre del actor |
| `RESERVA_VENCIDA` | 409 | Venció al cierre de la jornada |
| `DICTAMEN_DUPLICADO` | 409 | Índice único de dictamen vigente |
| `DICTAMEN_INMUTABLE` | 409 | Se intentó modificar uno firmado |
| `CONFLICTO_DE_VERSION` | 409 | La jornada cambió entre la lectura y el ajuste |
| `INTERVENCIONES_EXCLUYENTES` | 422 | RF-14 |
| `CLASIFICACION_CONTRADICTORIA` | 422 | RF-15 |
| `DIRECTIVA_OBLIGATORIA_VIOLADA` | 422 | La jornada excede una directiva obligatoria |
| `SIN_PUNTO_GEOGRAFICO` | 422 | Se quiso rutear un reclamo sin punto |
| `SIN_CASOS_DISPONIBLES` | 422 | No hay reclamos que cumplan el filtro |
| `DATOS_INVALIDOS` | 422 | Faltan campos del formulario físico |
| `PARAMETRO_INVALIDO` | 422 | Valor fuera de rango en el panel |
| `PROVEEDOR_NO_DISPONIBLE` | 503 | OSRM o el geocodificador no respondieron |

---

## 11. Qué no expone la API

- **Ningún id interno de Supabase.**
- **El texto del vecino no llega al Lector.** Es dato personal y el rol de consulta ejecutiva no lo necesita.
- **Ninguna URL directa de storage.** Las fotos y las firmas se sirven por URL firmada de vencimiento corto (T10).
- **Ningún dato de otro ingeniero más allá de nombre e identificador** en las reservas: alcanza para coordinar el trabajo y no expone nada más.
