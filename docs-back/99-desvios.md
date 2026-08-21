# Desvíos respecto del documento académico

> Registro de todo lo que el diseño del backend hace distinto de lo que dice el documento técnico entregado.
> Cada entrada indica si hay que corregir el `.docx` antes de la entrega final.

Existe porque el documento se entrega y se defiende. Un desvío no documentado es una pregunta del profesor sin respuesta.

> Estado al 21/08/2026: **22 desvíos**, de los cuales **19 exigen corregir el `.docx`**. Los siete requerimientos nuevos que el documento académico no tiene son **RF-33 a RF-38 y RNF-14**, registrados en DV-17 a DV-22.

---

## DV-01 — Los adaptadores son catorce, no dos

**Qué dice el documento.** Sección 1.4 y diagrama de clases: dos interfaces, `IReclamoProvider` e `IAuthProvider`. Los dictámenes y rutas se guardan en Supabase como base propia del módulo.

**Qué hacemos.** Todo acceso a datos va detrás de un puerto: se suman repositorios de dictamen, ruta, reserva, perfil, parámetros, auditoría y captores, más storage, ruteo, geocodificación y reloj.

> Eran doce cuando se escribió este desvío. La geocodificación se sumó al confirmarse que el SUA no tiene coordenadas (DV-12) y los captores salieron de la auditoría del 20/08 (DV-18). **Que el número crezca es el desvío funcionando**: cada puerto nuevo es un acoplamiento que se detectó antes de escribirlo, no después.

**Por qué.** El documento asume que Supabase se queda como base propia y que solo se reemplazan los dos conectores externos. La premisa real del proyecto es otra: Supabase se va **entero**. Con solo dos adaptadores, el día de la transferencia habría que reescribir toda la capa de persistencia, que es exactamente lo que RNF-08 dice que no debería pasar.

**¿Corregir el `.docx`?** **Sí.** Actualizar el diagrama de clases (8.2) y la sección 1.4. Es un desvío que *fortalece* el argumento de desacoplamiento, así que conviene que esté en el documento que se defiende.

---

## DV-02 — Tiempo por dictamen: 10 minutos, no 7

**Qué dice el documento.** RF-21: 10 minutos por dictamen, configurable.

**Qué hay en el código.** `app/rutas.tsx` y `app/tormenta.tsx` usan la constante `T_DICT = 7`, y además fija en el código.

**Qué hacemos.** Se toma el valor del documento (10) y se lo lleva a la tabla de parámetros, como pide RNF-09.

**¿Corregir el `.docx`?** No. El documento está bien; era el código el que estaba desalineado.

---

## DV-03 — La prioridad por colores vive del lado del módulo, no del SUA

**Qué dice el documento.** El modelo entidad-relación pone `estado_sua` en la entidad `RECLAMO` y trata la prioridad como un atributo del reclamo.

**Qué hacemos.** La prioridad vigente y su historial de escalamiento viven en el esquema propio del módulo (`arbolado.reclamo_estado`), no en el simulado del SUA.

**Por qué.** El SUA real no tiene matriz de priorización por colores: es una de las mejoras **propuestas** en el relevamiento, no una capacidad existente. Si la guardáramos del lado del SUA simulado, el prototipo estaría simulando una funcionalidad que el sistema real no tiene, y el diseño se caería el día de la conexión.

**¿Corregir el `.docx`?** **Sí**, con una aclaración en la sección 7.2 (decisiones de diseño del MER). Refuerza el análisis en vez de debilitarlo.

---

## DV-04 — La reserva de trabajo previa no está en el documento

**Qué dice el documento.** No contempla el problema: `RUTA_INSPECCION` y `DETALLE_RUTA` planifican, pero nada impide que dos ingenieros planifiquen el mismo reclamo el mismo día.

**Qué hacemos.** Se agrega la entidad `reserva` y la regla de que no se puede dictaminar un reclamo no reservado a nombre propio.

**Por qué.** Con varios ingenieros en campo y trabajo offline, sin reserva previa dos personas pueden dictaminar el mismo árbol y una de las dos pierde el trabajo. Resolver el conflicto después es peor que evitarlo antes, y evitarlo es posible porque pedir trabajo siempre ocurre conectado.

**¿Corregir el `.docx`?** **Sí.** Suma una entidad al MER y un caso de uso. Es material fuerte para la defensa: muestra que el diseño anticipó un problema operativo real.

---

## DV-05 — El vencimiento devuelve el reclamo a la cola

**Qué dice el documento.** RF-19 calcula el vencimiento a 18 meses y RF-05 avisa los próximos a vencer, pero **ningún requerimiento dice qué pasa cuando efectivamente vence**.

**Qué hacemos.** Al vencer, el reclamo vuelve a la lista de pendientes marcado como `vencido_redictaminar`, con el dictamen anterior consultable como historial.

**Por qué.** Sin esto el vencimiento es decorativo. Y forestalmente corresponde: en 18 meses el ejemplar cambió y la evaluación previa ya no autoriza legalmente una intervención.

> **Confirmado por la repartición (18/08).** Ante la consulta A-11 respondieron exactamente eso: *"después de 18 meses el dictamen ya no es acorde a la problemática real del árbol, por lo tanto se vuelve a dictaminar"*. Deja de ser una deducción nuestra y pasa a ser el circuito real, que el documento no había registrado.

**¿Corregir el `.docx`?** **Sí.** Es un requerimiento faltante, no un desvío. Conviene agregarlo como RF nuevo.

---

## DV-06 — La app Expo queda fuera del alcance

**Qué dice el documento.** El diagrama de despliegue (8.3) describe una PWA / Web App servida desde Vercel.

**Qué hay en el repositorio.** Una app Expo / React Native con Firebase, y aparte el prototipo estático `index.html` + `login.html`.

**Qué hacemos.** El front es el prototipo estático responsive. La app Expo queda fuera del alcance y Firebase se descarta en favor de Supabase.

**¿Corregir el `.docx`?** No el documento. El repositorio **ya se corrigió**: la app Expo, Firebase y todo el andamiaje de React Native se eliminaron de la rama el 18/08. Quedan solo `index.html` y `login.html`, que son autocontenidos y no referencian ningún archivo local.

> **Nota de seguridad.** `services/firebase.ts` tenía credenciales de un proyecto Firebase versionadas. Aunque una API key web de Firebase no es secreta por diseño, **sigue estando en el historial de git**. Conviene desactivar ese proyecto Firebase o restringir la key por dominio, ya que no se va a usar más.

---

## DV-07 — Las bajadas de línea son más que porcentajes por prioridad

**Qué dice el documento.** RF-24 define los presets como una distribución porcentual por nivel de prioridad, con la posibilidad de asignar el 100% a una sola.

**Qué hacemos.** Se agrega la entidad `directiva_jornada`, que además de la prioridad restringe zona, categoría de reclamo, protocolo, volumen, modo de traslado y antigüedad; tiene ámbito (global, por distrito o por usuario), vigencia con caducidad automática y marca de obligatoria o sugerida.

**Por qué.** En la práctica una bajada de línea no es "60% urgentes": es "esta semana todo el equipo a Distrito Oeste, solo casos de cableado, veinte por jornada". Con solo porcentajes por prioridad, la mitad de esa directiva no se puede expresar y termina comunicándose de palabra, que es exactamente el problema de discrecionalidad que el proyecto quiere resolver.

**¿Corregir el `.docx`?** **Sí.** Conviene reescribir RF-24 y sumar la entidad al MER. Es material fuerte para la defensa: muestra que el diseño escuchó cómo se dirige el trabajo realmente, en vez de quedarse con la primera formulación del requerimiento.

---

## DV-08 — La prioridad media es amarilla, no azul

**Qué dice el relevamiento.** La minuta define una escala de cuatro niveles representados por colores: verde (baja), **amarillo (media)**, naranja (alta) y rojo (urgente).

**Qué hay en el front.** `index.html` define `--medium: #3b82f6`, que es azul, y `--low: #10b981`, que es verde esmeralda. La escala real que se ve en pantalla es verde-azul-naranja-rojo.

**Qué hacemos.** El backend usa la escala documentada. El front tiene que corregir el token de prioridad media a amarillo.

**Por qué importa.** No es un detalle estético. La escala de colores es la mejora central que propone el relevamiento para estandarizar la priorización, y un azul en el medio rompe la lectura de semáforo que la vuelve intuitiva: verde-amarillo-naranja-rojo se entiende sin leyenda, verde-azul-naranja-rojo no.

**¿Corregir el `.docx`?** No. Se corrige el front, cambiando una variable de color. Es el único cambio de front identificado hasta ahora, y es de una línea.

---

## DV-09 — La etiqueta de tormenta todavía no existe en el SUA

**Qué dice el documento.** RF-28 lista los reclamos "derivados con la etiqueta especial de tormenta", dando por hecho que esa marca existe hoy.

**Qué nos respondieron (A-03).** No existe: es *"un agregado que tiene que hacer el CIL en el SUA"*. Lo dan por sencillo y por fuera de nuestro alcance.

**Qué hacemos.** El adaptador la lee como estaba diseñado, porque el día que el CIL la agregue el circuito cierra solo. Mientras tanto la marca se puede poner de dos maneras dentro del módulo: el **Administrador** la aplica sobre reclamos existentes, y el **ingeniero** la pone al dar de alta un caso en campo durante el temporal, que ya estaba previsto (RF-30).

**Por qué.** El protocolo de tormenta es el módulo que más depende de un dato de terceros, y es el que se usa el peor día del año. Si dependiera **solo** de que el CIL implemente la etiqueta, el sistema quedaría inutilizable en la emergencia justo mientras esa implementación se gestiona. Con la marca aplicable desde adentro, el módulo funciona el primer día y mejora cuando llegue la etiqueta.

**¿Corregir el `.docx`?** **Sí.** RF-28 tiene que decir que la etiqueta es una **mejora propuesta con dependencia del CIL**, no una capacidad existente, y sumar quién la asigna mientras tanto.

---

## DV-10 — Firmar es atributo del rol: se cae la matrícula y también la habilitación individual

> **Es el desvío más fuerte de la lista y contradice dos requerimientos.** Se documenta completo porque es exactamente el tipo de cosa que el profesor va a preguntar.

**Qué dice el documento.** RF-02 distingue dentro del rol Operario a los **matriculados**, que son los únicos que pueden firmar. RF-18 exige "matrícula profesional registrada". CU-08 lista "matrícula con formato inválido" como excepción del caso de uso.

**Qué pasó, en dos pasos.**

1. Se preguntó qué forma tiene la matrícula (A-07). La respuesta de la Dirección fue que **no lo saben**, y que se podría reemplazar por el título profesional presentado en RRHH.
2. Se repreguntó quién decide entonces que alguien queda habilitado. La definición funcional fue que **firma quien tiene rol operativo, por ser usuario operativo**, y que lo que hace falta es un apartado único para configurar la firma digital. Al revisar el alcance se acotó a **Operario y Jefe**: el Administrador queda afuera porque la sección 3 del propio documento lo define como *personal del CIL*, y un dictamen técnico no lo firma alguien de sistemas.

**Qué hacemos.** Desaparecen el campo `matricula` y la habilitación individual. Firmar es atributo del **rol**: firman **Operario y Jefe**, los dos que van a la calle. El Lector no firma porque no opera, y el Administrador tampoco: administra la firma, no la ejerce. En su lugar aparece `config_firma`, el apartado único donde el Administrador configura **cómo** firma el sistema: qué roles pueden hacerlo, qué certificadora se usa, con qué algoritmo se calcula el hash, qué leyenda legal sale al pie y qué datos se sellan. Cada dictamen guarda la versión de esa configuración con la que se firmó.

**Por qué se sostiene.** La constancia profesional ya la hace la Municipalidad al dar de alta a la persona con su rol: si figura como Operario de la Dirección Técnica, el área verificó antes que puede hacer ese trabajo. Un campo propio que repita esa verificación no agrega control, agrega un lugar más donde el dato puede quedar desactualizado — y el sistema no tiene forma de auditar contra RRHH, así que sería un control que aparenta más de lo que puede.

**Qué se pierde, dicho de frente.** El sistema deja de poder impedir que firme un operario que en el papel no debería. Ese control queda del lado del alta de usuarios, fuera del módulo. Lo que **no** se pierde es la separación que importa: quien configura la firma digital no puede usarla. Se mitiga con dos cosas: la lista de roles habilitados es un dato configurable, así que restringirla más adelante es un cambio de configuración y no de código; y toda firma queda auditada con usuario, legajo, rol y versión de configuración.

**Consecuencia en el front.** `index.html` pide hoy "N° Matrícula Profesional" como campo a tipear en cada dictamen. Ese campo se saca: no lo tipea el ingeniero y ya no existe. Es un cambio de front pendiente, junto con el de la pantalla de acceso (DV-13).

**¿Corregir el `.docx`?** **Sí, y es el más importante de todos.** RF-02 (se cae la distinción Operario / Operario matriculado), RF-18 (la condición pasa a ser el rol), RF-19 (el sello guarda legajo, rol y versión de configuración en vez de matrícula), la excepción de CU-08 (deja de ser "formato inválido" y pasa a ser "el rol no puede firmar") y el atributo `matricula` del MER. Conviene además sumar el apartado de configuración de firma como requerimiento nuevo: hoy no existe en el documento.

---

## DV-11 — El Ingeniero en Jefe existe, y es un rol del sistema

**Qué dice el documento.** La sección 3 define tres roles: Lector, Operario y Administrador. Pero HU-12 y HU-13 le dan el balanceador y los perfiles de distribución a un "jefe" que **no figura en el modelo de roles**. La minuta lo proponía como cargo a crear.

**Qué nos respondieron (A-09).** La jefatura ya existe: hay un ingeniero en jefe que suele quedarse atendiendo al público más difícil, y la intención es que **también dictamine en la calle**.

**Qué hacemos.** Se agrega el rol `jefe`: es un operario completo —dictamina y firma si está habilitado— más dos permisos, ver el trabajo de todo el equipo y bajar las directivas de jornada. No hereda usuarios, parámetros, adaptadores ni el entregable para concesionarias.

**Por qué.** Antes de esta respuesta el diseño le cargaba las directivas al Administrador, que era lo correcto si el jefe no existía. Existiendo, obligar a que un tercero cargue la directiva que el jefe decidió agrega una demora sin agregar ningún control. Y separar "dirigir el trabajo" de "administrar el sistema" es lo que evita que el jefe termine con permisos que no necesita.

**¿Corregir el `.docx`?** **Sí.** Sección 3 (modelo de roles), RF-02, y HU-12 y HU-13, que hoy le hablan a un rol inexistente.

---

## DV-12 — El SUA no tiene coordenadas: geocodificar es trabajo del módulo

**Qué dice el documento.** El MER (7.1) guarda `direccion_exacta` y `distrito`, sin ningún campo de coordenadas, y aun así RF-22 y RF-26 piden calcular rutas y dibujar un mapa. El documento nunca explica de dónde sale el punto.

**Qué nos respondieron (B-02).** Solo hay dirección escrita —la del ejemplar, no la del vecino— porque **el censo de arbolado nunca se geolocalizó**.

**Qué hacemos.** Se agrega el puerto `IGeocodificador` (el decimotercero) y la entidad `reclamo_geo`, del lado del módulo y no del SUA simulado. Cada punto guarda su **precisión declarada** (exacta, aproximada, solo calle, fallida), y el ingeniero puede corregirlo en el mapa: está parado frente al árbol, es el único con el dato bueno. Un reclamo sin punto entra igual al listado y queda afuera solo del armado de ruta.

**Por qué del lado del módulo.** Es el mismo razonamiento de DV-03: si guardáramos las coordenadas en el SUA simulado, estaríamos simulando una capacidad que el SUA real no tiene, y el prototipo mentiría en el punto exacto donde después se rompería.

**Consecuencia sobre la insistencia del vecino.** Agrupar reclamos del mismo ejemplar (regla 2 de prioridad) se apoya en calle y altura normalizadas, y solo se afina por cercanía cuando los dos puntos son de precisión buena. Dos puntos aproximados a diez metros no prueban que sea el mismo árbol.

**¿Corregir el `.docx`?** **Sí.** El MER necesita la entidad de geolocalización, y RF-26 tiene que decir que el punto es geocodificado y corregible, no un dato de entrada.

---

## DV-13 — La credencial institucional es un usuario de red, no un correo

**Qué dice el documento.** RF-01 habla de "credenciales institucionales" y RF-31 de "vincular una cuenta institucional existente", sin decir nunca qué es esa cuenta.

**Qué nos respondieron (B-04).** Usuario y contraseña, donde el usuario se arma con la primera letra del nombre, hasta seis letras del apellido y un número correlativo por coincidencias: `gboubon0`.

**Qué hacemos.** Nada en el backend: D-09 ya había decidido que el puerto de autenticación reciba un `identificador` opaco en vez de un `email`, justamente para no depender de esta respuesta. El adaptador de Supabase, que internamente necesita un correo, le agrega el dominio reservado `@arbolado.test` puertas adentro. Los usuarios de prueba pasan a usar el formato real con **personas inventadas**.

**Consecuencia en el front.** `login.html` dice hoy "Correo Institucional / Legajo" con un ejemplo `ejemplo@rosario.gob.ar`. Tiene que decir "Usuario" con un ejemplo del formato real. Es un cambio de dos líneas, del mismo tamaño que el de DV-08.

**¿Corregir el `.docx`?** **Sí**, pero menor: precisar en RF-01 y RF-31 qué es la credencial. Vale la pena mencionarlo en la defensa porque es la mejor evidencia de que el desacoplamiento sirve: cambió el supuesto y no hubo que rehacer nada.

---

## DV-14 — La especie se escribe a mano, y eso condiciona RF-16

**Qué dice el documento.** RF-13 pide cargar la especie del ejemplar y RF-16 va más lejos: sugerir la época de intervención "en función de la estación del año y la especie".

**Qué nos respondieron (A-06).** No hay lista oficial: el ingeniero escribe la especie a mano, *"porque es un ingeniero agrónomo y se conoce hasta el nombre científico del árbol"*.

**Qué hacemos.** El campo queda como texto libre —así está hoy en el prototipo—, con autocompletado sobre un catálogo interno de especies frecuentes (nombre común, nombre científico y sinonimias) y normalización al guardar. La época se calcula **sobre la especie normalizada**; si lo escrito no coincide con nada del catálogo, el dictamen se guarda igual y **el sistema no sugiere época**.

**Por qué.** Imponer un desplegable a alguien que sabe más de especies que la lista sería empeorarle el trabajo para comodidad del programador. Pero sin normalización, "tipa", "tipa blanca" y *Tipuana tipu* son tres especies distintas para el sistema y RF-16 queda decorativo. El catálogo resuelve las dos cosas sin restringir a nadie.

**¿Corregir el `.docx`?** **Sí**, una aclaración: RF-13 es texto libre asistido, y RF-16 es **best effort** — sugiere cuando puede identificar la especie, y calla cuando no.

---

## DV-15 — La complejidad tiene criterio objetivo y se puede sugerir

**Qué dice el documento.** RF-15 pide clasificar la intervención en complejidad baja, media, alta o máxima, "en línea con la escala real del formulario físico", sin decir qué determina cada nivel.

**Qué nos respondieron (A-10).** Se decide **según el diámetro del tronco y la altura del ejemplar**.

**Qué hacemos.** Se agrega una tabla `regla_complejidad` con los cortes en la base, y el sistema **sugiere** la complejidad a partir de dos datos que el dictamen ya carga. El ingeniero confirma o cambia, y se guardan la sugerida y la elegida. Además, como en la calle se mide el **perímetro** con cinta y la regla se expresa en **diámetro**, el sistema convierte y muestra los dos valores.

**Quién carga los cortes.** El **Administrador, desde el panel** (D-49). No vienen fijos de fábrica y no los define el equipo de desarrollo: la tabla arranca vacía, la sugerencia aparece recién cuando hay cortes cargados y hasta entonces el campo funciona como hoy. Un umbral puesto por nosotros se vería exactamente igual que uno acordado con la repartición, y el ingeniero no tendría cómo distinguirlos.

**¿Corregir el `.docx`?** **Sí.** RF-15 tiene que incorporar el criterio objetivo; hoy se lee como una casilla a completar a ojo.

---

## DV-16 — La reserva ocurre antes de la pre-confirmación, no después

**Qué dice el documento.** RF-21 a RF-23 describen la planificación como un cálculo: el ingeniero elige criterio y zona, y el sistema devuelve la ruta. No hay un paso intermedio.

**Qué hacemos.** Se agrega la **pre-confirmación de la jornada**: el ingeniero define horas o cantidad de casos, **el sistema reserva en ese mismo momento**, y recién entonces muestra una pantalla donde puede ajustar sin apuro —corregir puntos del mapa que cayeron mal, sacar un caso, corregir la categoría inferida, reordenar— antes de confirmar y salir.

**Por qué la reserva va antes.** Es el punto entero de la pantalla. Si la reserva esperara a la confirmación, cada minuto que el ingeniero se toma para revisar sería un minuto de riesgo de que otro le saque un caso, y el diseño lo estaría empujando a apurarse justo donde conviene que mire con calma. Reservando primero, la revisión es gratis.

**Por qué importa además.** Es el último momento con señal garantizada. Concentrar ahí las correcciones que necesitan mapa y conexión —y la precarga de todo lo que va a hacer falta offline— es lo que hace que la jornada en la calle no dependa de la señal. Corregir un punto del mapa parado frente al árbol, con una barra y el sol de frente, no es un escenario realista.

**¿Corregir el `.docx`?** **Sí.** Suma un paso al caso de uso de planificación de ruta (CU-06) y conviene reflejarlo en el diagrama de secuencia correspondiente.

---

## DV-17 — El entregable para concesionarias no tiene ningún RF que lo respalde

**Qué dice el documento.** Nada. Se revisó `docs/01-documentacion-tecnica.md` completo y **la palabra "concesionaria" no aparece una sola vez** entre RF-01 y RF-32. La funcionalidad sale exclusivamente de la minuta del 12/08 —*"construir paquetes de casos similares que puedan ser derivados a empresas concesionarias, optimizando el uso de recursos técnicos y logísticos"*— y de la decisión D-26.

**Qué hacemos.** Se redacta **RF-33**: el Administrador genera un entregable de trabajo para una empresa concesionaria, agrupando los dictámenes **firmados y vigentes** de una zona y un período en **paquetes por acción autorizada y complejidad**, con revisión y ajuste manual previos, y registrando cada emisión con su destinatario. Sale como **un PDF por paquete**. Aparecen la tabla `concesionaria` y el campo `concesionaria_id`.

**Por qué.** El pedido del cliente está en la minuta y el diseño ya lo había tomado en D-26, pero como no se convirtió en requerimiento quedó a mitad de camino: el modelo de datos prometía poder contestar *"qué se le informó a una contratista y cuándo"* y la tabla no guardaba a quién. Un pedido relevado que no se redacta como requerimiento es un pedido que se implementa a ojo.

**Qué no lleva.** Ni el texto del vecino, ni las fotos, ni el circuito interno. Es un tercero externo a la repartición: no necesita saber qué escribió un vecino sobre el árbol de su vereda para ir a podarlo.

**¿Corregir el `.docx`?** **Sí.** Hay que agregar RF-33 y su caso de uso. Es funcionalidad nueva, no un ajuste de redacción.

---

## DV-18 — La auditoría del trabajo sin conexión produjo tres requerimientos que el documento no tiene

**Qué dice el documento.** RNF-04 y RNF-05 piden que el sistema funcione sin conexión y sincronice al recuperarla. No dicen nada sobre qué protege el trabajo mientras el dispositivo está en la calle, ni sobre qué pasa si el dispositivo no vuelve.

**Qué hacemos.** Tres requerimientos nuevos, salidos de auditar la jornada completa contra el diseño:

- **RF-34 · Blindaje de la jornada.** Al confirmar, los reclamos quedan blindados a nombre del ingeniero y del dispositivo. Nadie más los toca **y los trabajos automáticos del servidor tampoco**. Se libera al cierre; el Administrador puede desblindar a mano.
- **RF-35 · Administración de dispositivos.** El Administrador puede dar de baja un captor por robo, extravío o destrucción. Lo que ese captor intente sincronizar queda en cuarentena para revisión, no se descarta.
- **RNF-14 · Sesión única y corte al apagar.** Un usuario, una sesión activa; la que abre manda. La sesión se corta al apagarse el dispositivo.
- **RF-36 · Fotografías en el reclamo de campo.** Un reclamo dado de alta por el ingeniero puede llevar fotos, tomadas y encoladas sin conexión.

**Por qué el blindaje.** Sin él, el sistema no puede distinguir un reclamo que el ingeniero no llegó a visitar de uno que dictaminó y cuyo dictamen se perdió con el dispositivo: los dos se ven idénticos, los dos vuelven a la cola, y el segundo termina dictaminándose dos veces. Con blindaje, el servidor sabe desde el minuto cero exactamente qué casos están comprometidos y con quién, y si el captor nunca vuelve la pérdida queda acotada a los casos de una jornada, que al día siguiente vuelven a circular.

Hay un segundo motivo, menos evidente y igual de importante: **blindar también protege del propio servidor**. Sin blindaje, el trabajo de escalamiento puede subirle la prioridad a un reclamo de madrugada mientras el ingeniero lleva en el bolsillo una copia precargada con la prioridad vieja. El dato no se puede mover bajo los pies del que está en la calle.

**Por qué la sesión se corta al apagar, sabiendo lo que cuesta.** Se planteó la alternativa —mantener la jornada abierta en el dispositivo y renovar la sesión de servidor sola, para que una batería agotada a las 14:00 sin señal no termine la jornada— y **se descartó a favor de la seguridad**. El fundamento del analista funcional: son documentos legales, el captor puede tener trabajo de otras personas adentro y puede prestarse a un uso indebido. **La consecuencia se asume y se declara**: con el captor apagado y sin señal, el ingeniero no puede seguir cargando esa tarde. Lo ya cargado no se pierde — la cola y los borradores sobreviven y se envían cuando vuelve a autenticarse.

**Por qué RF-36.** `reclamo.foto_url` es un solo campo de texto que **viene del SUA** y puede venir vacío: no es nuestro. Sin una tabla propia, un reclamo abierto de oficio quedaba sin evidencia hasta que alguien lo dictaminara — y durante el protocolo de tormenta (RF-28→RF-30) es justo cuando la foto más importa: un árbol caído cortando una calle se documenta cuando se ve, no tres días después, cuando ya lo movieron.

**¿Corregir el `.docx`?** **Sí.** Cuatro altas: RF-34, RF-35, RF-36 y RNF-14. Y conviene reflejar el blindaje en el diagrama de estados del reclamo.

---

## DV-19 — Firmar y certificar no son lo mismo, y el documento los trata como uno solo

**Qué dice el documento.** RF-18 y RF-19 describen un único acto de firmar, del que dependen la inmutabilidad, el sello de tiempo y la validez del dictamen. RNF-13 menciona la certificación oficial como algo pendiente, sin definir qué pasa mientras tanto ni qué pasa si falla.

**Qué hacemos.** Se separan dos cosas que estaban mezcladas bajo la misma palabra:

| | Qué es | ¿Puede fallar? |
| --- | --- | --- |
| **Firma interna** | Hash canónico + sello de tiempo del servidor + legajo + rol + versión de `config_firma` | **No.** Es local y entra en la transacción |
| **Certificación externa** | `ICertificadoraFirma` — hoy un placeholder, mañana un organismo | **Sí.** Es una llamada fuera de nuestra frontera |

El dictamen se firma **siempre**, en el paso indivisible de RF-18. Si la certificación externa falla, queda **firmado y válido puertas adentro** con estado `pendiente_de_certificacion`, un trabajo automático reintenta con espera creciente, y el Administrador puede forzar el reintento desde el panel. La única consecuencia, deliberadamente acotada: **ese dictamen no puede salir en un entregable a concesionarias (RF-33) hasta estar certificado**.

**Por qué.** El documento, tal como está escrito, no responde qué pasa si la certificación falla — y la respuesta importa, porque las dos salidas obvias son malas. Si la falla impide firmar, un problema de red le arruina la jornada a un ingeniero que ya hizo el trabajo. Si se ignora, un documento sin certificar circula frente a terceros como si tuviera validez plena. La separación mantiene el criterio que el proyecto ya aplicó dos veces —no se descarta trabajo de campo por un problema de red— sin mentir sobre el estado del documento.

**Dónde se ve.** El dashboard muestra los pendientes de certificar como alerta, junto a los que vencen en ≤30 días (RF-05). **No es problema del ingeniero**: él firmó y su dictamen está cerrado; la pendencia es del sistema y se resuelve del lado de la administración.

**¿Corregir el `.docx`?** **Sí.** RF-18 y RF-19 tienen que distinguir los dos actos, y RNF-13 tiene que decir qué pasa mientras la certificación no exista y qué pasa cuando falla.

---

## DV-20 — La jornada laboral no tiene ventana, y el trabajo se reparte en horarios imposibles

**Qué dice el documento.** RF-21 deja que el ingeniero defina la jornada por horas o por cantidad de casos, y RF-23 a RF-25 reparten esa carga por prioridad. **Nada acota cuándo ni cuánto se puede tomar**: nada impide armar una jornada de nueve casos a las 17:30.

**Qué hacemos.** Se redacta **RF-37**: una **ventana laboral** configurable —franja horaria y cupo máximo de reclamos por día o por semana— que limita **tomar** trabajo, no dictaminarlo ni sincronizarlo. Se resuelve por ámbito `global`, `distrito` o `usuario`, gana el más específico, exactamente como las directivas de jornada.

**Cómo se entera el ingeniero.** No ve la configuración ni recibe avisos previos: **se entera al pedir más trabajo**, con el motivo escrito — *"desde las 17:00 no se toman reclamos nuevos"*. Lo que ya tiene tomado no se toca.

**La otra mitad del requerimiento está en la pantalla de configuración, y no es un detalle de interfaz.** El panel tiene que mostrar **la consecuencia** del límite: *"esto haría que el ingeniero trabaje hasta las 18:30"*, *"con este cupo quedan 40 casos sin repartir"*.

**Por qué.** El daño que RF-37 evita es **repartir trabajo en horarios imposibles, que después queda sin hacer** — que es, en pequeño, el mismo mecanismo que produjo tres años de rezago. Si el Administrador configura un cupo sin ver el efecto, el requerimiento no evita nada: mueve el problema de la calle al panel. Es el patrón que el sistema ya aplica en el balanceador, en la pre-confirmación y en el entregable a concesionarias —**el sistema propone, la persona ajusta, después confirma**— aplicado por primera vez a la configuración en vez de a la operación.

**La tabla arranca vacía y sin filas no limita nada**, mismo criterio que los cortes de complejidad (D-49): un horario puesto por nosotros se vería igual que uno acordado con la repartición.

**¿Corregir el `.docx`?** **Sí.** Alta de RF-37 y de su caso de uso. Qué franja y qué cupo van adentro lo define la Dirección Técnica.

---

## DV-21 — Un dictamen cierra un solo reclamo, y los duplicados mandan a alguien de nuevo al mismo árbol

**Qué dice el documento.** RNF-07 pide **un dictamen vigente por reclamo**, y todo el circuito está armado sobre el par (N° SUA, año): se valida un reclamo, se dictamina ese reclamo, se cierra ese reclamo. Un árbol con tres reclamos exige tres visitas.

**Qué hacemos.** Se redacta **RF-38**: al firmar, el sistema **ofrece los demás reclamos vigentes agrupados sobre el mismo ejemplar** y el ingeniero selecciona cuáles quedan cerrados por ese mismo dictamen. Cada uno pasa a `dictaminado` con la referencia de qué dictamen y qué reclamo lo cubrió.

**Por qué.**

> Esto puede pasar, y muy seguido. Un árbol en medio de la calle, medio mundo lo va a querer reclamar.

Sin esto, cada duplicado manda a alguien de nuevo al mismo árbol: **exactamente el desperdicio de visitas que el proyecto vino a atacar**. Y el sistema ya tenía el dato —agrupa reclamos por ejemplar para medir la insistencia— y no lo usaba para esto.

**El ingeniero elige, no el sistema.** El agrupamiento por calle y altura puede juntar de más: un mismo número catastral con dos árboles distintos. **Cerrar un reclamo ajeno por error es peor que dejarlo abierto.**

**Lleva interruptor, y esa es la parte importante para la aceptación.**

> La opción 1 es la idea y es la que vamos a desarrollar, pero dejar un toggle para que sea opción 2 y evitar conflictos de condiciones para que el software sea aceptado.

Apagado, el sistema se comporta **exactamente** como el circuito aprobado. Es el mismo patrón que la regla de señales de riesgo (D-21) y la sugerencia de complejidad (D-49): **funcionalidad nueva que se puede apagar para volver a lo acordado**, en vez de funcionalidad nueva que obliga a re-acordar.

**No se inventa un estado nuevo en el SUA**: no tenemos permiso para agregarle estados, así que la referencia viaja como dato del estado `dictaminado`.

**¿Corregir el `.docx`?** **Sí.** Alta de RF-38, y aclarar que RNF-07 sigue valiendo — sigue habiendo **un** dictamen vigente por reclamo; lo que cambia es que un dictamen puede cerrar más de uno.

---

## DV-22 — Un dictamen que no autoriza nada no debería vencer, y el documento lo hace vencer igual

**Qué dice el documento.** RF-19 fija el vencimiento del dictamen en **18 meses**, sin distinguir qué dictaminó. Con esa regla, un dictamen que constató que **el árbol ya no existe** vence a los 18 meses y el reclamo vuelve a la cola para que alguien vaya a mirar un árbol que no está.

**Qué hacemos.** Un dictamen que **no autoriza ninguna intervención** —el que usa la opción "sin trabajo" del formulario físico— **no tiene fecha de vencimiento** y su reclamo pasa a `cerrado_definitivo`. El motivo es obligatorio y taxonómico: `no_requiere_intervencion`, `ejemplar_inexistente`, `ya_intervenido` o `fuera_de_alcance`.

**Por qué.**

> Alguien lo miró, y un ingeniero constató. Por algo constatamos que el ingeniero dictamina técnicamente. Y además, si en año y medio el árbol tiene un problema, para eso existe el reclamo: alguien lo va a mirar.

**El vencimiento existe porque una autorización para intervenir caduca.** Si no se autorizó nada, no hay nada que caduque. Volver a mirar un árbol que un ingeniero agrónomo declaró sano es gastar una visita para desconfiar de un dictamen técnico propio — y el sistema no queda ciego, porque el circuito de reclamos ya es el mecanismo de vigilancia.

**Y el motivo es enum, no texto libre**, porque de ese dato depende que un trabajo automático decida si el reclamo vuelve. Ningún trabajo automático puede leer observaciones. Un cierre definitivo apoyado en una frase escrita a mano es un cierre que nadie puede auditar.

**Lo que apareció al escribir esta regla.** Distinguir *no hace falta trabajo* de *hace falta y no se indicó ninguno* destapó que **el esquema aceptaba las dos cosas como lo mismo**: con las cuatro listas de intervención vacías, las restricciones de exclusión de RF-14 pasaban igual y **el dictamen se firmaba**. Un documento con validez legal que no autoriza nada ni declara que no hace falta nada. Se suma la restricción de completitud: **o hay intervención, o hay "sin trabajo" con motivo.**

**¿Corregir el `.docx`?** **Sí.** RF-19 tiene que distinguir el dictamen que autoriza del que constata, y RF-13 tiene que exigir el motivo de "sin trabajo" y la completitud del formulario.

