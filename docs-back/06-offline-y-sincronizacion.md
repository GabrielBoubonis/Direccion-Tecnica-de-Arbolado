# Trabajo sin conexión y sincronización

> Última actualización: 18/08/2026 · Estado: **en diseño, sin aprobar**

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

- **El parque de dispositivos es conocido y homogéneo.** No hay que diseñar para "cualquier celular que traiga cada uno". Si el captor es Android —falta confirmarlo—, la sincronización en segundo plano funciona como está diseñada y iOS queda fuera del alcance por una condición **real**, no por un supuesto de conveniencia.
- **El costo de los datos no es del ingeniero.** Aun así las fotos se comprimen igual, y no por ahorrar plata: se comprimen porque **subir menos bytes con una barra de señal es la diferencia entre que el envío entre o quede colgado**. El cuello de botella en campo es la señal, no la factura.

Como el plan de datos lo paga la repartición, sí se aprovecha para lo contrario: al planificar la jornada **con conexión**, se precarga todo lo que el ingeniero va a necesitar sin señal —reclamos reservados, geometría de la ruta, parámetros vigentes, catálogo de especies—, en vez de racionar la descarga.

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
| Respeta el orden | Se envían en el orden en que se cargaron |
| No se atasca | Una operación que falla por regla de negocio sale de la cola; no bloquea a las que siguen |

Distinción clave: **un error de red se reintenta; un error de negocio no.** Si el servidor responde "este reclamo ya fue dictaminado", reintentar mil veces no va a cambiar la respuesta. Esa operación se mueve a la bandeja de conflictos y la cola sigue.

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
| Ver el dashboard | No, muestra los últimos datos conocidos |
| Consultar un reclamo fuera de la ruta | No |

La única restricción real es tomar trabajo nuevo, y es deliberada: es lo que garantiza que nadie duplique el trabajo de otro.

---

## 7. La bandeja de conflictos

Cuando una operación se rechaza por regla de negocio, va a una bandeja donde el ingeniero ve **qué pasó y qué puede hacer**.

El caso típico y casi único: *"El reclamo 4821/2024 ya fue dictaminado por Pérez el 14/08. Tu carga quedó guardada."*

Desde ahí puede consultar lo que había cargado, copiarlo a otro reclamo si el árbol era el mismo con otro número, o descartarlo.

**El trabajo de campo nunca se descarta solo.** Veinte minutos frente a un árbol no se pierden porque el sistema decidió que ya no servían.

---

## 8. Las fotos

Pesan mucho más que todo lo demás, así que van por un camino aparte:

- Se comprimen en el dispositivo antes de encolarse. Una foto de doce megapíxeles no aporta nada respecto de una redimensionada.
- Se suben **antes** que el dictamen que las referencia, para que este no espere.
- Se reintentan por separado: si falla la foto 3 de 5, no se reenvían las otras cuatro.
- Un dictamen se puede enviar con sus fotos todavía en camino; se vinculan cuando llegan.

---

## 9. Límites honestos

**Sin señal, el reloj es el del celular.** Si está mal configurado, la fecha del dictamen sale mal. Se detecta comparando contra el reloj del servidor al sincronizar y **se registra la discrepancia** en vez de aceptarla en silencio (ver `02-modelo-de-datos.md` §7).

**La cola tiene un límite razonable.** Si un ingeniero acumulara cien dictámenes sin sincronizar nunca, el sistema avisa que hay demasiado sin enviar. Es una situación que no debería darse, pero avisar es mejor que llenar el almacenamiento del dispositivo.

**Si el usuario limpia los datos del navegador, la cola se pierde.** No hay forma de evitarlo desde una aplicación web. Se mitiga avisando de forma visible cuando hay trabajo sin enviar, para que nadie limpie el navegador con cinco dictámenes adentro.

---

## 10. Qué falta definir

- Cuánto tiempo se conserva un borrador sin actividad antes de descartarlo.
- Si conviene avisar activamente al ingeniero cuando lleva mucho tiempo sin sincronizar, y a partir de cuánto.
