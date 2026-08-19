# Desvíos respecto del documento académico

> Registro de todo lo que el diseño del backend hace distinto de lo que dice el documento técnico entregado.
> Cada entrada indica si hay que corregir el `.docx` antes de la entrega final.

Existe porque el documento se entrega y se defiende. Un desvío no documentado es una pregunta del profesor sin respuesta.

---

## DV-01 — Los adaptadores son doce, no dos

**Qué dice el documento.** Sección 1.4 y diagrama de clases: dos interfaces, `IReclamoProvider` e `IAuthProvider`. Los dictámenes y rutas se guardan en Supabase como base propia del módulo.

**Qué hacemos.** Todo acceso a datos va detrás de un puerto: se suman repositorios de dictamen, ruta, reserva, perfil, parámetros y auditoría, más storage, ruteo y reloj.

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

## DV-10 — La matrícula profesional se reemplaza por la habilitación registrada

**Qué dice el documento.** RF-18 exige "matrícula profesional registrada" para firmar, y CU-08 lista "matrícula con formato inválido" como excepción del caso de uso.

**Qué nos respondieron (A-07).** Que no tienen idea de qué forma tiene la matrícula, y la propuesta de la propia Dirección es reemplazarla por **el título profesional presentado en RRHH**.

**Qué hacemos.** El perfil deja de tener un campo `matricula` y pasa a tener una **habilitación para firmar**: quién está habilitado, con qué respaldo, desde cuándo y qué administrador la cargó. El dictamen firmado sella el legajo del firmante y el respaldo de su habilitación, en vez de un número de matrícula. La excepción de CU-08 deja de ser "formato inválido" y pasa a ser "el usuario no está habilitado para firmar".

**Por qué.** Validar el formato de un número que nadie sabe describir es una validación decorativa. Registrar quién habilitó a quién, con qué constancia y desde cuándo, responde la pregunta que realmente importa ante una impugnación. Además saca del sistema un dato personal que no hacía falta guardar.

**Consecuencia en el front.** `index.html` pide hoy "N° Matrícula Profesional" como campo a tipear en cada dictamen. Ese dato no lo tipea el ingeniero: sale de su perfil. Es un cambio de front pendiente, junto con el de la pantalla de acceso (DV-13).

**¿Corregir el `.docx`?** **Sí.** RF-18, la excepción de CU-08 y el atributo del MER.

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

**Estado.** La sugerencia queda **apagada por parámetro** hasta tener los cortes reales. Con umbrales inventados le mostraríamos al ingeniero una automatización que no refleja su criterio, que es peor que no tenerla.

**¿Corregir el `.docx`?** **Sí.** RF-15 tiene que incorporar el criterio objetivo; hoy se lee como una casilla a completar a ojo.
