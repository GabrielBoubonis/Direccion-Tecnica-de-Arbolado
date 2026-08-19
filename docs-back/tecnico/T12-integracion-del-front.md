# T12 — Integración del front

> Diseño técnico · Última actualización: 19/08/2026 · Estado: **sin aprobar**
> Responde: cómo el prototipo estático pasa de datos simulados a la API sin cambiar lo que se ve.

---

## 1. La regla: el front no se pisa

`ArboladoRosario/index.html` y `login.html` son el prototipo estático responsive que se le mostró al profesor: Leaflet para el mapa, OSRM para la ruta, `signature_pad` para la firma, y un objeto `DB` simulado en memoria.

**Mantiene su aspecto y su comportamiento visible.** Lo único que cambia es que el `DB` mock se reemplaza por llamadas al SDK contra la API.

Que esa regla esté escrita tiene un motivo práctico: el front es la demo que ya funciona y que el equipo entiende. Reescribirlo para "hacerlo prolijo" arriesgaría lo único que hoy está probado ante el docente, a cambio de nada que el trabajo necesite.

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
| `validarReclamoSua()` | Validación local **y** `GET /reclamos/validar` |
| `sugerirEpoca()` | Viene calculada en la respuesta del dictamen |
| `renderCheckboxesExcluyentes()` | **Se queda igual**: el front valida por comodidad |
| `obtenerGeo()` | Se queda: sirve para la captura del dictamen |

### Qué lógica se migra al backend

Escalamiento de prioridades, balanceador, cálculo de ruta, validación del par (SUA, año), sugerencia de época y complejidad, e inferencia de categoría.

### Qué se **duplica** a propósito

Las validaciones de exclusión (RF-14) y la validación de formato del par (SUA, año). **El front valida por comodidad, el backend valida por obligación.** El front deshabilita casillas para que el ingeniero no se equivoque; el backend vuelve a validar porque no puede confiar en el cliente. Un dictamen es un documento con validez legal y su coherencia no puede depender de que el JavaScript se haya ejecutado.

---

## 4. Los cambios que sí hay que hacer en el front

Son pocos y están todos justificados por una decisión o un desvío. **Ninguno cambia el aspecto general ni el flujo.**

| # | Cambio | Archivo | Origen | Tamaño |
| --- | --- | --- | --- | --- |
| 1 | `--medium` de azul a **amarillo** | `index.html` | DV-08 | Una línea |
| 2 | "Correo Institucional / Legajo" → **"Usuario"**, ejemplo `gboubon0` | `login.html` | DV-13 | Dos líneas |
| 3 | **Quitar** el campo "N° Matrícula Profesional" | `index.html` | DV-10 | Un bloque |
| 4 | `T_DICT` de 7 a **10**, leído de parámetros | `index.html` | DV-02 | Una línea |
| 5 | `nsum` de un campo a **dos**: número y año | `index.html` | D-41 | Un formulario |
| 6 | Mostrar **precisión** del punto en el mapa | `index.html` | D-46 | Un estilo |
| 7 | Agregar la **pantalla de pre-confirmación** | `index.html` | D-53 | Pantalla nueva |
| 8 | Mostrar **diámetro** junto al perímetro | `index.html` | D-43 | Un campo calculado |
| 9 | Indicador de **estado de sincronización** | `index.html` | T8 | Un elemento fijo |

### Los dos que valen una explicación

**#3, quitar la matrícula.** Hoy el formulario pide "N° Matrícula Profesional" como campo a tipear en cada dictamen. Ese dato **ya no existe**: firmar es atributo del rol (D-50), y lo que se sella es legajo, rol y versión de configuración de firma, todo del lado del servidor. Pedirle al ingeniero que tipee un número que el sistema no usa sería pedirle trabajo por nada.

**#5, partir el `nsum`.** El mock usa `nsum: '2026-0001'`, un solo string. El número real del SUA son **dos campos separados**: se elige el año y se busca el número dentro de ese año (A-08, D-41). Es lo primero que toca el ingeniero en el momento más incómodo —de pie, en la calle, con sol— así que la forma del campo importa más de lo que parece: un selector de año más un número corto se tipea mucho más rápido que un código compuesto.

### La pantalla nueva

**#7 es el único agregado de peso.** La pre-confirmación de jornada (D-53) es una pantalla que hoy no existe: aparece entre "planificar" y "salir a la calle", muestra los casos **ya reservados**, y permite corregir puntos del mapa, sacar casos, corregir la categoría y reordenar paradas antes de confirmar.

Es donde el ingeniero se toma el tiempo que necesite **sabiendo que nadie le va a sacar un caso mientras decide**, y es el último momento con señal garantizada, así que también es donde se precarga todo lo offline.

---

## 5. Dos pedidos de la minuta que el front tiene que respetar

**El mapa de la ruta no se reinicia al cargar un dictamen.** Solo se limpia con un botón explícito de "restablecer": *"ese mapa es el que tienen que seguir todo el día"*. Del lado del backend, la geometría se persiste y no se recalcula, así que el front la lee una vez y la mantiene. Que el mapa cambie solo se vuelve **imposible por diseño**, no por cuidado del programador.

**Filtro por distrito** en el listado y en el dashboard, y **botón de consulta de reclamo por dirección**. Los dos tienen endpoint propio (T6 §3).

---

## 6. Orden de conexión

No se conecta todo de una vez. El front sigue funcionando con el mock hasta que cada módulo tenga su endpoint verde en el driver:

| Paso | Qué se conecta | Depende de |
| --- | --- | --- |
| 1 | Login | Módulo de autenticación |
| 2 | Listado de reclamos y dashboard | Reclamos y filtros |
| 3 | Validación del par (SUA, año) | Reclamos |
| 4 | Formulario de dictamen y firma | Dictamen completo |
| 5 | Planificación y pre-confirmación | Rutas y balanceador |
| 6 | Tormenta | Protocolo de tormenta |
| 7 | Cola offline y Service Worker | Todo lo anterior |

**Hasta el paso 7 la app requiere conexión**, y está bien: el offline es lo último porque es lo que más depende de que el resto esté estable. Conectarlo antes obligaría a depurar dos cosas a la vez —la cola y el endpoint— cada vez que algo falle.

---

## 7. Qué pasó con la app Expo

Había dos aplicaciones en el repositorio: el prototipo estático y una app Expo / React Native con Firebase.

La app Expo usaba otra tecnología y otra base, y **contradecía la documentación técnica**, que define una aplicación web responsive con base en la nube tipo Supabase. Se eliminó de la rama el 18/08 (D-33, DV-06). El historial de git la conserva y se puede recuperar en cualquier momento.

`docs/04-estado-del-codigo.md` describe todavía esa app: **quedó desactualizado a propósito** hasta que se decida si se reescribe o se marca como registro histórico del relevamiento de código (ver preguntas abiertas).

> **Deuda de seguridad heredada**: `services/firebase.ts` tenía credenciales versionadas. El archivo ya no está, pero **siguen en el historial**. Conviene desactivar ese proyecto de Firebase o restringir la clave por dominio, ya que no se va a usar más.
