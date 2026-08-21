# Contrato de API

> Última actualización: 21/08/2026 · Estado: **en diseño, sin aprobar**
> Absorbe **D-54 a D-67** y los hallazgos de la auditoría del 20/08: RF-33 a RF-36 y RNF-14.

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

**Códigos de error estables que el front tiene que saber distinguir.** No es una lista decorativa: de cada uno se desprende una pantalla distinta.

| Código | Cuándo | Qué hace el front |
| --- | --- | --- |
| `RECLAMO_YA_DICTAMINADO` | 409 en el paso previo o al enviar | Ofrece guardar como borrador, no descarta la carga |
| `RESERVA_TOMADA_POR_OTRO` | 409 al tomar trabajo | Muestra quién lo tiene y desde cuándo |
| `RECLAMO_BLINDADO` | 409 sobre un caso de otra jornada | Igual que el anterior, más el dispositivo |
| `SIN_RESERVA_PROPIA` | 409 al enviar un dictamen | No se dictamina lo que no se tomó |
| `INTERVENCIONES_EXCLUYENTES` | 422 | Marca las casillas en conflicto (RF-14) |
| `ROL_NO_FIRMA` | 403 | El rol no firma según `config_firma` |
| `SESION_DESPLAZADA` | 401 | **Otra sesión del mismo usuario tomó el control** (RNF-14). Pide reautenticar con ese texto, no como "sin señal" |
| `NO_AUTENTICADO` | 401 | Pide reautenticar; la cola espera, no descarta |
| `CAPTOR_DE_BAJA` | 403 al sincronizar | Avisa que el envío quedó **en cuarentena**, no perdido |
| `DIRECTIVA_OBLIGATORIA_VIOLADA` | 422 al planificar | Explica qué directiva lo impide |
| `SIN_PUNTO_GEOGRAFICO` | 422 al armar ruta | Manda a corregir el punto en la pre-confirmación |

Los nombres son los canónicos de `tecnico/T6-api-http.md` §10, que es el contrato técnico completo. El `mensaje` se muestra; el `codigo` decide. **`SESION_DESPLAZADA` y `NO_AUTENTICADO` no se pueden confundir**: uno significa "alguien entró con tu usuario en otro lado" y el otro "pasó el tiempo". Mostrarlos igual sería tapar un problema de seguridad con un cartel de red.

---

## 2. Autenticación

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `POST` | `/auth/login` | Recibe `{identificador, password, captor_id}`, devuelve token y perfil con rol y si ese rol puede firmar |
| `POST` | `/auth/logout` | Invalida el token vigente |
| `GET` | `/auth/perfil` | Perfil del usuario de la sesión |
| `POST` | `/auth/renovar` | Renueva la sesión. Se llama **a la fuerza al confirmar la jornada** |

**Una sola sesión activa por usuario (RNF-14).** Al iniciar sesión, cualquier otra sesión de ese usuario se cierra: **la que abre manda**. La sesión desplazada recibe `SESION_DESPLAZADA` en su siguiente llamada, y el front lo dice con esas palabras.

**`captor_id` viaja en el login.** Si el dispositivo está dado de baja (RF-35), el login se rechaza con `CAPTOR_DE_BAJA` y no se emite token. Es el control más barato y el más temprano: un equipo robado no llega ni a pedir datos.

`POST /auth/renovar` existe por un motivo concreto (H-07): el diseño acepta que un dictamen suba a las once de la noche, pero a esa hora el token de la mañana ya venció, y si el envío lo despertó el Service Worker con la app cerrada **no hay a quién pedirle la contraseña**. Renovar al confirmar la jornada corre la ventana hasta cubrir la sincronización tardía.

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
| `POST` | `/reclamos/{nroSua}/{anio}/fotos` | Sube una foto del alta en campo (RF-36) |

**Filtros combinables** (RF-09): `prioridad`, `distrito`, `barrio`, `categoria`, `antiguedad_meses`, `tormenta`, `estado`, `reservado_por`. Orden por defecto: prioridad descendente, urgente primero.

Cada reclamo del listado incluye **por qué tiene la prioridad que tiene** — la señal de riesgo detectada, la cantidad de reclamos sobre el mismo ejemplar y los escalamientos aplicados. Un color sin explicación es un color que nadie va a respetar.

También incluye el estado de reserva: si está tomado, por quién y desde cuándo (D-15).

`POST /reclamos/{nroSua}/{anio}/validar` responde `200` con los datos precargados si existe y está sin dictaminar, o `409` con el motivo si no. Es exactamente el primer paso del diagrama de secuencia 8.1-B.

`POST /reclamos` acepta `fotos_declaradas`: cuántas fotos vienen atrás. **Un reclamo abierto en la calle puede llevar evidencia** (RF-36), y durante el protocolo de tormenta es cuando más importa — un árbol caído cortando una calle se documenta cuando se lo ve, no tres días después.

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

`POST /jornadas/{id}/confirmar` hace cuatro cosas en un solo paso, y el orden importa (§8 bis de reglas):

1. **Blinda** los reclamos a nombre del usuario y del captor (RF-34). Desde ese momento ningún job automático los toca.
2. **Renueva la sesión** de servidor.
3. Arma la ruta definitiva.
4. Devuelve el **paquete de precarga offline** completo.

La respuesta incluye `blindaje_hasta` y la lista exacta de reclamos blindados. El front la guarda: es lo que le permite mostrar en campo, sin señal, qué casos son suyos y hasta cuándo.

`PATCH /jornadas/{id}` se llama **con espera entre pedidos**, no en cada clic: cada ajuste recalcula la ruta y el servicio de ruteo tiene límite de peticiones (H-12).

---

## 5. Dictamen

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `POST` | `/dictamenes` | Crea y firma el dictamen. Requiere `Idempotency-Key` |
| `GET` | `/dictamenes/{id}` | Consulta uno |
| `GET` | `/dictamenes` | Listado filtrable, incluye próximos a vencer |
| `POST` | `/dictamenes/{id}/fotos` | Sube una foto. Se llama **después** de que el dictamen entró (RF-17) |
| `POST` | `/dictamenes/{id}/anular` | Solo Administrador. Anula para permitir uno nuevo |
| `GET` | `/dictamenes/borradores` | Los propios, con los inactivos en bandeja aparte (D-57) |
| `DELETE` | `/dictamenes/borradores/{id}` | Lo descarta **el ingeniero**, nunca el sistema |

`POST /dictamenes` valida en orden: reserva propia vigente, rol habilitado para firmar según `config_firma`, coherencia de intervenciones (RF-14, RF-15). Recién entonces firma. Todo ocurre **en un solo paso indivisible**: o el dictamen queda entero y firmado con el reclamo actualizado y la reserva liberada, o no queda nada.

Devuelve el hash, el sello de tiempo, la fecha de vencimiento calculada y `estado_certificacion`. **No existe `PUT` ni `DELETE`**: un dictamen firmado es inmutable (RF-19, RNF-06).

**El trazo de la firma viaja embebido en el cuerpo, y como vectores** (H-05). El campo `firma_trazo` lleva la salida de `signature_pad.toData()` —listas de puntos, 2 a 6 KB— y no un PNG en base64, que ronda los 80 KB. Embebido y no como operación aparte, porque si viajara suelto podría existir un dictamen firmado sin firma; vectorial y no PNG, porque sería incoherente comprimir las fotos con cuidado a menos de 400 KB y después inflar con una imagen el único envío que no puede fallar.

**Las fotos van después del dictamen, no antes (H-01).** El cuerpo declara `fotos_declaradas`; el servidor crea esa cantidad de filas en estado `esperando` y cada `POST /dictamenes/{id}/fotos` completa una. La respuesta de `POST /dictamenes` informa `fotos_pendientes`.

El orden es obligatorio y no es una preferencia: `dictamen_foto.dictamen_id` es una clave foránea contra `dictamen`. **Si la foto llegara primero, la FK fallaría** y el primer dictamen con fotos que se sincronice devolvería un error de integridad. Además conviene operativamente: con una barra de señal, lo chico y valioso sale primero.

**Certificación.** Si `config_firma.exige_certificacion` está encendida y la certificadora no responde, el dictamen **queda firmado igual** con `estado_certificacion = pendiente` y `POST /dictamenes` responde `201`, no error. Firmar es local y no puede fallar; certificar sale de nuestra frontera y sí (D-65). Lo único que ese dictamen no puede hacer es salir en un entregable a concesionarias.

---

## 6. Rutas

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `POST` | `/rutas/planificar` | Arma la jornada: selecciona casos, los reserva, calcula el orden y devuelve todo |
| `GET` | `/rutas/mias` | Rutas del usuario, filtrables por fecha |
| `GET` | `/rutas/{id}` | Una ruta con su detalle y su geometría |
| `PATCH` | `/rutas/{id}/detalle/{detalleId}` | Marca una parada como visitada |
| `POST` | `/rutas/{id}/cerrar` | Cierra la jornada, **libera el blindaje** y devuelve lo no visitado a la cola (D-24) |

`POST /rutas/planificar` recibe zona (distrito y barrio opcional), criterio (horas o cantidad), modo de traslado y distribución del balanceador. Devuelve el orden de visita, el horario estimado de cada parada, el desglose entre traslado y dictaminación, el porcentaje de eficiencia, la geometría del recorrido y **bajo qué directiva se armó** (RF-26, D-28).

**La ruta se devuelve ya calculada y se guarda.** El front la dibuja y no la recalcula nunca: es el pedido de la minuta de que el mapa no se reinicie durante la jornada.

Si una directiva obligatoria alcanza al usuario, los parámetros fuera de su alcance se rechazan con `422` explicando qué directiva lo impide.

`POST /rutas/{id}/cerrar` **consolida antes de cerrar**: escribe el resumen de la jornada —casos, kilómetros, eficiencia, directiva aplicada— que se conserva indefinidamente, aunque el detalle parada por parada se purgue a los 90 días (D-56). Si la respuesta del cierre trae `cola_pendiente > 0`, el front muestra el aviso destacado de D-58: cuántos son y que **están solo en el dispositivo**.

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
| `GET` `POST` `PATCH` | `/admin/concesionarias` | Alta y mantenimiento de empresas destinatarias. **Sin cuenta ni acceso** (D-54) |
| `POST` | `/admin/entregable-concesionaria/proponer` | Arma los paquetes y **devuelve la propuesta, sin emitir nada** |
| `POST` | `/admin/entregable-concesionaria` | Emite el entregable ya ajustado (RF-33) |
| `GET` | `/admin/entregable-concesionaria` | Historial de emisiones, con las que tienen anulaciones marcadas |
| `GET` `POST` `PATCH` | `/admin/captores` | Alta, asignación y **baja** de dispositivos (RF-35) |
| `GET` `POST` | `/admin/cuarentena` | Operaciones retenidas de un captor de baja: liberar o descartar (D-63) |
| `POST` | `/admin/jornadas/{id}/desblindar` | Libera un blindaje a mano (RF-34) |
| `GET` `POST` | `/admin/certificaciones-pendientes` | La cola de certificación y el forzado de reintento (D-65) |
| `POST` | `/admin/dictamenes/{id}/confirmar-fecha` | Confirma o corrige una fecha con discrepancia de reloj (D-67) |
| `GET` | `/admin/auditoria` | Consulta el registro de acciones sensibles |

`PUT /admin/adaptadores` es el endpoint que demuestra RF-32 en vivo: se cambia el proveedor de ruteo y la próxima planificación usa el otro, sin reiniciar nada.

**El entregable se emite en dos pasos, y no es un detalle técnico.** `/proponer` devuelve los paquetes armados —cuántos, de qué tipo, cuántos ejemplares cada uno— y **no escribe nada**. El Administrador saca lo que no corresponda y recién entonces llama a `POST`. Es el mismo patrón del balanceador y de la pre-confirmación de jornada: **el sistema propone, la persona ajusta, después confirma.**

`POST /dictamenes/{id}/anular` devuelve, si corresponde, la lista de entregables afectados y **a qué empresa hay que notificar**. El sistema no puede des-enviar un PDF; lo que no hace es dejarlo pasar en silencio.

`POST /admin/captores` con baja **no descarta nada de lo que ese equipo tenga adentro**: si el captor intenta sincronizar, sus operaciones caen en `/admin/cuarentena` y una persona decide. Un equipo robado no debe escribir dictámenes; uno olvidado y recuperado puede traer trabajo válido.

---

## 10. Sincronización

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` | `/sync/paquete-jornada` | Todo lo que el dispositivo necesita para trabajar sin señal |
| `POST` | `/sync/lote` | Envía la cola acumulada offline |

`GET /sync/paquete-jornada` devuelve la ruta del día, los reclamos reservados con todos sus datos, los parámetros vigentes y las listas de opciones del formulario. Se pide una vez, con señal, antes de salir a la calle.

`POST /sync/lote` recibe las operaciones encoladas y devuelve el resultado **de cada una por separado**. Que una falle no invalida las demás: si el dictamen 3 choca porque el reclamo ya estaba dictaminado, los otros cuatro entran igual.

**Cada operación declara de qué depende, y ese es el único orden que el servidor respeta (H-06).** No hay orden global de llegada. La prioridad es:

`dictamen` → `alta_reclamo` → `visita` → `correccion_punto` → `foto`

Con un FIFO estricto, **una foto de 400 KB que da timeout bloquea los diez dictámenes que están detrás** — exactamente al revés de lo que conviene con señal mala. Lo que sí es una dependencia real es que un alta de oficio entre antes que el dictamen de ese mismo reclamo, y que un dictamen entre antes que sus fotos: eso se declara por operación, no se impone como orden general.

Si el token venció mientras la cola esperaba, `/sync/lote` responde `NO_AUTENTICADO` y **la cola no descarta nada**: espera a que haya alguien que pueda reautenticar.

Detalle en `06-offline-y-sincronizacion.md`.

---

## 11. Lo que el contrato deliberadamente no expone

- **Ningún identificador interno de Supabase.** El front habla de reclamos por (N° SUA, año), no por id de fila.
- **Ninguna tabla.** No hay endpoints genéricos tipo `/tabla/{nombre}`: cada endpoint es un caso de uso con nombre propio.
- **Ningún dato de vecino que no haga falta** para la tarea del ingeniero.

Estas tres ausencias son lo que permite cambiar todo lo de abajo sin tocar el front.
