# T12 — Integración del front

> Diseño técnico · Última actualización: 21/08/2026 · Estado: **sin aprobar**
> Responde: cómo el prototipo estático pasa de datos simulados a la API, y **qué hay que cambiarle exactamente**.
> El front es de **Ale**. Este documento no lo reescribe: le dice qué toca y por qué, con el `id` y la línea al lado.

---

## 1. La regla: el front es la planilla, y por eso se lo respeta y se lo corrige

`ArboladoRosario/index.html` (897 líneas) y `login.html` (280) son el prototipo estático responsive que se le mostró al profesor: Leaflet para el mapa, OSRM para la ruta, `signature_pad` para la firma, y un objeto `DB` simulado en memoria.

**El front manda sobre el aspecto y el flujo. El diseño manda sobre la regla.** Esa es la división y conviene tenerla clara antes de leer el resto:

| Manda el front | Manda el diseño |
| --- | --- |
| Cómo se ve, cómo se navega, qué pantalla va antes de cuál | Qué se puede guardar y qué no |
| Los textos, los íconos, la disposición de las tarjetas | Qué campos son obligatorios |
| Que el mapa se siga viendo igual toda la jornada | Qué se calcula en el servidor |

**Ninguno de los cambios de este documento altera el aspecto general ni el flujo de navegación.** Lo que se toca es: lo que está mal, lo que miente, lo que falta del formulario físico, y lo que hoy calcula el navegador y tiene que calcular el servidor.

Que la regla esté escrita tiene un motivo práctico: el front es la demo que ya funciona y que el equipo entiende. Reescribirlo para "hacerlo prolijo" arriesgaría lo único que hoy está probado ante el docente, a cambio de nada que el trabajo necesite.

**Cómo se trabaja entre los dos.** Los cambios de §5 (correcciones) y §7 (obligatoriedad) se pueden hacer **hoy, sobre el mock, sin backend**: son del front y mejoran la demo aunque el backend no exista. Los de §6 (lógica que se va) y §8 (pantallas nuevas) esperan a que su módulo esté verde en el driver (§10).

---

## 2. El SDK

Un archivo, `ArboladoRosario/sdk/arbolado.js`, que expone **exactamente las mismas operaciones que hoy hace el objeto `DB`**:

```js
const api = ArboladoSDK({ base: '/api/v1' });

// hoy:  DB.reclamos.filter(r => r.estado === 'pendiente')
// va a ser:
const { items } = await api.reclamos.listar({ estado: 'sin_dictaminar', distrito: 'Oeste' });

// hoy:  DB.dictamenes.push(nuevo)
// va a ser:
await api.dictamenes.emitir(nuevo);
```

| Responsabilidad del SDK | Detalle |
| --- | --- |
| Token | Lo guarda, lo adjunta y renueva la sesión |
| Errores | Traduce `{ok:false,error}` a excepciones con `codigo` y `mensaje` |
| Cola offline | Encola las escrituras cuando no hay señal (T8) |
| Idempotencia | Genera el `uuid` y lo manda como `Idempotency-Key` |
| Caché de jornada | Lee de IndexedDB cuando no hay red |
| Novedades | Consulta `/jornadas/{id}/novedades` cuando vuelve la señal (D-77) |

**Toda la complejidad del offline vive en el SDK**, no en las pantallas. `index.html` llama a `api.dictamenes.emitir(...)` y no se entera de si eso salió por la red o quedó encolado. Es la única forma de sumar trabajo sin señal sin reescribir el prototipo.

---

## 3. Correspondencia entre el mock y la API

| Hoy en `index.html` | Va a ser |
| --- | --- |
| `DB.reclamos` | `GET /reclamos` |
| `DB.reclamos.find(r => r.nsum === x)` | `GET /reclamos/validar?anio=&nro=` |
| `DB.dictamenes.push(...)` | `POST /dictamenes` |
| `recalcularPrioridadesPorTiempo()` | Trabajo programado del servidor (T9) |
| `calcularRutaOptima()` | `POST /jornadas/preparar` + `/confirmar` |
| `actualizarBalanceador()` | Servidor, en la preparación de jornada |
| `validarReclamoSua()` | Validación local **y** `POST /reclamos/{anio}/{nro}/validar` |
| `sugerirEpoca()` | Viene calculada en la respuesta del dictamen |
| `renderCheckboxesExcluyentes()` | **Se queda igual**: el front valida por comodidad |
| `obtenerGeo()` | Se queda, pero **guardando** lo que captura (§5) |

### Qué se **duplica** a propósito

Las validaciones de exclusión (RF-14), la de **completitud** (D-89) y la del formato del par (SUA, año). **El front valida por comodidad, el backend valida por obligación.** El front deshabilita casillas para que el ingeniero no se equivoque; el backend vuelve a validar porque no puede confiar en el cliente. Un dictamen es un documento con validez legal y su coherencia no puede depender de que el JavaScript se haya ejecutado.

---

## 4. Cómo leer el catálogo

Los cambios están agrupados por **qué tipo de problema resuelven**, no por pantalla, porque el criterio para aceptarlos o discutirlos es distinto en cada grupo:

| § | Grupo | Criterio |
| --- | --- | --- |
| **5** | **Correcciones** — cosas que están mal o que muestran algo falso | No se discuten. Se corrigen |
| **6** | **Lógica que se va al backend** | El front deja de calcular y pasa a mostrar |
| **7** | **Campos, obligatoriedad y restricciones** | Sale del formulario físico y de las reglas |
| **8** | **Pantallas que no existen** | Trabajo nuevo, con tamaño declarado |
| **9** | **Pedidos de la minuta pendientes** | Los pidió el cliente y todavía no están |

Cada fila lleva el `id` del elemento o el nombre de la función, para que no haya que buscar.

---

## 5. Correcciones — lo que está mal o muestra algo falso

Estas son las que **no se discuten**, y varias son de una línea. Van primero porque **mejoran la demo aunque el backend no exista todavía**.

| # | Qué pasa hoy | Dónde | Qué tiene que pasar | Origen |
| --- | --- | --- | --- | --- |
| C-1 | **El hash SHA-256 está escrito a mano en el HTML**, y es siempre el mismo | `#dic-success` | Viene del servidor, en la respuesta del dictamen | RF-19 |
| C-2 | Pide **"N° Matrícula Profesional"** como campo obligatorio | `#dic-matricula` | **Se elimina el campo** | D-50, DV-10 |
| C-3 | El **técnico firmante se tipea a mano** | `#dic-tecnico` | Sale del perfil de la sesión, solo lectura | RF-18 |
| C-4 | `new Date('2026-08-13T00:00:00')` **fijo en el código**, en dos lugares | `recalcularPrioridadesPorTiempo`, `guardarDictamen` | Fecha real; el vencimiento lo calcula el servidor | RF-19 |
| C-5 | La **eficiencia es un literal**: `'98% (Zona peatonal)'` o `'92% (Vehicular)'` | `calcularRutaOptima` | Viene calculada del servidor | RF-26 |
| C-6 | El **alta de reclamo inventa coordenadas** con `Math.random()` | `guardarReclamo` | Las produce la geocodificación del servidor | DV-12 |
| C-7 | El **front asigna el número de SUA**: `2026-${ultimoIdNsum+1}` | `abrirModalReclamo` | Lo devuelve `IReclamoProvider` al dar de alta | RF-07 |
| C-8 | `obtenerGeo()` **muestra "coordenadas fijadas" y no guarda nada** | `#dic-geo-status` | Guarda `lat_captura` / `lng_captura` en el dictamen | RF-13 |
| C-9 | `sugerirEpoca()` devuelve **siempre "Invierno (Mayo-Agosto)"** para cualquier especie de más de 3 letras | `#sugerencia-epoca` | Viene del servidor según especie y estación | RF-16 |
| C-10 | El balanceador **no normaliza a 100 %**: los cuatro deslizadores pueden sumar 250 % | `actualizarBalanceador` | Normaliza, o avisa que no suman 100 | RF-24 |
| C-11 | El modo **a pie "simula" la restricción cortando la lista a 4 casos** | `calcularRutaOptima` | Es un modo de traslado real que resuelve el servicio de ruteo | RF-22 |
| C-12 | La **ruta no se optimiza**: los puntos van a OSRM en el orden de selección por prioridad | `calcularRutaOptima` | El orden de visita lo calcula el servidor | RF-26 |
| C-13 | La lista de ruta muestra **"(Año 2026)" fijo** | `#ruta-lista` | El año del reclamo | D-41 |
| C-14 | `cerrarSesion()` solo hace `location.href` | `cerrarSesion` | Invalida el token contra la API | RF-02 |
| C-15 | Login dice **"Correo Institucional / Legajo"**, `id="email"`, ejemplo `ejemplo@rosario.gob.ar` | `login.html` | **"Usuario"**, ejemplo `gboubon0` | DV-13 |
| C-16 | La **prioridad media se dibuja azul** | `--medium` | **Amarillo** | DV-08 |

### Las cuatro que hay que mirar de frente

**C-1 es la más urgente, y no por lo técnico.** El resumen del dictamen emitido muestra este hash:

```
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

Ese valor es constante en el HTML — **es el SHA-256 de la cadena vacía**. Sale igual para todos los dictámenes porque no se calcula sobre nada. En una defensa oral, si alguien emite dos dictámenes distintos y compara, la promesa de integridad de RNF-06 se cae sola. Es una línea de HTML y hay que sacarla antes que cualquier otra cosa.

**C-3 es un problema de seguridad, no de comodidad.** Hoy el nombre del firmante es un `<input type="text">` que la persona tipea. Un firmante que se escribe a mano es un firmante que se puede escribir mal, o de otro. El dato tiene que salir de la sesión y mostrarse en solo lectura: **quién firma no es algo que se declare, es algo que el sistema sabe**.

**C-9 y C-5 son del mismo tipo y merecen decirse juntas: son cosas que el prototipo muestra como si las hubiera calculado.** La sugerencia de época sale igual para un fresno que para un jacarandá, y la eficiencia es 98 % o 92 % según el modo de traslado, sin mirar un solo caso. Para una maqueta está bien; para lo que el trabajo dice que hace, no. **Mientras el backend no las calcule, conviene que no se muestren** — un número inventado en pantalla es peor que un espacio vacío, porque nadie lo cuestiona.

**C-12 dice "Generar Ruta Optimizada" y no optimiza nada.** Los puntos se ordenan por prioridad y se le pasan a OSRM en ese orden; OSRM devuelve el camino que une esos puntos **en el orden que se le dio**, no el mejor recorrido. Optimizar el orden es otro servicio (`trip`), y en el diseño lo resuelve el servidor (T7). Es una diferencia real entre lo que el botón promete y lo que hace.

> **DV-02 quedó desactualizado y hay que corregirlo.** Dice que el front usa 7 minutos por dictamen; **el archivo actual usa 10** —`Math.floor((horas * 60) / 10)`— y la etiqueta ya dice "10m/caso". El desvío describe un estado anterior del archivo. Lo que sí falta es que ese 10 **se lea de parámetros** en vez de estar escrito en el código (RNF-09).

---

## 6. Lógica que se va al backend

El front deja de calcular y pasa a **mostrar lo que el servidor calculó**. Ninguna de estas pantallas cambia de aspecto: cambia de dónde salen los números.

| # | Función que se va | Qué la reemplaza | Por qué no puede vivir en el navegador |
| --- | --- | --- | --- |
| L-1 | `recalcularPrioridadesPorTiempo()` | Trabajo programado `escalar_prioridades` (T9) | **Tiene que correr aunque nadie abra la aplicación.** Un reclamo que nadie mira durante seis meses es el que más necesita escalar |
| L-2 | El cálculo de vencimiento en `guardarDictamen` | `POST /dictamenes` lo devuelve | Es una **fecha legal**. No la fija el reloj de un celular sin control |
| L-3 | `actualizarBalanceador()` | `POST /jornadas/preparar` | Necesita saber **cuántos casos hay de cada prioridad en la zona**, y eso está en la base |
| L-4 | La selección y el cupo en `calcularRutaOptima` | `POST /jornadas/preparar` | Reservar es una operación exclusiva: no se puede resolver en el cliente |
| L-5 | El orden de visita y la geometría | `POST /jornadas/{id}/confirmar` | Se **persiste** para que el mapa no se recalcule durante la jornada (minuta) |
| L-6 | `sugerirEpoca()` | Respuesta del dictamen | Depende de un catálogo de especies que el front no tiene |
| L-7 | La inferencia de categoría desde la descripción | Servidor, tabla `regla_prioridad` | Es una regla **configurable y desactivable**, no código |

**Lo que queda del lado del front y no se toca:** el dibujo del mapa con Leaflet, la captura de firma con `signature_pad`, la captura de GPS, el filtrado visual de las listas, y **las validaciones de exclusión de los checkboxes** — que se duplican a propósito.

### Un caso que cambia de significado: el escalamiento

Hoy `recalcularPrioridadesPorTiempo()` corre al abrir la aplicación y recalcula todo en memoria, con un salto cada 2 meses parejo para todos. En el diseño, **el ritmo depende de la categoría**: 30 días para riesgo estructural y cableado, 60 por defecto, 90 para poda estética (D-22).

El front no tiene cómo saber la categoría de un reclamo —la infiere el servidor del texto libre— así que esta función no se "traduce": **se borra**. La prioridad llega calculada en `GET /reclamos`, junto con **por qué** tiene ese color: la señal de riesgo detectada, la cantidad de reclamos sobre el mismo ejemplar y los escalamientos aplicados. Eso último hay que **mostrarlo**, porque hoy el color aparece sin explicación y un color sin explicación es un color que nadie va a respetar.

---

## 7. Campos, obligatoriedad y restricciones

Acá está el grueso del trabajo, y sale de un pedido explícito de la minuta del 12/08:

> El dictamen debe tener **todos** los campos del formulario físico actual, incluido trabajo en raíces y la opción "sin trabajo".

**Hoy el formulario de dictamen tiene siete campos cargables**: dirección, especie, una foto, GPS, dos grupos de casillas, observaciones, técnico, matrícula y firma. **El formulario físico tiene bastante más**, y el modelo de datos los tiene todos previstos (`02-modelo-de-datos.md` §7).

### 7.1 Campos que faltan

| Grupo | Campos | Nota |
| --- | --- | --- |
| **Ejemplar** | `perimetro_tronco`, **diámetro calculado**, `altura_aproximada` | El perímetro se mide con cinta; el **diámetro se muestra al lado, calculado** (D-43) |
| | `estado_copa`, `estado_tronco`, `estado_raices`, `inclinacion_ejemplar` | |
| **Ubicación** | `calle_esquina`, `distancia_medianera`, `cantidad_frente` | |
| **Intervención** | **Trabajos subterráneos como grupo propio** | Hoy "Corte de raíces" está metido adentro de "Poda Aérea" |
| | **`sin_trabajo` con su motivo** | **Pedido explícito de la minuta.** Ver 7.2 |
| | `plantar[]` | |
| **Clasificación** | `dano_vereda`, `complejidad` + **sugerida**, `urgencia`, `epoca_recomendada` | La complejidad la sugiere el servidor y el ingeniero confirma (RF-15) |
| **Banderas** | `urgente`, `frente_garage`, `media_tension`, `de_oficio` | |
| **Expediente** | `nro_expediente`, `nro_nota` | |
| **Fotos** | **Varias, no una** | Hoy hay un `<input type="file">` suelto que **no se guarda en ningún lado** (RF-17) |

**Separar los trabajos subterráneos de los aéreos no es cosmético.** El grupo 4 se llama "Poda Aérea / Raíces" y mezcla `1 – Poda de formación` con `4 – Corte de raíces`. La exclusión contra extracción funciona igual porque los trata a todos como un bloque, pero **el modelo de datos los guarda separados** (`trabajos_aereos` y `trabajos_subterraneos`), y son intervenciones distintas: una la hace una cuadrilla con altura, la otra rompe vereda. Mezclarlos hace que el entregable a concesionarias (RF-33), que agrupa **por acción autorizada**, no pueda distinguirlas.

### 7.2 "Sin trabajo" y la regla que hoy no existe

**Hoy se puede firmar un dictamen sin marcar una sola casilla.** El formulario valida especie, dirección, técnico, matrícula y firma; **no valida que el dictamen autorice o descarte algo**. Se emite un documento con validez legal que no dice qué hacer con el árbol.

Es el mismo agujero que se encontró en la base (D-89), del otro lado.

| Regla | Cómo se ve en el formulario |
| --- | --- |
| **O hay intervención, o hay "sin trabajo"** | El botón de emitir queda deshabilitado hasta que se marque algo |
| **"Sin trabajo" exige motivo** | Aparece un selector con cuatro opciones, obligatorio |
| **"Sin trabajo" es excluyente de todo lo demás** | Igual que la extracción: al marcarlo, se deshabilitan los otros tres grupos |

Los cuatro motivos: `no_requiere_intervencion`, `ejemplar_inexistente`, `ya_intervenido`, `fuera_de_alcance`.

**Y hay que avisar lo que implica**: un dictamen con "sin trabajo" **cierra el reclamo para siempre** — no vence a los 18 meses ni vuelve a la cola (D-83). El formulario tiene que decirlo antes de firmar, no después. Es la única casilla del formulario cuyo efecto es irreversible.

### 7.3 Restricciones de entrada que hoy no están

| Campo | Hoy | Tiene que ser |
| --- | --- | --- |
| `#dic-buscar-anio` | `<input type="number">` libre: se puede tipear 1804 | **Selector** con el año en curso y los 10 anteriores (A-08) |
| `#dic-buscar-num` | `type="number"` + `padStart(4,'0')` en el JS | **Texto**, sin relleno automático: el número del SUA es un identificador, no una cantidad |
| `#dic-nsum` | Un solo campo `2026-0001` | **Dos campos separados**: número y año (D-41) |
| Perímetro y altura | No existen | Numéricos con **mínimo y máximo razonables**. Un tronco de 4 cm o de 900 cm es un error de tipeo |
| Foto | Una, opcional, no se guarda | Varias, **comprimidas a menos de 400 KB**, con tope de cantidad |
| `#rec-desc` | Obligatorio para todo alta | Sigue obligatorio |
| `#rec-prioridad` | El ingeniero la elige | **Se queda como está** — es correcto (D-85) |

**El par (número, año) partido en dos es lo primero que toca el ingeniero, y en el peor momento**: de pie en la calle, con sol de frente. Un selector de año más un número corto se tipea mucho más rápido que un código compuesto, y elimina de raíz el error de escribir mal el guion.

**`padStart(4,'0')` tiene que salir del JS.** Rellena el número a cuatro dígitos antes de buscar, así que un reclamo con un número de cinco dígitos no se encuentra nunca. Hoy no se nota porque el mock tiene cinco reclamos de cuatro dígitos.

### 7.4 Lo que el rol tiene que ocultar

**Hoy el menú es el mismo para todos**: no hay noción de rol en el front. El diseño tiene cuatro (`03-reglas-de-negocio.md` §11).

| Rol | Qué no tiene que ver |
| --- | --- |
| **Lector** | Todo lo operativo: dictamen, rutas, tormenta, alta de reclamo |
| **Operario** | La administración |
| **Jefe** | La administración, salvo directivas y ventana laboral |
| **Administrador** | **El botón de firmar.** Configura la firma, no la ejerce |

**Ocultar no es proteger, y conviene decirlo en la defensa.** El front esconde botones por comodidad; **quien impide de verdad es la base con sus políticas RLS y el servidor con su validación de rol**. Si alguien le pega directo a la API con un token de Lector, el botón oculto no habría servido de nada — y por eso el control está tres veces (front, servidor, base).

---

## 8. Pantallas que no existen

| # | Pantalla | Tamaño | Origen |
| --- | --- | --- | --- |
| P-1 | **Pre-confirmación de la jornada** | Grande | D-53, DV-16 |
| P-2 | **Indicador de sincronización**, siempre visible | Chico | T8 |
| P-3 | **Bandeja de conflictos y borradores** | Mediano | D-16, D-57 |
| P-4 | **Panel de administración** | Grande | RF-31, RF-32, D-49, D-51 |
| P-5 | **Detalle de reclamo con su historial de prioridad** | Chico | RF-09 |
| P-6 | **Cierre de jornada**, con parada no visitada y motivo | Mediano | D-71, D-74 |

### P-1, la única que cambia el flujo

La pre-confirmación aparece **entre "Generar Ruta" y salir a la calle**. Muestra los casos **ya reservados** y permite corregir puntos del mapa, sacar casos, corregir la categoría y reordenar paradas antes de confirmar.

Hoy `calcularRutaOptima()` hace todo de una: calcula, dibuja y termina. La pantalla nueva parte eso en dos momentos, y **el segundo es el que importa**: es donde el ingeniero se toma el tiempo que necesite **sabiendo que nadie le va a sacar un caso mientras decide**, y es el último momento con señal garantizada, así que también es donde se precarga todo lo offline y se blinda la jornada (RF-34).

### P-2, el más chico y el que más se nota en campo

Un elemento fijo, siempre visible, con tres estados: al día, trabajando sin conexión con N pendientes, y hay algo que revisar. **Nunca dice "enviado" si el dictamen está en la cola**: dice "guardado, se envía cuando haya señal".

La diferencia importa cuando alguien pregunta si el dictamen ya está cargado.

### P-4, el que más superficie tiene

Usuarios y roles, parámetros, adaptadores, configuración de firma, cortes de complejidad, reglas de prioridad, directivas, **ventana laboral**, captores, cuarentena, certificaciones pendientes, concesionarias, entregables y auditoría.

**Un detalle de P-4 que es parte del requerimiento y no de la interfaz**: la pantalla de ventana laboral tiene que **mostrar la consecuencia** de lo que se configura —*"esto haría que el ingeniero trabaje hasta las 18:30"*— y no solo guardar el número. Es la mitad de RF-37: sin eso, el requerimiento no evita repartir trabajo en horarios imposibles, solo mueve el problema de la calle al panel.

---

## 9. Pedidos de la minuta que todavía no están

Los pidió el cliente el 12/08 y conviene tenerlos separados, porque son los que el docente puede buscar puntualmente.

| # | Pedido | Estado hoy |
| --- | --- | --- |
| M-1 | **Filtro por distrito** en el listado | **Está** — `#filtro-distrito` |
| M-2 | **Filtro por distrito** en el dashboard | **Falta** |
| M-3 | **Botón de consulta de reclamo por dirección** | **Falta** |
| M-4 | **Botón de "restablecer" el mapa** | **Falta** |
| M-5 | Todos los campos del formulario físico | **Falta** — ver §7.1 |
| M-6 | Trabajo en raíces como intervención propia | **Falta** — hoy está adentro de poda aérea |
| M-7 | Opción "sin trabajo" | **Falta** — ver §7.2 |

**M-4 merece una aclaración, porque parece que ya funciona y no es exactamente así.** El pedido fue: *"el mapa va a tener que quedar igual hasta que se oprima un botón de restablecer, porque ese mapa es el que tienen que seguir todo el día"*.

Hoy el mapa **no se reinicia al cargar un dictamen** —está en otra vista, así que sobrevive— pero **sí se borra entero cada vez que se aprieta "Generar Ruta"**, y **no existe ningún botón de restablecer**. Del lado del backend la geometría se persiste y no se recalcula, así que el front la lee una vez y la mantiene; lo que falta es el botón explícito, que es lo que el cliente pidió por su nombre.

---

## 10. Orden de conexión

No se conecta todo de una vez. El front sigue funcionando con el mock hasta que cada módulo tenga su endpoint verde en el driver.

| Paso | Qué se conecta | Depende de |
| --- | --- | --- |
| **0** | **Nada** — se aplican §5 y §7 sobre el mock | — |
| 1 | Login | Módulo de autenticación |
| 2 | Listado de reclamos y dashboard | Reclamos y filtros |
| 3 | Validación del par (SUA, año) | Reclamos |
| 4 | Formulario de dictamen y firma | Dictamen completo |
| 5 | Planificación y pre-confirmación | Rutas y balanceador |
| 6 | Tormenta | Protocolo de tormenta |
| 7 | Panel de administración | Administración |
| 8 | Cola offline y Service Worker | Todo lo anterior |

**El paso 0 es el que conviene empezar ya, y es enteramente de Ale.** Las correcciones de §5 y los campos de §7 **no necesitan backend**: se hacen sobre el `DB` mock, mejoran la demo desde el día uno, y cuando llegue el SDK lo único que cambia es de dónde salen los datos. Sacar el hash falso, eliminar la matrícula, partir el par (SUA, año) y sumar los campos del formulario físico se puede hacer hoy.

**Hasta el paso 8 la app requiere conexión**, y está bien: el offline es lo último porque es lo que más depende de que el resto esté estable. Conectarlo antes obligaría a depurar dos cosas a la vez —la cola y el endpoint— cada vez que algo falle.

---

## 11. Resumen para repartir el trabajo

| Grupo | Cantidad | Necesita backend | De quién |
| --- | --- | --- | --- |
| §5 · Correcciones | 16 | **No** | Ale |
| §6 · Lógica que se va | 7 | Sí | Los dos |
| §7 · Campos y restricciones | ~20 campos + 4 reglas | **No** para los campos | Ale |
| §8 · Pantallas nuevas | 6 | Sí, salvo P-2 | Los dos |
| §9 · Pedidos de la minuta | 6 pendientes | Parcial | Ale |

**Más de la mitad del trabajo del front no depende del backend**, y ese es el resultado útil de haber hecho este inventario: no hay que esperar a nada para empezar.

**Y ninguno de estos cambios reescribe el prototipo.** Se sacan tres cosas que mienten, se elimina un campo, se parten dos campos en cuatro, se suman los campos que el formulario físico ya tiene en papel, y se agregan seis pantallas que el diseño pide. El aspecto, la navegación y el estilo quedan como están — que era la condición desde el principio.

---

## 12. Qué pasó con la app Expo

Había dos aplicaciones en el repositorio: el prototipo estático y una app Expo / React Native con Firebase.

La app Expo usaba otra tecnología y otra base, y **contradecía la documentación técnica**, que define una aplicación web responsive con base en la nube tipo Supabase. Se eliminó de la rama el 18/08 (D-33, DV-06). El historial de git la conserva y se puede recuperar en cualquier momento.

`docs/04-estado-del-codigo.md` describe todavía esa app: **quedó desactualizado a propósito** hasta que se decida si se reescribe o se marca como registro histórico del relevamiento de código.

> **Deuda de seguridad heredada**: `services/firebase.ts` tenía credenciales versionadas. El archivo ya no está, pero **siguen en el historial**. Conviene desactivar ese proyecto de Firebase o restringir la clave por dominio, ya que no se va a usar más.
