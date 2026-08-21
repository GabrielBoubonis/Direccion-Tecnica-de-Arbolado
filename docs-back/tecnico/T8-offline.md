# T8 — Offline y sincronización

> Diseño técnico · Última actualización: 21/08/2026 · Estado: **sin aprobar**
> Reescrito tras la auditoría del 20/08 (H-01, H-05, H-06, H-07, H-08): fotos al final, orden por dependencias, almacenamiento persistente, renovación de sesión y blindaje.
> Responde: cómo funciona la app sin señal — Service Worker, cola durable, precarga, reintentos y reconciliación.

---

## 1. El escenario real, no el ideal

El ingeniero trabaja en la calle, con un **captor** —el celular que le da la Municipalidad, con Android y datos móviles pagos por la repartición (A-04, A-05, D-38)—. Lo que enfrenta:

| Situación | Frecuencia |
| --- | --- |
| **Señal que existe pero no transmite** (una barra, tiempo de espera agotado) | Muy frecuente |
| Celular lento que tarda en responder | Frecuente |
| El navegador cierra la pestaña por falta de memoria | Frecuente en gama baja |
| Batería agotada a mitad del formulario | Ocasional |
| Jornada entera sin conectividad | Ocasional |

**La peor de todas no es la falta de señal: es la señal mala**, donde la petición no falla rápido sino que queda colgada. Un diseño que solo contempla "en línea u fuera de línea" se rompe exactamente ahí, porque el navegador se reporta conectado y la petición nunca vuelve.

Por eso el diseño no pregunta "¿hay internet?": **intenta con un tiempo de espera corto y, si no vuelve, encola**.

---

## 2. El principio que ordena todo

> **Se toma con señal, se ejecuta sin señal** (D-14)

| Operación | ¿Necesita conexión? | Por qué |
| --- | --- | --- |
| Preparar y confirmar la jornada | **Sí** | Reservar es pedir una asignación exclusiva; eso no se resuelve offline |
| Corregir puntos del mapa | **Sí** | Necesita el mapa cargado. Por eso ocurre en la pre-confirmación (D-53) |
| Consultar los reclamos de la jornada | No | Vienen precargados |
| Cargar el dictamen | No | Todo el formulario es local |
| Sacar fotos | No | Quedan en la cola |
| Firmar | No | El hash y el sello los pone el servidor al recibir |
| Dar de alta un reclamo de oficio | No | Un reclamo nuevo no puede estar tomado por nadie |

Que la reserva ocurra siempre con señal es lo que convierte el choque entre ingenieros de **caso normal** en **caso excepcional**. Sin ese principio, dos personas pueden dictaminar el mismo árbol sin enterarse hasta la noche, y una de las dos pierde el trabajo del día.

---

## 3. Las tres capas

```
┌──────────────────────────────────────────────┐
│ 1. Service Worker — la app abre sin red      │
├──────────────────────────────────────────────┤
│ 2. IndexedDB — datos de la jornada + cola    │
├──────────────────────────────────────────────┤
│ 3. Sincronizador — reintentos y orden        │
└──────────────────────────────────────────────┘
```

### Capa 1 — Service Worker

Cachea el armazón de la aplicación: `index.html`, estilos, scripts, tiles del mapa de la zona de la jornada y el SDK.

| Recurso | Estrategia |
| --- | --- |
| Armazón de la app | Caché primero, actualización en segundo plano |
| Tiles del mapa | Caché primero, con límite de tamaño |
| Peticiones `GET` de datos | Red primero con tiempo de espera de 4 segundos, caché como respaldo |
| Peticiones que escriben | **Nunca se cachean**: van a la cola |

Cuatro segundos es deliberado: por debajo se descartan respuestas que iban a llegar; por encima, el ingeniero mira una pantalla congelada. Con señal mala, cuatro segundos es la diferencia entre una app que responde y una que parece rota.

### Capa 2 — IndexedDB

| Almacén | Contenido | Vida |
| --- | --- | --- |
| `jornada` | La jornada confirmada: reclamos, ruta, geometría, paradas | Hasta el cierre |
| `reclamos` | Ficha completa de cada reclamo reservado | Hasta el cierre |
| `parametros` | Minutos por dictamen, reglas, catálogo de especies, cortes de complejidad | Hasta el cierre |
| `cola` | Operaciones pendientes de enviar | Hasta confirmarse |
| `fotos` | Imágenes comprimidas, referenciadas por la cola | Hasta confirmarse |
| `borradores` | Dictámenes a medio cargar | Hasta completarse |

**`borradores` existe por la batería.** Un formulario de dictamen tiene decenas de campos y se completa parado frente a un árbol. Si el celular se apaga a mitad de carga y el formulario vive solo en memoria, se pierden veinte minutos de trabajo. Se guarda en cada cambio, con retardo de un segundo.

### IndexedDB es descartable, y eso hay que pedirle al navegador que no lo sea (H-08)

**Bajo presión de almacenamiento, Android puede vaciar IndexedDB sin avisar y sin preguntar.** Ahí adentro viven dictámenes firmados con validez legal. La única defensa que ofrece la plataforma es pedir almacenamiento persistente:

```ts
// Al confirmar la jornada, antes de precargar
const persistido = await navigator.storage.persist();      // true = el navegador no la descarta
const { quota, usage } = await navigator.storage.estimate();
```

Si `persist()` devuelve `false` o el espacio libre no alcanza para el paquete de la jornada, **el ingeniero sale igual, pero avisado con todas las letras**: se le dice que el navegador puede descartar lo que cargue. No se le bloquea la jornada por una condición del dispositivo; tampoco se lo deja creer que está a salvo.

> **Requisito de despliegue para el CIL: el captor tiene que tener la aplicación instalada como PWA, no abierta en una pestaña.** Chrome en Android concede almacenamiento persistente a las aplicaciones instaladas y se lo niega a las pestañas. Es una condición de instalación, no una recomendación.

Esto no es lo mismo que "storage lleno", que el diseño ya contemplaba: *lleno* es no poder escribir, y esto es que **borren lo ya escrito**. Son dos fallas distintas y solo una de las dos se resuelve avisando.

### Capa 3 — Sincronizador

Vacía la cola **por dependencia declarada, no por orden de llegada** (H-06).

---

## 4. La cola

```ts
type OperacionEncolada = {
  id: string;                 // uuid generado en el dispositivo = Idempotency-Key
  tipo: 'dictamen' | 'alta_reclamo' | 'foto' | 'visita' | 'correccion_punto';
  cuerpo: unknown;
  dependeDe: string[];        // ids de operaciones que TIENEN que confirmarse antes
  creadaEn: string;           // reloj del dispositivo
  intentos: number;
  proximoIntento: string;
  estado: 'pendiente' | 'bloqueada' | 'enviando' | 'confirmada' | 'rechazada';
  errorUltimo?: { codigo: string; mensaje: string };
};

// Orden de despacho: se elige la de mayor prioridad cuyas dependencias ya estén confirmadas
const PRIORIDAD = { dictamen: 0, alta_reclamo: 1, visita: 2, correccion_punto: 3, foto: 4 };
```

### El orden es por dependencia, no FIFO (H-06)

El diseño anterior exigía **orden estricto de encolado**. La justificación era correcta pero acotada: un alta de oficio tiene que entrar antes que el dictamen de ese mismo reclamo, y un dictamen antes que sus fotos. **Eso es una dependencia, no un orden global.**

Con FIFO estricto, **una foto de 400 KB que da timeout bloquea los diez dictámenes que están detrás** — exactamente al revés de lo que conviene con señal mala, donde lo liviano y valioso tiene que salir primero.

`dependeDe` se llena al encolar, no se infiere después: el dictamen de un reclamo de oficio depende del id del alta, y cada foto depende del id de su dictamen. Una operación con dependencias sin confirmar queda `bloqueada` y **no consume intentos ni batería**.

**Las fotos siempre últimas.** Es la prioridad más baja y no hay excepción.

### Idempotencia, que es lo que hace segura la cola

Cada operación lleva un `id` **generado en el dispositivo** que viaja como `Idempotency-Key`. El servidor guarda la respuesta la primera vez; si llega de nuevo, **devuelve la respuesta original en lugar de ejecutar otra vez**.

Sin esto, el escenario clásico rompe todo: el celular envía un dictamen, el servidor lo procesa, la respuesta se pierde en el camino, el celular reintenta. Con idempotencia entra un dictamen. Sin ella, dos.

### Reintentos con espera creciente

```
intento 1: inmediato
intento 2: +5 s      intento 3: +15 s     intento 4: +45 s
intento 5: +2 min    intento 6: +5 min    …tope de 15 min
```

Sin espera creciente, veinte dictámenes reintentando en bucle **agotan la batería**, que en campo es un recurso tan escaso como la señal.

Con Background Sync, el navegador despierta al Service Worker cuando vuelve la conectividad, así que la cola se vacía **con la aplicación cerrada**. Es la diferencia entre que el ingeniero tenga que acordarse de abrir la app y que el trabajo llegue solo.

> **iOS queda fuera del alcance**, y ahora por una **condición real del entorno** y no por conveniencia del equipo: los dispositivos son captores Android provistos por la Municipalidad (A-04). En iOS, Background Sync no existe y el envío con la app cerrada no funciona; ahí la cola se vaciaría al abrir la aplicación. Que la limitación sea heredada del parque de dispositivos —y no una decisión nuestra— es una diferencia importante para la defensa: una condición del entorno se justifica sola.

### Qué pasa cuando el servidor rechaza

| Tipo de error | Qué hace la cola |
| --- | --- |
| Red, tiempo agotado, 5xx | Reintenta con espera creciente |
| 409 `RECLAMO_YA_DICTAMINADO` | **Marca rechazada, guarda el borrador** y avisa (D-16) |
| 409 `SIN_RESERVA_PROPIA` | Marca rechazada y avisa: la reserva venció |
| 422 validación | Marca rechazada y **abre el formulario con lo cargado** para corregir |
| 401 `NO_AUTENTICADO` | Pide reautenticar y **conserva la cola intacta** |
| 401 `SESION_DESPLAZADA` | Igual, pero el mensaje dice **"alguien inició sesión con tu usuario"**, no "sin señal" |
| 403 `CAPTOR_DE_BAJA` | La operación **no se pierde**: el servidor la guarda en cuarentena. El indicador lo dice |

**Nunca se descarta una operación en silencio.** Toda operación rechazada queda visible en una bandeja con el motivo en castellano y la carga intacta. Veinte minutos de trabajo frente a un árbol no se pierden porque el servidor dijo que no.

### La ventana de sincronización tardía (H-07)

Un dictamen cargado a las 16:00 sin señal puede llegar al servidor a las 23:00, cuando el dispositivo pasa por una zona con cobertura y **Background Sync despierta al Service Worker con la aplicación cerrada**.

A esa hora, un token emitido a la mañana ya venció. La respuesta razonable sería "pedir reautenticar", **pero no hay a quién pedírselo**: no hay nadie mirando la pantalla, y el diseño no puede resolver a las once de la noche un problema que tenía que haber previsto a las ocho de la mañana.

Por eso la sesión de servidor **se renueva a la fuerza al confirmar la jornada** (§5), corriendo la ventana lo suficiente como para cubrir la sincronización tardía. Si aun así hace falta reautenticar, la cola **espera**: no reintenta en bucle, no descarta nada, y el indicador dice *"hay que volver a iniciar sesión"* con esas palabras.

**Esto convivía mal con la decisión de T10** de que el vencimiento del token siguiera la jornada. La contradicción era real y está resuelta acá: el token sigue la jornada **más la ventana de sincronización**, y esa ventana existe porque el propio diseño acepta dictámenes que llegan después del cierre.

---

## 5. Precarga de la jornada

Al **confirmar** la jornada —el último momento con señal garantizada (D-53)— pasan cuatro cosas, en este orden:

| Paso | Qué | Por qué acá |
| --- | --- | --- |
| 1 | **Blindar** los reclamos (RF-34) | Nadie más los toca, **y ningún trabajo automático del servidor los modifica** |
| 2 | **Renovar la sesión** de servidor | Cubre la sincronización tardía (§4) |
| 3 | Pedir `storage.persist()` y verificar espacio | Sin esto el navegador puede borrar la cola |
| 4 | **Precargar** el paquete completo | Es la última señal garantizada |

**El paso 1 es el que cambia el diseño.** Sin blindaje, el trabajo nocturno de escalamiento le sube la prioridad a un reclamo a las dos de la mañana mientras el ingeniero lleva en el bolsillo una copia precargada con la prioridad vieja. Al volver, el servidor y el dispositivo discrepan sobre un dato que él nunca pudo ver cambiar. **El dato no se puede mover bajo los pies del que está en la calle.**

Y el blindaje es además lo que vuelve **acotada y conocida** la peor pérdida posible: si el captor no vuelve nunca, el servidor ya sabe exactamente qué reclamos se fueron con él y con quién, y al día siguiente vuelven a circular.

Lo que se descarga:

| Qué | Por qué |
| --- | --- |
| Ficha completa de cada reclamo reservado | El formulario se precarga sin red |
| Geometría de la ruta y paradas con horarios | El mapa funciona sin recalcular |
| Tiles del mapa de la zona | Sin esto, el mapa es un rectángulo gris |
| Parámetros vigentes | Minutos por dictamen, reglas de exclusión |
| Catálogo de especies | El autocompletado de RF-16 funciona offline |
| Cortes de complejidad | La sugerencia de RF-15 funciona offline |

**El plan de datos lo paga la repartición** (A-05), así que no se raciona la descarga: se aprovecha el momento de señal para bajar todo de una vez.

Las **fotos sí se comprimen** antes de subir, y no por costo: subir menos bytes con una barra de señal es la diferencia entre que el envío entre o quede colgado. El cuello de botella en campo es la señal, no la factura.

| Parámetro de compresión | Valor |
| --- | --- |
| Lado mayor | 1600 px |
| Calidad JPEG | 0,75 |
| Peso objetivo | Menos de 400 KB por foto |

A 1600 píxeles se distingue perfectamente una rama quebrada o una vereda levantada, que es para lo que sirve la foto de un dictamen.

### Las fotos van después del dictamen, no antes (H-01)

El diseño decía que las fotos suben **primero**, "para que el dictamen no espere". Estaba mal por dos motivos.

**Rompía la integridad.** `dictamen_foto.dictamen_id` es una clave foránea contra `dictamen`. Si la foto llega primero, la fila del dictamen todavía no existe y la FK falla: **el primer dictamen con fotos que se sincronizara devolvía un error de integridad.**

**Y era peor operativamente.** Con una barra de señal conviene que salga primero lo chico y lo valioso. Un dictamen firmado al que le falta una foto es un dictamen válido con una foto pendiente; una foto sin dictamen no es nada, y encima queda como objeto huérfano en storage.

**Cómo funciona ahora:** el cuerpo del dictamen declara `fotosDeclaradas`, el servidor crea esa cantidad de filas en estado `esperando`, y cada `POST /dictamenes/{id}/fotos` completa una. El objetivo original —que el dictamen no espere a las fotos— se cumple igual.

**Un reclamo dado de alta en la calle también puede llevar fotos** (RF-36), por el mismo camino y con la misma dependencia.

### El trazo de la firma va como vectores (H-05)

```ts
const trazo = firmaPad.toData();   // 2–6 KB de vectores
// NO: firmaPad.toDataURL()        // 20–80 KB de PNG, +33 % por base64
```

Sería incoherente comprimir las fotos con cuidado a menos de 400 KB porque con una barra de señal cada byte decide si el envío entra, y después inflar con un PNG **el único envío que no puede fallar**.

**Sigue embebido en el cuerpo del dictamen y eso no se toca.** Si viajara como operación separada podría existir, aunque sea por un rato, un dictamen firmado sin firma. La regla es *o el dictamen existe entero y firmado, o no existe*. Los vectores se redibujan a cualquier resolución para el PDF, así que no se pierde nada por el camino.

---

## 6. Qué ve el ingeniero

**Un indicador permanente**, siempre visible, con tres estados:

| Estado | Qué dice |
| --- | --- |
| En línea, cola vacía | "Todo sincronizado" |
| Cola con pendientes | "3 dictámenes pendientes de enviar" |
| Sin conexión | "Sin señal — se envía solo cuando vuelva" |

**El ingeniero nunca tiene que decidir si guardar o no.** No hay botón de sincronizar: guarda, y el sistema se encarga. Un botón manual traslada al usuario un problema técnico que no le corresponde, y garantiza que alguna vez alguien se olvide de apretarlo.

Lo que sí puede hacer es **abrir la bandeja de pendientes** y ver qué falta enviar y por qué. Transparencia sin obligación.

---

## 7. Cierre de jornada

| Momento | Qué pasa |
| --- | --- |
| El ingeniero cierra la jornada | Se intenta vaciar la cola. **Si queda algo, aviso destacado**: cuántos son y que están solo en el dispositivo (D-58) |
| Al cerrar | Se **libera el blindaje** y se consolida el resumen de la jornada (D-56) |
| Al vencer las reservas (20:00, configurable) | Los reclamos **no visitados vuelven a la cola** (D-24) |
| Un dictamen llega después del vencimiento | **Se acepta igual**, y se registra la discrepancia |
| Pasadas 48 h con cola pendiente | Aviso al abrir la aplicación, que hay que confirmar para seguir (D-58) |

El último punto es importante: si la reserva venció a las ocho de la noche y el dictamen se emitió a las seis pero recién sube a las once, **el trabajo es válido**. La `fecha_dictamen` es la que manda. Rechazarlo sería castigar al ingeniero por la calidad de la señal.

Los reclamos no visitados vuelven a la cola para que **quien esté más cerca mañana** los pueda tomar. Una reserva que no vence sería una forma silenciosa de sacar casos de circulación.

**El aviso de cola pendiente es escalonado y nunca bloquea el trabajo** (D-58). Pero deja de ser algo que se pueda no ver: son dictámenes firmados, con validez legal, que existen en un solo lugar y ese lugar es un celular.

### Si el captor se apaga en la calle (D-64)

Un usuario tiene **una sola sesión activa** y la sesión **se corta al apagarse el dispositivo** (RNF-14). Con la batería agotada a las 14:00 y sin señal, el ingeniero **no puede seguir cargando esa tarde**: reautenticar exige conexión.

Se evaluó lo contrario —mantener la jornada abierta en el dispositivo y renovar la sesión sola— y se descartó a favor de la seguridad: son documentos legales, el captor puede tener trabajo de otras personas adentro y puede prestarse a un uso indebido.

**Lo ya cargado no se pierde**: la cola y los borradores viven en IndexedDB y se envían cuando el ingeniero vuelve a autenticarse. Lo que se pierde es la posibilidad de seguir cargando. La mitigación es **operativa**: el captor sale de la sede cargado y conviene prever batería externa.

---

## 8. Reconciliación al volver

Al recuperar señal, el orden es:

1. **Vaciar la cola** (escrituras primero: lo que hizo el ingeniero es lo más valioso).
2. **Refrescar la jornada**: qué se dictaminó, qué reservas siguen vivas.
3. **Avisar de los cambios**: "el reclamo 1234/2026 lo dictaminó J. Gutiérrez".
4. **Actualizar parámetros** en segundo plano.

Las escrituras van primero por una razón simple: si el celular se queda sin batería en el medio, lo que se salvó es el trabajo de campo y no la lista de novedades.

---

## 9. Qué NO resuelve este diseño, dicho de frente

| Limitación | Por qué se acepta |
| --- | --- |
| **iOS** | Background Sync no existe; los dispositivos son Android provistos (A-04) |
| Dos dictámenes offline del mismo reclamo por distintos ingenieros | La reserva previa lo vuelve excepcional; si pasa, se rescata como borrador (D-16) |
| Reloj del dispositivo mal configurado | Se registra la discrepancia en auditoría, no se rechaza el trabajo |
| Storage del navegador lleno | Se avisa al confirmar la jornada, antes de salir |
| **El navegador descarta IndexedDB** | Se mitiga con `storage.persist()` y con la app instalada como PWA. **Si el navegador igual la descarta, se pierde** |
| Desinstalar la app con cola pendiente | **Se pierde**. No hay forma de evitarlo desde el navegador |
| **El captor no vuelve nunca** | Se pierde el trabajo de esa jornada. El blindaje deja la pérdida **acotada y enumerada**, y los reclamos vuelven a circular al día siguiente |
| **Apagado del captor sin señal** | No se puede seguir cargando esa tarde. Decisión de seguridad asumida (D-64), mitigación operativa |

Declarar las limitaciones es parte del diseño. Un documento que promete que todo funciona siempre no se puede defender.
