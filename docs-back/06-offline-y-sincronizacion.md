# Trabajo sin conexión y sincronización

> Última actualización: 21/08/2026 · Estado: **en diseño, sin aprobar**
> Reescrito tras la auditoría del 20/08 (`09-decisiones-20260820.md` §6): fotos al final, orden por dependencias, almacenamiento persistente, blindaje y corte de sesión.

---

## 1. Las condiciones reales de campo

El diseño no asume "a veces se cae internet". Asume todo esto, porque todo esto pasa:

| Situación | Frecuencia |
| --- | --- |
| Sin señal en una cuadra, con señal en la siguiente | Permanente |
| Señal que existe pero no transmite (una barra, timeout) | Muy frecuente |
| Celular viejo y lento, que tarda en responder | Frecuente |
| El navegador cierra la pestaña por falta de memoria | Frecuente en gama baja |
| Batería agotada a mitad del formulario | Ocasional |
| Jornada entera sin conectividad | Ocasional |

La peor de todas no es la falta de señal: es la **señal mala**, donde la petición no falla rápido sino que queda colgada. Un diseño que solo contempla "online u offline" se rompe justo ahí.

### El dispositivo es provisto, y eso importa

En la calle no usan el celular propio: la Municipalidad entrega un equipo al que llaman **captor**, con los datos móviles incluidos y pagos por la repartición (A-04, A-05). Dos consecuencias de diseño:

- **El parque de dispositivos es conocido, homogéneo y Android** (confirmado el 19/08). No hay que diseñar para "cualquier celular que traiga cada uno", la sincronización en segundo plano funciona como está diseñada, y **iOS queda fuera del alcance por una condición real de la repartición**, no por un supuesto de conveniencia nuestro. Es una diferencia importante para la defensa: una limitación heredada del entorno se justifica sola; una elegida por el equipo hay que defenderla.
- **El costo de los datos no es del ingeniero.** Aun así las fotos se comprimen igual, y no por ahorrar plata: se comprimen porque **subir menos bytes con una barra de señal es la diferencia entre que el envío entre o quede colgado**. El cuello de botella en campo es la señal, no la factura.

Como el plan de datos lo paga la repartición, sí se aprovecha para lo contrario: al **confirmar la jornada** —el último momento con señal garantizada, ver `03-reglas-de-negocio.md` §8 bis— se precarga todo lo que el ingeniero va a necesitar sin señal: reclamos reservados con su ficha completa, geometría de la ruta, parámetros vigentes, catálogo de especies y cortes de complejidad. Nada de racionar la descarga.

---

## 2. Las tres capas

### Capa 1 — Borrador continuo

El formulario de dictamen **se guarda solo mientras se escribe**, en el almacenamiento local del dispositivo. No hay botón de guardar borrador ni recordatorio: si el celular muere en el campo `observaciones`, al volver a abrir la aplicación el formulario está donde estaba.

Es la capa que responde a "se apagó el teléfono", que ninguna cola de sincronización resuelve, porque el dato nunca llegó a existir como operación.

### Capa 2 — Cola de salida durable

Cuando el ingeniero confirma y firma, la operación **no se envía**: se escribe en una cola persistente en el dispositivo y se le confirma al usuario que quedó registrada.

| Propiedad | Cómo se resuelve |
| --- | --- |
| Sobrevive al cierre del navegador | Almacenamiento durable, no memoria |
| Sobrevive a quedarse sin batería | Se escribe antes de confirmar al usuario |
| No duplica al reintentar | Cada operación lleva su clave de idempotencia |
| Respeta las dependencias | Cada operación declara **de qué depende**; no hay orden global |
| No se atasca | Ni por una regla de negocio, ni por una operación pesada |

Distinción clave: **un error de red se reintenta; un error de negocio no.** Si el servidor responde "este reclamo ya fue dictaminado", reintentar mil veces no va a cambiar la respuesta. Esa operación se mueve a la bandeja de conflictos y la cola sigue.

### El orden es por dependencia, no por llegada

El diseño anterior pedía **orden estricto de encolado**. La justificación era correcta pero acotada: un alta de oficio tiene que entrar antes que el dictamen de ese mismo reclamo. **Eso es una dependencia, no un orden global.**

Con un FIFO estricto, una foto de 400 KB que da timeout **bloquea los diez dictámenes que están detrás** — exactamente al revés de lo que conviene con señal mala, donde lo valioso y liviano tiene que salir primero.

Prioridad de envío:

`dictamen` → `alta_reclamo` → `visita` → `correccion_punto` → `foto`

Las fotos **siempre últimas**. Cada operación lleva anotado de qué depende, y solo eso la retiene: un dictamen espera al alta de su reclamo, una foto espera a su dictamen, y nadie espera a nada más.

### Capa 3 — Envío en segundo plano

Un trabajador en segundo plano envía la cola cuando hay conexión, **aunque la aplicación esté cerrada**. El ingeniero puede guardar el celular en el bolsillo después de firmar, y el dictamen viaja solo cuando pase por una zona con señal.

Reintentos con espera creciente: unos segundos, después más, hasta un tope de varios minutos. Sin esto, veinte dictámenes reintentando en un loop agotan la batería, que en campo es un recurso tan escaso como la señal.

---

## 3. Cómo se detecta que hay conexión

El indicador del navegador **miente**: dice que hay conexión cuando el celular está enganchado a una antena que no transmite. Por eso la conectividad se decide por el resultado real de las peticiones, no por lo que el navegador declara: si la última petición funcionó, hay conexión; si dio timeout, no la hay, sin importar cuántas barras muestre la pantalla.

Todas las peticiones llevan un tiempo límite. Sin eso, una señal mala deja al ingeniero mirando una ruedita que gira sin fin, que es peor que un mensaje de error: no puede ni seguir trabajando ni saber qué pasó.

---

## 4. Qué ve el ingeniero

Tres estados, siempre visibles, sin tecnicismos:

| Estado | Qué se muestra |
| --- | --- |
| Conectado y al día | Nada, o una marca discreta |
| Trabajando sin conexión | Aviso permanente + cuántos dictámenes esperan enviarse |
| Hay algo que revisar | Aviso destacado + acceso a la bandeja de conflictos |

**Nunca se le miente al usuario.** Si el dictamen está en la cola y no llegó al servidor, no dice "enviado": dice "guardado, se envía cuando haya señal". La diferencia importa cuando alguien pregunta si el dictamen ya está cargado.

Y **nunca se pierde trabajo en silencio**. Si algo no se puede enviar, se ve.

---

## 5. Antes de salir a la calle

El ingeniero planifica su jornada con señal, y en ese momento el dispositivo se lleva el paquete completo: la ruta con su mapa, los reclamos reservados con todos sus datos, los parámetros vigentes y las listas del formulario.

Con eso puede trabajar la jornada entera sin conectarse una sola vez. **Es el principio de campo hecho mecanismo**: si el trabajo ya está reservado y los datos ya están en el dispositivo, la conexión deja de ser necesaria hasta el momento de enviar.

El mapa descargado **no se recalcula durante la jornada**, cumpliendo el pedido de la minuta.

### Confirmar la jornada hace cuatro cosas, no una

Es el último momento con señal garantizada. Todo lo que necesita red se hace acá:

| Paso | Por qué acá |
| --- | --- |
| 1. **Blindar** los reclamos (RF-34) | Nadie más los toca, y **ningún job del servidor los modifica** mientras el ingeniero los tiene encima |
| 2. **Renovar la sesión** de servidor | La cola puede tener que enviar a las once de la noche, y a esa hora el token de la mañana ya venció |
| 3. Pedir **almacenamiento persistente** | Sin esto, el navegador puede borrar la cola |
| 4. **Precargar** todo | Reclamos, puntos, geometría, parámetros, catálogos |

**El paso 1 es el que cambia el diseño.** Sin blindaje, el job nocturno de escalamiento puede subirle la prioridad a un reclamo a las dos de la mañana mientras el ingeniero lleva en el bolsillo una copia con la prioridad vieja, y al volver el servidor y el dispositivo discrepan sobre un dato que él nunca pudo ver cambiar. **El dato no se puede mover bajo los pies del que está en la calle**, porque en la calle no hay forma de enterarse.

### El almacenamiento tiene que ser persistente, y eso condiciona el despliegue

**IndexedDB es descartable por defecto.** Bajo presión de almacenamiento, Android puede vaciarla sin avisar y sin preguntar. Ahí adentro viven dictámenes firmados con validez legal.

La única defensa es pedir `navigator.storage.persist()`, y se pide al confirmar la jornada. Antes de precargar se verifica el espacio disponible con `navigator.storage.estimate()`.

> **Requisito de despliegue para el CIL: el captor tiene que tener la aplicación instalada como PWA, no abierta en una pestaña.** Chrome en Android le concede almacenamiento persistente a las aplicaciones instaladas y se lo niega a las pestañas. Es una condición de instalación, no una recomendación.

Si la persistencia no se puede garantizar, el ingeniero **sale igual**, pero avisado con todas las letras. No se le bloquea la jornada por una condición del dispositivo; tampoco se lo deja creer que está a salvo.

---

## 6. Qué se puede hacer sin conexión

| Acción | Sin señal |
| --- | --- |
| Ver la ruta y el mapa del día | Sí |
| Ver los reclamos reservados | Sí |
| Cargar y firmar un dictamen | Sí |
| Sacar fotos y adjuntarlas | Sí, se encolan |
| Marcar una parada como visitada | Sí |
| Dar de alta un reclamo de oficio | Sí |
| **Tomar trabajo nuevo** | **No** — requiere conexión por diseño (D-14) |
| **Seguir cargando después de que se apagó el equipo** | **No** — hay que reautenticar, y eso exige conexión (RNF-14) |
| Ver el dashboard | No, muestra los últimos datos conocidos |
| Consultar un reclamo fuera de la ruta | No |

La primera restricción es lo que garantiza que nadie duplique el trabajo de otro. **La segunda es una decisión de seguridad tomada a conciencia el 20/08**, sabiendo lo que cuesta.

### Si se apaga el captor en la calle (D-64)

Un usuario tiene **una sola sesión activa**, y la sesión **se corta al apagarse el dispositivo**. Si al captor se le agota la batería a las 14:00 sin señal, el ingeniero **no puede seguir cargando esa tarde**.

Se planteó la alternativa —mantener la jornada abierta en el dispositivo y renovar la sesión de servidor sola— y se descartó:

> Son documentos legales, no se puede jugar. Sin mencionar que el captor puede tener trabajo de otras personas adentro, o darse un uso erróneo, como prestárselo a otra persona. La seguridad vale.

**Lo ya cargado no se pierde.** La cola y los borradores sobreviven en el dispositivo y se envían cuando el ingeniero vuelve a autenticarse. Lo que se pierde es la posibilidad de seguir cargando.

La mitigación es **operativa, no técnica**: el captor sale de la sede cargado y conviene que la repartición prevea batería externa. Es una condición de entorno y se declara como tal.

---

## 7. La bandeja de conflictos

Cuando una operación se rechaza por regla de negocio, va a una bandeja donde el ingeniero ve **qué pasó y qué puede hacer**.

El caso típico y casi único: *"El reclamo 4821/2024 ya fue dictaminado por Pérez el 14/08. Tu carga quedó guardada."*

Desde ahí puede consultar lo que había cargado, copiarlo a otro reclamo si el árbol era el mismo con otro número, o descartarlo.

**El trabajo de campo nunca se descarta solo.** Veinte minutos frente a un árbol no se pierden porque el sistema decidió que ya no servían.

---

## 8. Las fotos

Pesan mucho más que todo lo demás, así que van por un camino aparte:

- Se comprimen en el dispositivo antes de encolarse, a menos de 400 KB. Una foto de doce megapíxeles no aporta nada respecto de una redimensionada, y con una barra de señal cada byte decide si el envío entra o queda colgado.
- Se suben **después** del dictamen que las referencia, nunca antes.
- Se reintentan por separado: si falla la foto 3 de 5, no se reenvían las otras cuatro.
- Un dictamen se puede enviar con sus fotos todavía en camino; se vinculan cuando llegan.
- Un **reclamo dado de alta en la calle también puede llevar fotos** (RF-36), por el mismo camino.

### Por qué las fotos van últimas y no primeras (H-01)

Este documento decía antes que las fotos suben **primero**, "para que el dictamen no espere". Estaba mal, y de dos maneras.

**Rompía la integridad.** `dictamen_foto.dictamen_id` es una clave foránea contra `dictamen`. Si la foto llega primero, la fila del dictamen no existe todavía y **la FK falla**: el primer dictamen con fotos que se sincronizara habría devuelto un error de integridad.

**Y era peor operativamente.** Con señal mala conviene que salga primero lo chico y valioso. Un dictamen firmado al que le falta una foto es un dictamen válido con una foto pendiente; una foto sin dictamen no es nada, y encima queda como objeto huérfano en storage.

**Cómo funciona ahora.** El cuerpo del dictamen **declara cuántas fotos vienen**. El servidor crea esa cantidad de filas en estado `esperando`, y cada foto que llega completa una. No se pierde nada de lo que este párrafo quería: el dictamen sigue sin esperar a las fotos, que era el objetivo.

---

## 9. Límites honestos

**Sin señal, el reloj es el del celular.** Si está mal configurado, la fecha del dictamen sale mal. Se detecta comparando contra el reloj del servidor al sincronizar y **se registra la discrepancia** en vez de aceptarla en silencio. Si supera las **24 horas**, el dictamen se acepta igual pero **el job de vencimientos no lo procesa** hasta que el Administrador confirme o corrija la fecha (D-67): un vencimiento legal es una fecha que alguien tiene que poder defender.

**La cola tiene un límite razonable.** Si un ingeniero acumulara cien dictámenes sin sincronizar nunca, el sistema avisa que hay demasiado sin enviar. Es una situación que no debería darse, pero avisar es mejor que llenar el almacenamiento del dispositivo.

**Si el usuario limpia los datos del navegador, la cola se pierde.** No hay forma de evitarlo desde una aplicación web. Se mitiga avisando de forma visible cuando hay trabajo sin enviar, para que nadie limpie el navegador con cinco dictámenes adentro.

**Si el captor no vuelve nunca —robo, destrucción, olvido— el trabajo de esa jornada se pierde.** Se dice sin vueltas. Lo que el diseño garantiza es que la pérdida esté **acotada y sea conocida**: el blindaje enumeró exactamente qué reclamos estaban en juego y con quién, al día siguiente vuelven a circulación, y el Administrador puede dar de baja el equipo para que no pueda escribir nada más (RF-35).

**Si el captor aparece después de la baja**, lo que traiga adentro **no se descarta**: queda en cuarentena y una persona decide. Un equipo robado no debe escribir dictámenes; uno olvidado en un cajón y recuperado a la semana puede traer trabajo de campo perfectamente válido.

---

## 10. Borradores y aviso de sincronización

Las dos preguntas que estaban abiertas acá se cerraron el 20/08.

### El sistema no descarta borradores solo (D-57)

A los **30 días sin actividad** un borrador pasa a **inactivo** y aparece en una bandeja aparte, para que el ingeniero decida si lo retoma o lo descarta. **Nunca se elimina por su cuenta.**

Un borrador puede tener adentro trabajo de campo real —para eso existe, ver §7— y era el único punto del diseño donde se perdía trabajo humano sin que nadie lo mirara.

### El aviso de sincronización es escalonado (D-58)

| Momento | Qué pasa |
| --- | --- |
| Hay señal y la cola se vacía sola | Nada, solo el indicador |
| Se **cierra la jornada** con cola pendiente | Aviso destacado: cuántos son y que están **solo en el dispositivo** |
| Pasadas **48 horas** con cola pendiente | Aviso al abrir la aplicación, que hay que confirmar para seguir |

**Nunca bloquea el trabajo.** Pero deja de ser algo que se pueda no ver: son dictámenes firmados, con validez legal, que existen en un solo lugar y ese lugar es un celular.

---

## 11. La ventana de sincronización tardía

Un dictamen cargado a las 16:00 sin señal puede llegar al servidor a las 23:00, cuando el dispositivo pasa por una zona con cobertura y el trabajador en segundo plano despierta **con la aplicación cerrada**.

A esa hora el token de la mañana ya venció. Si el servidor respondiera `401`, la respuesta razonable sería "pedir reautenticar", **pero no hay a quién pedírselo**: no hay nadie mirando la pantalla.

Por eso la sesión de servidor **se renueva a la fuerza al confirmar la jornada** (§5), corriendo la ventana hasta cubrir la sincronización tardía. Y si aun así hace falta reautenticar, el indicador lo dice **con esas palabras** —"hay que volver a iniciar sesión"— y no como "sin señal". La cola espera; no descarta nada.
