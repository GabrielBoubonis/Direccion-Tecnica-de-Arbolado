# T8 — Offline y sincronización

> Diseño técnico · Última actualización: 19/08/2026 · Estado: **sin aprobar**
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

### Capa 3 — Sincronizador

Vacía la cola en **orden estricto de encolado**. El orden importa: si el alta de un reclamo de oficio se envía después de su dictamen, el servidor rechaza el dictamen por reclamo inexistente.

---

## 4. La cola

```ts
type OperacionEncolada = {
  id: string;                 // uuid generado en el dispositivo = Idempotency-Key
  tipo: 'dictamen' | 'alta_reclamo' | 'foto' | 'visita' | 'correccion_punto';
  cuerpo: unknown;
  creadaEn: string;           // reloj del dispositivo
  intentos: number;
  proximoIntento: string;
  estado: 'pendiente' | 'enviando' | 'confirmada' | 'rechazada';
  errorUltimo?: { codigo: string; mensaje: string };
};
```

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
| 401 | Pide reautenticar y **conserva la cola intacta** |

**Nunca se descarta una operación en silencio.** Toda operación rechazada queda visible en una bandeja con el motivo en castellano y la carga intacta. Veinte minutos de trabajo frente a un árbol no se pierden porque el servidor dijo que no.

---

## 5. Precarga de la jornada

Al **confirmar** la jornada —el último momento con señal garantizada (D-53)— se descarga todo lo necesario para trabajar sin conexión:

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
| El ingeniero cierra la jornada | Se intenta vaciar la cola, se avisa si queda algo |
| Al vencer las reservas (20:00, configurable) | Los reclamos **no visitados vuelven a la cola** (D-24) |
| Un dictamen llega después del vencimiento | **Se acepta igual**, y se registra la discrepancia |

El último punto es importante: si la reserva venció a las ocho de la noche y el dictamen se emitió a las seis pero recién sube a las once, **el trabajo es válido**. La `fecha_dictamen` es la que manda. Rechazarlo sería castigar al ingeniero por la calidad de la señal.

Los reclamos no visitados vuelven a la cola para que **quien esté más cerca mañana** los pueda tomar. Una reserva que no vence sería una forma silenciosa de sacar casos de circulación.

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
| Desinstalar la app con cola pendiente | **Se pierde**. No hay forma de evitarlo desde el navegador |

Declarar las limitaciones es parte del diseño. Un documento que promete que todo funciona siempre no se puede defender.
