# Requerimientos del front y contrato de conexión

> Última actualización: 21/08/2026 · Estado: **para trabajar**
> **Destinatario: Ale.** Es la lista de lo que el front tiene que tener, y la forma exacta con la que le van a llegar los datos.
> No dice cómo se ve. Dice qué tiene que existir y qué recibe cada cosa.

---

## 0. Cómo usar esto

**Todo lo de acá se puede hacer hoy, sin backend.** Cada pantalla de §3 trae el **objeto exacto** que le va a llegar. Si el mock devuelve ese objeto, el día que se conecte el SDK **lo único que cambia es de dónde sale**.

```js
// Hoy
async function traerReclamos(filtros) { return MOCK.reclamos; }

// El día de la conexión
async function traerReclamos(filtros) { return api.reclamos.listar(filtros); }
```

**Ese es el único consejo importante del documento**: que el mock ya devuelva la forma final. Todo lo demás son detalles.

Las secciones son independientes entre sí y están pensadas para repartir: cada una de §3 es un trabajo que alguien puede tomar solo, sin pisar a los demás.

**Los desvíos y la actualización del `.docx` se ven después.** Esto es para construir.

---

## 1. Quién calcula qué

**El back hace todos los cálculos. El front muestra y valida por comodidad.**

| Se queda en el front | Se va al back |
| --- | --- |
| Mostrar, ordenar y filtrar lo que ya tiene en pantalla | Cualquier cosa que dependa de **otros registros** que no están en pantalla |
| Deshabilitar casillas que se contradicen | Cualquier cosa que dependa del **tiempo** (escalar, vencer) |
| Avisar que falta completar un campo | Cualquier cosa que dependa de **otros usuarios** (reservar, blindar) |
| Formatear fechas, números y colores | Cualquier número que salga en un **documento legal** |
| El mapa, la firma, el GPS, la cámara | El orden de una ruta, la eficiencia, el reparto por prioridad |

**La regla en una línea:** si para calcularlo hace falta mirar algo que no está en la pantalla, lo calcula el back.

**Las validaciones se duplican a propósito y eso no es redundancia.** El front deshabilita casillas para que el ingeniero no se equivoque; el back vuelve a validar porque no puede confiar en el navegador. Un dictamen es un documento con validez legal: su coherencia no puede depender de que el JavaScript se haya ejecutado.

---

## 2. La forma de todo

### Toda respuesta tiene la misma envoltura

```jsonc
// Bien
{ "ok": true, "datos": { ... } }

// Mal
{ "ok": false, "error": {
    "codigo": "RECLAMO_YA_DICTAMINADO",
    "mensaje": "J. Gutiérrez dictaminó este reclamo a las 09:41.",
    "detalle": { ... }
}}
```

**`mensaje` se muestra. `codigo` decide.** Nunca leer el texto para tomar una decisión: el texto puede cambiar, el código no.

### Listados

```jsonc
{ "ok": true, "datos": {
  "items": [ ... ],
  "pagina": 1, "tamanio": 20, "total": 143
}}
```

### Fechas

ISO 8601 con zona: `"2026-08-21T10:30:00-03:00"`. El front formatea.

### Sesión

El token va en `Authorization: Bearer …`. Lo maneja el SDK, no las pantallas.

---

## 3. Pantalla por pantalla

### 3.1 Login

**Qué cambia de lo que hay:** la etiqueta dice "Correo Institucional / Legajo" y tiene que decir **"Usuario"**, con ejemplo `gboubon0` — los agentes municipales entran con usuario de red, no con correo.

```jsonc
// manda
{ "identificador": "cbenite0", "password": "…", "captorId": "captor-01" }

// recibe
{ "ok": true, "datos": {
  "token": "…",
  "expiraEn": "2026-08-21T23:59:00-03:00",
  "sesionAnteriorCerrada": true,
  "perfil": {
    "identificador": "cbenite0", "nombreApellido": "Carla Benítez",
    "legajo": "18442", "rol": "operario",
    "distritoAsignado": "Oeste", "puedeFirmar": true
  }
}}
```

**`captorId`** identifica el dispositivo. En la demo puede ser fijo; el back lo usa para bloquear equipos robados.

**`perfil.rol`** define qué se ve (§4.4). **`puedeFirmar`** define si aparece el botón de firmar.

**`sesionAnteriorCerrada: true`** significa que ese usuario tenía sesión abierta en otro lado y se cerró. Conviene avisarlo.

---

### 3.2 Dashboard

**Qué falta:** el **filtro por distrito**. Está en el listado de reclamos y no acá, y la minuta lo pidió en los dos.

```jsonc
// GET /dashboard?distrito=Oeste
{ "ok": true, "datos": {
  "totales": { "reclamos": 143, "pendientes": 98, "dictamenes": 45 },
  "porPrioridad": { "verde": 40, "amarillo": 32, "naranja": 18, "rojo": 8 },
  "porDistrito": [ { "distrito": "Oeste", "pendientes": 22 } ],
  "alertas": {
    "porVencer30Dias": 6,
    "tormentaPendientes": 2,
    "pendientesDeCertificar": 3,
    "sincronizacionesPendientes": 1
  },
  "ultimos": [ { "nroSua": "1234", "anio": 2026, "direccion": "…", "prioridad": "rojo" } ]
}}
```

**Todo viene calculado.** El front no suma nada: hoy `renderDashboard()` cuenta sobre el array en memoria, y con 5.000 reclamos eso no se puede traer al navegador.

**`alertas` tiene dos claves nuevas** que hoy no existen en pantalla y hay que agregar: dictámenes pendientes de certificar y sincronizaciones pendientes con el SUA. Son avisos para el Administrador.

---

### 3.3 Listado de reclamos

```jsonc
// GET /reclamos?estado=&prioridad=&distrito=&barrio=&categoria=&antiguedadMeses=&tormenta=&reservadoPor=
{ "ok": true, "datos": { "items": [{
  "nroSua": "1234", "anio": 2026,
  "fechaIngreso": "2026-06-02T09:10:00-03:00",
  "direccion": "Bv. Oroño 1240", "distrito": "Centro", "barrio": "Martin",
  "descripcion": "Árbol inclinado, raíces levantan vereda.",
  "prioridad": "naranja",
  "porQue": {
    "senalRiesgo": "raíces levantan vereda",
    "reclamosDelMismoEjemplar": 3,
    "escalamientos": [ { "de": "verde", "a": "amarillo", "motivo": "tiempo", "fecha": "…" } ]
  },
  "categoria": "infraestructura", "categoriaOrigen": "inferida",
  "estado": "sin_dictaminar",
  "reserva": null,
  "punto": { "lat": -32.9466, "lng": -60.6543, "precision": "aproximada" },
  "tormenta": false, "antiguedadMeses": 2
}], "total": 143 }}
```

**Tres cosas para mostrar que hoy no se muestran:**

- **`porQue`** — por qué ese reclamo tiene ese color. Hoy el color aparece solo. **Un color sin explicación es un color que nadie va a respetar**, y es lo primero que el profesor va a preguntar.
- **`reserva`** — si está tomado, viene `{ "porQuien": "J. Gutiérrez", "desde": "…", "blindada": true }`. No desaparece del listado: se ve marcado.
- **`punto.precision`** — `exacta`, `aproximada`, `solo_calle` o `fallida`. **Se dibuja distinto en el mapa.** Un punto falsamente exacto es peor que uno declarado dudoso.

**Filtros:** los ocho de la consulta. `antiguedadMeses` es el que sirve para el rezago de 3 años.

---

### 3.4 Consulta por dirección

**No existe y la minuta lo pidió.** Un buscador con un campo y resultados.

```jsonc
// GET /reclamos/buscar?direccion=Mendoza 3450
{ "ok": true, "datos": { "items": [ /* igual que 3.3 */ ] }}
```

---

### 3.5 Alta de reclamo

**Qué cambia:** hoy el front se inventa el número (`2026-${ultimoId+1}`) y las coordenadas (`Math.random()`). **Las dos cosas las devuelve el back.**

```jsonc
// manda — sin número, sin coordenadas
{ "direccion": "Mendoza 3450", "distrito": "Oeste",
  "descripcion": "…", "prioridad": "naranja",
  "origenAlta": "oficio",          // oficio | vecino | tormenta
  "tormenta": false,
  "fotosDeclaradas": 2 }

// recibe — el número y el punto vienen de acá
{ "ok": true, "datos": {
  "nroSua": "1288", "anio": 2026,
  "punto": { "lat": -32.96, "lng": -60.67, "precision": "aproximada" }
}}
```

**La prioridad la elige el ingeniero y eso está bien** — es el único que vio el árbol. Se queda como está.

**Las fotos van después**, con el número que devolvió el alta: `POST /reclamos/{anio}/{nro}/fotos`.

---

### 3.6 Dictamen — paso 1, identificar el reclamo

**Qué cambia:** el par (número, año) son **dos campos separados** y así se mandan. Hoy se concatenan en un string `2026-0001` y se le hace `padStart(4,'0')` — eso hay que sacarlo: un número de cinco dígitos no se encuentra nunca.

- **Año**: selector con el año en curso y los 10 anteriores. Hoy es un `number` libre donde se puede tipear 1804.
- **Número**: campo de **texto**, sin relleno automático. Es un identificador, no una cantidad.

```jsonc
// POST /reclamos/2026/1234/validar
// 200 — sigue
{ "ok": true, "datos": { /* el reclamo de 3.3, para precargar el formulario */ }}

// 409 — no sigue
{ "ok": false, "error": { "codigo": "RECLAMO_YA_DICTAMINADO", "mensaje": "…" }}
```

Códigos posibles: `RECLAMO_NO_ENCONTRADO`, `RECLAMO_YA_DICTAMINADO`, `RECLAMO_FUERA_DE_ALCANCE`, `RECLAMO_BLINDADO`, `RECLAMO_CERRADO_DEFINITIVO`.

---

### 3.7 Dictamen — el formulario

**Es el trabajo más grande del front.** Hoy tiene 7 campos cargables; el formulario físico tiene bastante más, y la minuta pidió que estén **todos**.

| Bloque | Campos |
| --- | --- |
| **Reclamo** (solo lectura) | Número, año, distrito, dirección del SUA |
| **Expediente** | `nroExpediente`, `nroNota` |
| **Ejemplar** | `especie` (con autocompletado), **`perimetroTronco`** y **diámetro calculado al lado**, `alturaAproximada`, `estadoCopa`, `estadoTronco`, `estadoRaices`, `inclinacionEjemplar` |
| **Ubicación** | `direccionConfirmada`, `calleEsquina`, `distanciaMedianera`, `cantidadFrente`, **GPS capturado** |
| **Intervención** | 4 grupos: `extraccion`, `trabajosAereos`, **`trabajosSubterraneos`** (hoy metido adentro de aéreos), **`sinTrabajo`** |
| | `plantar` |
| **Clasificación** | `danoVereda`, `complejidad` (+ sugerida), `urgencia`, `epocaRecomendada` |
| **Banderas** | `urgente`, `frenteGarage`, `mediaTension`, `deOficio` |
| **Fotos** | **Varias**, no una. Hoy hay un `input file` suelto que no se guarda |
| **Cierre** | `observacionesTecnicas`, firma |

**El diámetro se muestra, no se pide.** El ingeniero mide **perímetro** con cinta; el diámetro es `perímetro / π` y se muestra al lado, calculado en vivo. Es cálculo de presentación: **queda en el front** (y el back lo recalcula igual, para que nadie guarde uno inconsistente).

**Separar trabajos subterráneos de aéreos no es cosmético.** Hoy el grupo se llama "Poda Aérea / Raíces" y mezcla poda de formación con corte de raíces. Son intervenciones distintas —una la hace una cuadrilla con altura, la otra rompe vereda— y el entregable a concesionarias las agrupa **por acción autorizada**: mezcladas, no se pueden distinguir.

**El firmante no se tipea.** Hoy hay dos campos de texto: "Técnico Firmante" y "N° Matrícula Profesional".

- La **matrícula se elimina**: firmar es atributo del rol, ese dato ya no existe en el sistema.
- El **técnico sale del perfil de la sesión**, en solo lectura. Quién firma no es algo que se declare: es algo que el sistema sabe.

```jsonc
// POST /dictamenes
{
  "id": "8f2c…",                    // uuid generado en el DISPOSITIVO
  "nroSua": "1234", "anio": 2026,
  "fechaDictamen": "2026-08-21T10:30:00-03:00",
  "especie": "Tipuana tipu",
  "perimetroTronco": 128.5, "alturaAproximada": 9.2,
  "estadoCopa": "…", "estadoTronco": "…", "estadoRaices": "…",
  "inclinacionEjemplar": "…",
  "direccionConfirmada": "…", "calleEsquina": "…",
  "distanciaMedianera": 1.2, "cantidadFrente": 2,
  "latCaptura": -32.9466, "lngCaptura": -60.6543,
  "intervencion": {
    "extraccion": [], "trabajosAereos": ["poda de despeje"],
    "trabajosSubterraneos": [], "sinTrabajo": [], "plantar": []
  },
  "sinTrabajoMotivo": null,
  "danoVereda": "…", "complejidad": "media", "urgencia": "programada",
  "urgente": false, "frenteGarage": false, "mediaTension": false, "deOficio": false,
  "cierraDuplicados": [ { "nroSua": "1240", "anio": 2026 } ],
  "fotosDeclaradas": 3,
  "observacionesTecnicas": "…",
  "firmaTrazo": [ { "color": "#000", "puntos": [ {"x":12,"y":40,"t":0} ] } ]
}
```

**Dos cosas del envío que importan:**

**`id` lo genera el dispositivo**, no el servidor. Es lo que hace que reintentar el envío tres veces con mala señal entre **un** dictamen y no tres. Va también en la cabecera `Idempotency-Key`.

**`firmaTrazo` son vectores, no una imagen.** `signaturePad.toData()`, no `toDataURL()`. Son 2 a 6 KB contra 80 KB de un PNG, se redibuja a cualquier resolución para el PDF, y **no infla el único envío que no puede fallar**. Sería incoherente comprimir las fotos con cuidado y después meterle una imagen al cuerpo del dictamen.

```jsonc
// 201
{ "ok": true, "datos": {
  "id": "8f2c…",
  "fechaVencimiento": "2028-02-21",     // null si el dictamen no autoriza nada
  "hashDocumento": "a3f1…",             // ← ESTE es el que va en pantalla
  "selloTiempo": "2026-08-21T18:05:11-03:00",
  "firmante": { "nombre": "Carla Benítez", "legajo": "18442", "rol": "operario" },
  "estadoCertificacion": "certificado",
  "fotosPendientes": 3,
  "epocaRecomendada": "Invierno (mayo a agosto)",
  "duplicadosCerrados": 1
}}
```

> **Lo más urgente del front, y es una línea.** La pantalla de éxito muestra hoy un hash escrito a mano en el HTML: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. Es el mismo para todos los dictámenes — **es el SHA-256 de la cadena vacía**. Si en la defensa alguien emite dos dictámenes y compara, la promesa de integridad se cae sola. Tiene que salir de `hashDocumento`.

**Las fotos se suben después**, una por una, contra `POST /dictamenes/{id}/fotos`. Comprimidas a menos de 400 KB, lado mayor 1600 px. Nunca antes del dictamen.

---

### 3.8 Dictamen — las reglas del formulario

Cuatro reglas que **hoy no están** y que el front tiene que aplicar. Las cuatro se pueden hacer sin backend.

**1 · El dictamen tiene que decir algo.** Hoy se puede firmar sin marcar una sola casilla: se emite un documento con validez legal que no dice qué hacer con el árbol. El botón de emitir queda deshabilitado hasta que haya **al menos una** intervención marcada, o **"sin trabajo"**.

**2 · "Sin trabajo" es excluyente de todo lo demás.** Igual que la extracción: al marcarlo se deshabilitan los otros tres grupos.

**3 · "Sin trabajo" exige motivo.** Un selector obligatorio con cuatro opciones:

| Motivo | Cuándo |
| --- | --- |
| `no_requiere_intervencion` | El ejemplar está sano; el vecino se equivocó, o el árbol es así |
| `ejemplar_inexistente` | Ya no está: tormenta, extracción privada, dirección errada |
| `ya_intervenido` | Una cuadrilla o un privado hizo el trabajo antes de la visita |
| `fuera_de_alcance` | Árbol privado, otra jurisdicción, no es un árbol |

**4 · Avisar que "sin trabajo" cierra el reclamo para siempre.** No vence a los 18 meses ni vuelve a la cola. **Es la única casilla del formulario cuyo efecto es irreversible**, y hay que decirlo **antes** de firmar, no después.

**Lo que ya está y se queda:** la exclusión entre extracción y poda funciona bien. Solo hay que sumarle el tercer grupo y el cuarto.

**Rangos de entrada.** Perímetro y altura son numéricos con mínimo y máximo razonables: **un tronco de 4 cm o de 900 cm es un error de tipeo**, y conviene atajarlo donde se escribe.

---

### 3.9 Duplicados del mismo árbol

Un árbol en medio de la calle lo reclama medio barrio. Al firmar, el front pide los otros reclamos del mismo ejemplar y **el ingeniero marca cuáles cierra con ese dictamen**.

```jsonc
// GET /dictamenes/duplicados?nroSua=1234&anio=2026
{ "ok": true, "datos": { "items": [
  { "nroSua": "1240", "anio": 2026, "direccion": "Bv. Oroño 1240",
    "fechaIngreso": "…", "descripcion": "…" }
]}}
```

Los seleccionados viajan en `cierraDuplicados` (§3.7).

**El ingeniero elige, nunca el sistema solo.** El agrupamiento es por calle y altura y puede juntar de más — dos árboles en el mismo número. **Cerrar el reclamo de otro por error es peor que dejarlo abierto.**

**Puede venir apagado.** Si el parámetro `cierreDuplicadosActivo` está en falso, la sección no aparece y todo funciona como siempre.

---

### 3.10 Jornada — el flujo completo

Hoy hay un solo botón que hace todo: "Generar Ruta Optimizada". **Se parte en cuatro momentos.**

```
Planificar ──► Pre-confirmar ──► Confirmar ──► En curso ──► Cerrar
   (form)      (PANTALLA NUEVA)   (sale)      (mapa fijo)   (motivo)
```

#### Planificar → devuelve la propuesta, y ya reservó

```jsonc
// POST /jornadas/preparar
{ "criterio": "horas", "valor": 6,
  "zona": { "distrito": "Oeste" },
  "modoTraslado": "auto",
  "modoBalanceo": "por_porcentaje",
  "distribucion": { "rojo": 25, "naranja": 25, "amarillo": 25, "verde": 25 } }

// 200
{ "ok": true, "datos": {
  "jornadaId": "…", "reservados": 14,
  "paradas": [ { "orden": 1, "nroSua": "1234", "anio": 2026,
                 "direccion": "…", "prioridad": "rojo",
                 "horaEstimada": "2026-08-22T08:22:00-03:00",
                 "punto": {"lat": -32.95, "lng": -60.67, "precision": "aproximada"} } ],
  "resumen": { "minutosTraslado": 96, "minutosDictaminacion": 140,
               "distanciaMetros": 8400, "eficienciaPct": 59.3 },
  "redistribuido": [ { "prioridad": "rojo", "pedidos": 4, "asignados": 2,
                       "motivo": "No había más casos rojos en la zona" } ],
  "sinPunto": [ { "nroSua": "5566", "anio": 2025, "precision": "fallida" } ],
  "ocupados": [ { "nroSua": "7788", "anio": 2026, "porQuien": "J. Gutiérrez" } ],
  "directivaAplicada": { "nombre": "Campaña Oeste — cableado", "obligatoria": true }
}}
```

**Cuatro cosas de esta respuesta que hay que mostrar y hoy no existen:**

- **`redistribuido`** — si pidió 25 % de urgentes y solo había dos, se dice, con el motivo. Una jornada que devuelve otra mezcla sin avisar obliga al ingeniero a contar casos en el mapa.
- **`sinPunto`** — reclamos que la geocodificación no resolvió. **Van destacados**: son los que más tiempo hacen perder si se descubren recién en la calle.
- **`ocupados`** — si pidió 14 y entraron 12, se ve por qué y quién los tiene.
- **`eficienciaPct` y `distanciaMetros`** vienen calculados. Hoy la eficiencia es un literal: `'92% (Vehicular)'`.

**El balanceador tiene que normalizar a 100 %.** Hoy los cuatro deslizadores pueden sumar 250 % y nadie avisa.

#### Pre-confirmar → la pantalla nueva

Es la única pantalla que cambia el flujo, y es **el momento más importante del día**: los casos ya están reservados a nombre del ingeniero, así que puede revisar sin apuro **sabiendo que nadie se los va a sacar mientras decide**.

Qué se ajusta acá:

| Ajuste | Por qué acá |
| --- | --- |
| **Corregir puntos del mapa** que cayeron mal | Es el momento con señal y con el mapa a la vista. En la calle, con una barra y el sol de frente, no se corrige nada |
| Sacar un caso | Lo libera y vuelve a la cola |
| Corregir la categoría inferida | Antes de que la ruta se arme con una prioridad equivocada |
| Reordenar o forzar una parada | El orden óptimo es una sugerencia, no una orden |

```jsonc
// PATCH /jornadas/{id}
{ "correcciones": [
  { "tipo": "punto", "nroSua": "5566", "anio": 2025, "punto": { "lat": …, "lng": … } },
  { "tipo": "categoria", "nroSua": "1234", "anio": 2026, "categoria": "cableado" },
  { "tipo": "quitar", "nroSua": "7788", "anio": 2026 },
  { "tipo": "orden", "nroSua": "1234", "anio": 2026, "orden": 1 }
]}
```

> **Este endpoint se llama con espera, no en cada clic.** Cada ajuste recalcula la ruta contra el servicio de ruteo, que tiene límite de peticiones. Se recalcula **cuando el ingeniero deja de tocar**, no mientras arrastra.

#### Confirmar → sale a la calle

```jsonc
// POST /jornadas/{id}/confirmar → devuelve TODO lo que se necesita sin señal
{ "ok": true, "datos": {
  "blindados": [ { "nroSua": "1234", "anio": 2026 } ],
  "blindajeHasta": "2026-08-22T20:00:00-03:00",
  "token": "…",                       // sesión renovada
  "paquete": { "reclamos": [...], "ruta": {...}, "parametros": {...}, "catalogos": {...} }
}}
```

**A partir de acá el mapa no se recalcula.** La geometría viene en `paquete.ruta` y se dibuja una vez.

#### En curso

- Marcar una parada como **visitada**.
- Marcar una parada como **no visitada, con motivo** — esto no existe hoy: `sin_acceso`, `vecino_se_opone`, `animal_suelto`, `obra_en_vereda`, `falta_de_tiempo`, `otro`.
- **Ampliar la jornada** si terminó antes: `POST /jornadas/{id}/ampliar` con la posición actual. La ruta se recalcula **desde donde está parado**, no desde la sede.
- **Consultar novedades** cuando vuelve la señal: `GET /jornadas/{id}/novedades`. Si el Jefe le sacó un caso por tormenta, aparece con quién y por qué, sale de la ruta, y **si lo tenía cargado a medias la carga se guarda como borrador**.

#### Cerrar

```jsonc
// POST /jornadas/{id}/cerrar
{ "motivo": "lluvia" }   // lluvia | urgencia | salud | fin_de_jornada | otro
```

Si la respuesta trae `colaPendiente > 0`, **aviso destacado**: cuántos dictámenes son y que **están solo en el dispositivo**.

---

### 3.11 El mapa

Dos reglas que vienen de la minuta, dichas por el cliente:

> Ese mapa es el que tienen que seguir todo el día.

**1 · El mapa no se reinicia al cargar un dictamen.** Hoy funciona por casualidad —está en otra vista— pero hay que sostenerlo a propósito.

**2 · Falta el botón de "restablecer".** Es lo único que puede limpiar el mapa. Hoy no existe, y en cambio el mapa **se borra entero cada vez que se aprieta "Generar Ruta"**.

**Y el orden de las paradas viene del back.** Hoy el botón dice "Generar Ruta Optimizada" y no optimiza nada: los puntos se ordenan por prioridad y se le pasan a OSRM en ese orden — OSRM devuelve el camino que une esos puntos **en el orden que se le dio**. El orden óptimo lo calcula el servidor y llega en `paradas[].orden`.

---

### 3.12 Tormenta

Ya existe y funciona. Lo que falta:

- La sección **aparece solo si hay casos**. Hoy se muestra siempre.
- La ventana es de **3 días configurable**, no un booleano fijo: hace falta `fechaTormenta` en el reclamo.
- **No se aplica balanceador ni escala de colores**: todos iguales entre sí, ruta por mínima distancia.
- Si un caso de tormenta está **blindado** en la jornada de otro, se ve marcado con quién lo tiene. **Solo el Jefe puede forzar el desblindaje.**

---

### 3.13 Indicador de sincronización

Un elemento fijo, siempre visible, con tres estados:

| Estado | Qué dice |
| --- | --- |
| Al día | "Todo sincronizado", o nada |
| Sin conexión | "Sin señal — 3 dictámenes esperan enviarse" |
| Hay algo que revisar | Acceso a la bandeja de conflictos |

**Nunca decir "enviado" si está en la cola.** Dice "guardado, se envía cuando haya señal". La diferencia importa cuando alguien pregunta si el dictamen ya está cargado.

**No hay botón de sincronizar.** El ingeniero guarda y el sistema se encarga. Un botón manual le traslada al usuario un problema técnico que no le corresponde, y garantiza que alguna vez alguien se olvide de apretarlo.

---

### 3.14 Bandeja de conflictos y borradores

Dos listas, misma pantalla.

**Conflictos:** operaciones que el servidor rechazó por regla de negocio. El caso típico: *"El reclamo 4821/2024 ya fue dictaminado por Pérez el 14/08. Tu carga quedó guardada."* Desde ahí se puede ver lo cargado, copiarlo a otro reclamo, o descartarlo.

**Borradores:** dictámenes a medio cargar. Los que llevan más de 30 días sin actividad van en una lista aparte, marcados como inactivos. **El sistema nunca los borra solo** — el descarte es siempre una acción de la persona.

---

### 3.15 Panel de administración

No existe nada de esto. Es lo que más superficie tiene y **lo más fácil de repartir**, porque cada sección es independiente.

| Sección | Qué configura |
| --- | --- |
| Usuarios y roles | Alta, rol, distrito, desactivar |
| **Parámetros** | Minutos por dictamen, días de escalamiento, ventana de tormenta, retenciones |
| **Adaptadores** | Cuál proveedor de ruteo y de geocodificación está activo |
| **Firma digital** | Qué roles firman, certificadora, algoritmo, leyenda del pie |
| Cortes de complejidad | Diámetro y altura por nivel |
| Reglas de prioridad | La matriz, con interruptor para apagar las de texto |
| Directivas de jornada | Zona, categorías, distribución, obligatoriedad, vigencia |
| **Ventana laboral** | Franja horaria y cupo de reclamos |
| **Captores** | Alta, asignación y **baja** de dispositivos |
| **Cuarentena** | Operaciones retenidas de un captor dado de baja: liberar o descartar |
| **Certificaciones pendientes** | Cola y forzado de reintento |
| **Concesionarias** | Empresas destinatarias. Sin cuenta ni acceso |
| **Entregable** | Proponer paquetes, ajustar, emitir |
| Anulaciones solicitadas | Las que pidieron los ingenieros |
| Auditoría | Solo lectura |

**Dos que tienen un requisito de comportamiento, no solo de formulario:**

**Ventana laboral** — la pantalla tiene que **mostrar la consecuencia** de lo que se está configurando, no solo guardar el número: *"esto haría que el ingeniero trabaje hasta las 18:30"*, *"con este cupo quedan 40 casos sin repartir"*. **Es la mitad del requerimiento**: sin eso, configurar un cupo a ciegas sigue dejando trabajo sin hacer, solo que ahora la culpa es del panel y no de la calle.

**Entregable a concesionarias** — son **dos pasos**. Primero *proponer*, que arma los paquetes y **no escribe nada**; el Administrador saca los que no correspondan; recién ahí *emitir*. Es el mismo patrón del balanceador y de la pre-confirmación: **el sistema propone, la persona ajusta, después confirma.**

---

## 4. Reglas que el front tiene que respetar

### 4.1 Lo que nunca se muestra inventado

Si el back todavía no lo calcula, **no se muestra**. Un número inventado en pantalla es peor que un espacio vacío, porque nadie lo cuestiona.

Hoy hay tres: el hash del dictamen, el porcentaje de eficiencia, y la sugerencia de época — que devuelve "Invierno (Mayo-Agosto)" para cualquier especie de más de tres letras.

### 4.2 Errores: qué hace el front con cada uno

| Código | Qué hace |
| --- | --- |
| `RECLAMO_YA_DICTAMINADO` | **Ofrece guardar como borrador.** Nunca descarta la carga |
| `RESERVA_TOMADA_POR_OTRO` / `RECLAMO_BLINDADO` | Muestra quién lo tiene y desde cuándo |
| `SIN_RESERVA_PROPIA` | No se dictamina lo que no se tomó |
| `INTERVENCIONES_EXCLUYENTES` | Marca las casillas en conflicto |
| `DICTAMEN_VACIO` | Marca que falta elegir intervención o "sin trabajo" |
| `ROL_NO_FIRMA` | El rol no está habilitado para firmar |
| `SESION_DESPLAZADA` | **"Alguien inició sesión con tu usuario"** — no "sin señal" |
| `NO_AUTENTICADO` | "Hay que volver a iniciar sesión". La cola espera, no descarta |
| `CAPTOR_DE_BAJA` | Avisa que el envío quedó **en cuarentena**, no perdido |
| `FUERA_DE_VENTANA_LABORAL` / `CUPO_AGOTADO` | Muestra el texto del motivo |
| `DIRECTIVA_OBLIGATORIA_VIOLADA` | Explica qué directiva lo impide |

**`SESION_DESPLAZADA` y `NO_AUTENTICADO` no se pueden mostrar igual.** Uno significa "alguien entró con tu usuario en otro lado" y el otro "pasó el tiempo". Mostrarlos igual tapa un problema de seguridad con un cartel de red.

### 4.3 Nunca se pierde trabajo en silencio

Si algo no se pudo enviar, **se ve**. Si algo se rechazó, queda en la bandeja con el motivo en castellano y la carga intacta. Veinte minutos frente a un árbol no se descartan porque el servidor dijo que no.

### 4.4 El rol decide qué se ve

| Rol | Qué ve |
| --- | --- |
| **Lector** | Solo el dashboard. Nada operativo |
| **Operario** | Todo lo operativo. Nada de administración |
| **Jefe** | Lo del Operario + trabajo del equipo, directivas y ventana laboral |
| **Administrador** | Toda la administración. **Sin botón de firmar** |

**Ocultar no es proteger**, y conviene tenerlo claro: el front esconde botones por comodidad, pero quien impide de verdad es el servidor y la base. Si alguien le pega directo a la API con un token de Lector, el botón oculto no habría servido de nada.

---

## 5. Catálogos que vienen del back

Hoy están escritos en el código. Pasan a venir en `paquete.catalogos` al confirmar la jornada, y por endpoint el resto del tiempo.

| Catálogo | Hoy |
| --- | --- |
| Opciones de extracción | `EXTRACCION_OPTS`, 4 fijas |
| Opciones de trabajos aéreos | `AEREA_OPTS`, 4 fijas, con corte de raíces mezclado adentro |
| Opciones de trabajos subterráneos | **No existe** |
| Opciones de "sin trabajo" y sus motivos | **No existe** |
| Especies, para el autocompletado | **No existe** |
| Distritos | Fijos en el HTML, están bien |
| Niveles de complejidad y sus cortes | **No existe** |
| Minutos por dictamen | `10`, escrito en el código. **El valor es correcto**, falta leerlo de parámetros |

---

## 6. Lo que el front **no** tiene que hacer

- **No calcular prioridades ni escalamientos.** Vienen calculadas, con el porqué.
- **No calcular fechas de vencimiento.** Es una fecha legal.
- **No calcular la eficiencia ni el orden de la ruta.**
- **No asignar números de reclamo ni inventar coordenadas.**
- **No guardar el token en un lugar que sobreviva a cerrar sesión.**
- **No poner fechas fijas en el código.** Hoy hay dos `new Date('2026-08-13')` que dejan el sistema congelado en esa fecha.
- **No confiar en `navigator.onLine`.** Miente: dice que hay conexión cuando el celular está enganchado a una antena que no transmite. La conexión se decide por el resultado real de las peticiones. Eso lo resuelve el SDK.

---

## 7. Por dónde empezar

Ordenado por relación entre lo que cuesta y lo que rinde. **Todo esto es sin backend.**

| # | Qué | Tamaño |
| --- | --- | --- |
| 1 | **Sacar el hash falso** de la pantalla de éxito | Una línea |
| 2 | Eliminar el campo de matrícula; el técnico sale del perfil | Chico |
| 3 | Login: "Usuario" en vez de "Correo Institucional" | Dos líneas |
| 4 | Prioridad media de azul a **amarillo** | Una línea |
| 5 | Partir el par (SUA, año) en dos campos; sacar el `padStart` | Chico |
| 6 | Sacar las fechas fijas del código | Chico |
| 7 | **Los campos que faltan del formulario físico** | **Grande** |
| 8 | Las 4 reglas del formulario (§3.8) | Mediano |
| 9 | Reformar el mock para que devuelva la forma de §3 | Mediano |
| 10 | Filtro por distrito en el dashboard | Chico |
| 11 | Botón de consulta por dirección | Chico |
| 12 | Botón de restablecer el mapa | Chico |
| 13 | Indicador de sincronización | Chico |
| 14 | Pantalla de pre-confirmación | Grande |
| 15 | Panel de administración | Grande, repartible |

**Los seis primeros son de un rato y son los que más se notan en una defensa.**

**El 9 es el que decide cuánto duele conectar después.** Si el mock ya devuelve la forma final, conectar es cambiar de dónde sale el dato. Si no, hay que reescribir cada pantalla dos veces.
