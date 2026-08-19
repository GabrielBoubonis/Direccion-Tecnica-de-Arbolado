# T6 — Contrato de la API

> Diseño técnico · Última actualización: 19/08/2026 · Estado: **sin aprobar**
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
| `POST` | `/auth/login` | Recibe `{identificador, password}`, devuelve token y perfil |
| `POST` | `/auth/logout` | Invalida el token vigente |
| `GET` | `/auth/perfil` | Perfil del usuario de la sesión |

```jsonc
// POST /api/v1/auth/login
{ "identificador": "cbenite0", "password": "…" }

// 200
{ "ok": true, "datos": {
  "token": "eyJ…",
  "expiraEn": "2026-08-19T20:00:00-03:00",
  "perfil": {
    "identificador": "cbenite0", "nombreApellido": "Carla Benítez",
    "legajo": "18442", "rol": "operario",
    "distritoAsignado": "Oeste", "puedeFirmar": true
  }
}}
```

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
| `POST` | `/jornadas/{id}/confirmar` | Cierra, arma la ruta definitiva y devuelve el paquete offline |
| `POST` | `/jornadas/{id}/cancelar` | Libera todas las reservas y descarta |

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
  "observacionesTecnicas": "…",
  "firmaTrazo": "data:image/png;base64,…"
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
  "epocaRecomendada": "Invierno (mayo a agosto)"
}}
```

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
| `POST` | `/admin/entregable-concesionaria` | Genera el export (D-26) | Administrador |
| `GET` | `/admin/auditoria` | Consulta de acciones sensibles | Administrador |

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
