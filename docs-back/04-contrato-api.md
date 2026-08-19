# Contrato de API

> Última actualización: 18/08/2026 · Estado: **en diseño, sin aprobar**

El contrato es la **frontera estable** del sistema. El front conoce esto y nada más: no sabe que existe Supabase, ni Postgres, ni OSRM. El día que cambien los adaptadores, este documento no cambia.

Base: `/functions/v1/` del proyecto Supabase. El front lee la URL de configuración, nunca la tiene escrita adentro.

---

## 1. Convenciones

**Autenticación.** Todo endpoint excepto `login` exige `Authorization: Bearer <token>`. Sin token vigente no se accede a nada (RF-01, RNF-05).

**Idempotencia.** Toda operación que escribe acepta el encabezado `Idempotency-Key`. Si llega dos veces la misma clave, se devuelve la respuesta original en lugar de ejecutar de nuevo. Es lo que vuelve segura la cola offline: el celular puede reintentar cuantas veces quiera.

**Errores.** Siempre el mismo formato, con un código estable que el front puede interpretar:

```json
{ "error": { "codigo": "RECLAMO_YA_DICTAMINADO",
             "mensaje": "El reclamo 4821/2024 ya fue dictaminado.",
             "detalle": { "dictaminado_por": "Pérez", "fecha": "2026-08-14T10:22:00Z" } } }
```

El `mensaje` es para mostrar; el `codigo` es para decidir. El front nunca debe leer el texto para tomar una decisión.

**Fechas** en ISO 8601 con zona. **Paginación** por `pagina` y `tamanio`, con `total` en la respuesta.

**Códigos HTTP**: `200` bien · `201` creado · `400` entrada inválida · `401` sin token o vencido · `403` rol insuficiente · `409` conflicto de negocio (ya dictaminado, ya reservado) · `422` regla de negocio violada (intervenciones contradictorias) · `429` demasiados intentos.

La distinción entre `409` y `422` importa: el `409` significa "llegaste tarde, otro lo hizo"; el `422` significa "lo que mandaste es incoherente". El front reacciona distinto a cada uno.

---

## 2. Autenticación

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `POST` | `/auth/login` | Recibe `{identificador, password}`, devuelve token y perfil con rol y si ese rol puede firmar |
| `POST` | `/auth/logout` | Invalida el token vigente |
| `GET` | `/auth/perfil` | Perfil del usuario de la sesión |

Ante credenciales incorrectas se devuelve **siempre el mismo mensaje genérico**, sin revelar si falló el usuario o la contraseña (RF-01). Los intentos fallidos se limitan por tasa.

El campo se llama `identificador`, no `email`, y esa decisión (D-09) se confirmó sola: los agentes municipales entran a los sistemas internos con **usuario de red**, con la forma `gboubon0` — primera letra del nombre, hasta seis del apellido, número correlativo (B-04). No hay nada que rehacer en el contrato.

Lo que sí cambia es la **pantalla de acceso**: hoy dice "Correo Institucional / Legajo" con un ejemplo de correo, y tiene que decir "Usuario" con un ejemplo del formato real. El adaptador de Supabase, que internamente necesita un correo, le agrega el dominio reservado `@arbolado.test` puertas adentro.

---

## 3. Reclamos

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` | `/reclamos` | Listado filtrable de los derivados a Arbolado sin dictaminar (RF-07) |
| `GET` | `/reclamos/{nroSua}/{anio}` | Un reclamo puntual con su estado, prioridad y reserva |
| `GET` | `/reclamos/buscar?direccion=` | Consulta por dirección (pedido de la minuta) |
| `POST` | `/reclamos/{nroSua}/{anio}/validar` | Paso previo obligatorio del dictamen (RF-12) |
| `POST` | `/reclamos` | Alta de oficio, a pedido de vecino, o de tormenta |

**Filtros combinables** (RF-09): `prioridad`, `distrito`, `barrio`, `categoria`, `antiguedad_meses`, `tormenta`, `estado`, `reservado_por`. Orden por defecto: prioridad descendente, urgente primero.

Cada reclamo del listado incluye **por qué tiene la prioridad que tiene** — la señal de riesgo detectada, la cantidad de reclamos sobre el mismo ejemplar y los escalamientos aplicados. Un color sin explicación es un color que nadie va a respetar.

También incluye el estado de reserva: si está tomado, por quién y desde cuándo (D-15).

`POST /reclamos/{nroSua}/{anio}/validar` responde `200` con los datos precargados si existe y está sin dictaminar, o `409` con el motivo si no. Es exactamente el primer paso del diagrama de secuencia 8.1-B.

---

## 4. Reservas de trabajo

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `POST` | `/reservas` | Toma uno o varios reclamos para el usuario. **Requiere conexión** |
| `POST` | `/jornadas/preparar` | Define la jornada, **reserva en el mismo paso** y devuelve la propuesta a pre-confirmar |
| `PATCH` | `/jornadas/{id}` | Los ajustes de la pre-confirmación: corregir puntos, sacar casos, corregir categoría, reordenar |
| `POST` | `/jornadas/{id}/confirmar` | Cierra la jornada, arma la ruta definitiva y devuelve el paquete de precarga offline |
| `GET` | `/reservas/mias` | Las reservas activas del usuario |
| `DELETE` | `/reservas/{id}` | Libera una reserva propia |

Si un reclamo ya está tomado, responde `409` indicando quién lo tiene. Si se piden varios y algunos están tomados, **se reservan los disponibles y se informa cuáles no** — no se cae la operación entera por uno.

---

## 5. Dictamen

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `POST` | `/dictamenes` | Crea y firma el dictamen. Requiere `Idempotency-Key` |
| `GET` | `/dictamenes/{id}` | Consulta uno |
| `GET` | `/dictamenes` | Listado filtrable, incluye próximos a vencer |
| `POST` | `/dictamenes/{id}/anular` | Solo Administrador. Anula para permitir uno nuevo |

`POST /dictamenes` valida en orden: reserva propia vigente, rol habilitado para firmar según `config_firma`, coherencia de intervenciones (RF-14, RF-15). Recién entonces firma. Todo ocurre **en un solo paso indivisible**: o el dictamen queda entero y firmado con el reclamo actualizado y la reserva liberada, o no queda nada.

Devuelve el hash, el sello de tiempo y la fecha de vencimiento calculada. **No existe `PUT` ni `DELETE`**: un dictamen firmado es inmutable (RF-19, RNF-06).

Las fotos se suben aparte y se referencian por identificador, para que un reintento no reenvíe megabytes.

---

## 6. Rutas

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `POST` | `/rutas/planificar` | Arma la jornada: selecciona casos, los reserva, calcula el orden y devuelve todo |
| `GET` | `/rutas/mias` | Rutas del usuario, filtrables por fecha |
| `GET` | `/rutas/{id}` | Una ruta con su detalle y su geometría |
| `PATCH` | `/rutas/{id}/detalle/{detalleId}` | Marca una parada como visitada |
| `POST` | `/rutas/{id}/cerrar` | Cierra la jornada y libera lo no visitado (D-24) |

`POST /rutas/planificar` recibe zona (distrito y barrio opcional), criterio (horas o cantidad), modo de traslado y distribución del balanceador. Devuelve el orden de visita, el horario estimado de cada parada, el desglose entre traslado y dictaminación, el porcentaje de eficiencia, la geometría del recorrido y **bajo qué directiva se armó** (RF-26, D-28).

**La ruta se devuelve ya calculada y se guarda.** El front la dibuja y no la recalcula nunca: es el pedido de la minuta de que el mapa no se reinicie durante la jornada.

Si una directiva obligatoria alcanza al usuario, los parámetros fuera de su alcance se rechazan con `422` explicando qué directiva lo impide.

---

## 7. Tormenta

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` | `/tormenta/casos` | Casos etiquetados de los últimos 3 días, con filtro por fecha |
| `POST` | `/tormenta/ruta` | Ruta de emergencia por mínima distancia |

`GET /tormenta/casos` devuelve la cantidad para el badge de navegación. **Si no hay casos devuelve una lista vacía y el front oculta la sección** (RF-28). No se aplica balanceador ni escala de colores (RF-29).

---

## 8. Dashboard

`GET /dashboard?distrito=` devuelve las tres métricas de RF-03, el desglose por prioridad y por distrito de RF-04, y las alertas de RF-05: dictámenes por vencer y casos de tormenta pendientes.

**Se calcula en el backend**, no en el front. Es lo que permite filtrar por distrito sin traerse todos los reclamos al navegador, que era el pedido de la minuta.

---

## 9. Administración

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` `POST` `PATCH` | `/admin/usuarios` | Vincula cuentas a roles, desactiva (RF-31) |
| `GET` `PUT` | `/admin/firma-digital` | El apartado único de firma: roles habilitados, certificadora, hash, leyenda del pie (D-51) |
| `GET` `POST` `PATCH` | `/admin/reglas-complejidad` | Los cortes de diámetro y altura de RF-15 (D-49) |
| `GET` `PUT` | `/admin/parametros` | Parámetros de negocio (RNF-09) |
| `GET` `POST` `PATCH` | `/admin/directivas` | Directivas de jornada (D-27) |
| `GET` `POST` `PATCH` | `/admin/reglas-prioridad` | Matriz de priorización, incluye activar y desactivar reglas |
| `GET` `PUT` | `/admin/adaptadores` | Selección del adaptador activo, sin deploy (RF-32) |
| `POST` | `/admin/entregable-concesionaria` | Genera el export (D-26) |
| `GET` | `/admin/auditoria` | Consulta el registro de acciones sensibles |

`PUT /admin/adaptadores` es el endpoint que demuestra RF-32 en vivo: se cambia el proveedor de ruteo y la próxima planificación usa el otro, sin reiniciar nada.

---

## 10. Sincronización

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` | `/sync/paquete-jornada` | Todo lo que el dispositivo necesita para trabajar sin señal |
| `POST` | `/sync/lote` | Envía la cola acumulada offline |

`GET /sync/paquete-jornada` devuelve la ruta del día, los reclamos reservados con todos sus datos, los parámetros vigentes y las listas de opciones del formulario. Se pide una vez, con señal, antes de salir a la calle.

`POST /sync/lote` recibe las operaciones encoladas y devuelve el resultado **de cada una por separado**. Que una falle no invalida las demás: si el dictamen 3 choca porque el reclamo ya estaba dictaminado, los otros cuatro entran igual.

Detalle en `06-offline-y-sincronizacion.md`.

---

## 11. Lo que el contrato deliberadamente no expone

- **Ningún identificador interno de Supabase.** El front habla de reclamos por (N° SUA, año), no por id de fila.
- **Ninguna tabla.** No hay endpoints genéricos tipo `/tabla/{nombre}`: cada endpoint es un caso de uso con nombre propio.
- **Ningún dato de vecino que no haga falta** para la tarea del ingeniero.

Estas tres ausencias son lo que permite cambiar todo lo de abajo sin tocar el front.
