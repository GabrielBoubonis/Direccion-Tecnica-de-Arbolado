# Modelo de datos

> Última actualización: 21/08/2026 (tercera vuelta) · Estado: **en diseño, sin aprobar**
> Incorpora las respuestas de relevamiento del 18/08 (grupos A y B de `entregables/preguntas-abiertas.html`)
> y absorbe **D-54 a D-67** con los hallazgos H-01 a H-12 (`09-decisiones-20260820.md`)
> y **D-68 a D-92**, los caminos alternativos (`11-decisiones-20260821.md`).
> Especificación, no implementación. Las migraciones se escriben en Fase 2.

## 1. Dos esquemas, una frontera visible

| Esquema | Qué contiene | El día de la transferencia |
| --- | --- | --- |
| `sua_sim` | Los reclamos, tal como nos los daría el SUA | **Se borra entero** |
| `arbolado` | Todo lo propio del módulo | Migra a la base municipal |

Solo `SuaSimuladoAdapter` consulta `sua_sim`. Ningún caso de uso lo toca. En la defensa se puede borrar el esquema y mostrar que lo único que se rompe es un adaptador.

### Decisión: la prioridad es nuestra, no del SUA

El SUA real **no tiene matriz de priorización por colores** — es una de las mejoras propuestas en el relevamiento, no algo que exista hoy. Por lo tanto la prioridad vigente de cada reclamo vive en `arbolado.reclamo_estado`, no en `sua_sim.reclamo`.

Consecuencia: el sistema sigue funcionando igual cuando lo conecten a un SUA que no sabe nada de colores. Si guardáramos la prioridad del lado del SUA simulado, estaríamos simulando una capacidad que el sistema real no tiene, y el prototipo mentiría.

---

## 2. Esquema `sua_sim`

### `sua_sim.reclamo`

Clave primaria: **(`nro_reclamo_sua`, `anio`)** — es la clave funcional que exige RF-12 y la que el ingeniero tipea en campo.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `nro_reclamo_sua` | texto | Parte 1 de la PK |
| `anio` | entero corto | Parte 2 de la PK |
| `fecha_ingreso` | fecha y hora | |
| `origen_ingreso` | enum | `munibot`, `presencial`, `distrito`, `de_oficio`. Son los canales reales por los que entra un reclamo (A-12) |
| `tipo` / `subtipo` | texto | Fijos en `Reclamo` / `Problemas con el arbolado público`. Existen para que el adaptador filtre igual que contra el SUA real |
| `direccion_exacta` | texto | **Es la dirección del ejemplar, no la del vecino** (B-02). Único dato de ubicación que da el SUA |
| `calle`, `altura` | texto, entero | Normalizados, para la búsqueda por dirección |
| `entre_calle_1`, `entre_calle_2` | texto | |
| `distrito` | enum | `Centro`, `Norte`, `Noroeste`, `Oeste`, `Sudoeste`, `Sur` |
| `barrio` | texto | Permite afinar la zona al planificar la jornada |
| `descripcion_motivo` | texto largo | **Solo texto libre.** El SUA no trae motivo categorizado (B-03) |
| `foto_url` | texto | Puede venir vacío: la calidad del dato de entrada es heterogénea |
| `estado_sua` | enum | `ingresado`, `derivado`, `dictaminado`, `en_ejecucion`, `cerrado` |
| `area_asignada` | texto | Solo los derivados a Arbolado entran al sistema (RF-07) |
| `fecha_derivacion` | fecha y hora | |
| `creado_por_usuario` | uuid, nulo | Solo para altas de oficio. Ver §5 |

**Índices**: por `(area_asignada, estado_sua)` para el listado; por `distrito`; por `(calle, altura)` para la consulta por dirección y para agrupar reclamos del mismo ejemplar.

### Decisión: las coordenadas son nuestras, no del SUA

El SUA guarda **solo la dirección escrita**, y es la dirección exacta del ejemplar. No hay coordenadas: el censo de arbolado nunca se geolocalizó (B-02).

Por eso `sua_sim.reclamo` **no tiene `lat`/`lng`**. Simularlas sería atribuirle al SUA un dato que no tiene — el mismo error que ya evitamos con la prioridad (§1). El punto en el mapa es un dato **derivado y propio del módulo**, y vive en `arbolado.reclamo_geo`.

Consecuencia operativa: entre la dirección y el punto hay una geocodificación que puede fallar o caer media cuadra corrida. El diseño la trata como un dato de calidad variable —con precisión declarada y corregible en campo— en vez de como una verdad.

---

## 3. Esquema `arbolado` — identidad

### `arbolado.perfil`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `usuario_id` | uuid | PK. Referencia a la identidad emitida por `IAuthProvider` |
| `identificador` | texto único | El **usuario de red** que el agente tipea en el login: `gboubon0` (B-04) |
| `legajo` | texto | |
| `nombre_apellido` | texto | |
| `rol` | enum | `lector`, `operario`, `jefe`, `administrador` |
| `distrito_asignado` | enum, nulo | Distrito de trabajo habitual. **Precarga los filtros, no restringe** |
| `activo` | booleano | Desactivar revoca el acceso a la app sin tocar la cuenta institucional (RF-31) |

**No hay campo de matrícula ni de habilitación individual.** Firmar es atributo del **rol**: firman **Operario y Jefe**, que son los que van a la calle. Ni el Lector ni el Administrador firman. La decisión funcional es de Lucas y está registrada como D-50, y **contradice a RF-02 y RF-18** tal como están escritos hoy — el detalle y qué hay que corregir del documento están en `99-desvios.md` (DV-10).

Qué queda del recorrido: el requerimiento pedía *matrícula profesional registrada*; en la repartición nadie supo precisar qué forma tiene y propusieron el título presentado en RRHH (A-07); la definición final es que la constancia la da el alta del usuario con su rol, y lo que se configura en un solo lugar es **cómo firma el sistema**, no quién (§3 bis).

### `arbolado.config_firma`

El apartado único de firma digital. Existe para que el día que la firma tenga que certificarse de verdad **se toque un solo lugar y salga andando**, en vez de perseguir la lógica de firmado repartida por el código.

| Campo | Notas |
| --- | --- |
| `version` | Cada cambio genera una versión nueva; el dictamen firmado guarda cuál regía |
| `roles_habilitados` | Qué roles pueden firmar. Hoy: `operario`, `jefe` |
| `exige_certificacion` | Si se exige certificación oficial antes de aceptar la firma |
| `adaptador_certificadora` | Qué implementación de `ICertificadoraFirma` se usa. Hoy: ninguna |
| `algoritmo_hash` | Con qué se calcula la huella del documento |
| `leyenda_pie` | El texto legal que sale impreso al pie del dictamen |
| `datos_sellados` | Qué se estampa junto a la firma: nombre, legajo, rol, fecha, hash |
| `modificada_por`, `modificada_en` | Va a auditoría |

**Por qué versionada.** Un dictamen firmado en marzo se defiende con las reglas de firma de marzo, no con las de hoy. Guardar la versión vigente en el dictamen es lo que permite explicar, dos años después, bajo qué configuración se firmó ese documento.

**Por qué `roles_habilitados` es un dato y no una constante.** Hoy firman los dos roles de campo. Si mañana la repartición decide restringirlo —a los que tengan título registrado, por ejemplo— se cambia acá, sin deploy y sin tocar el núcleo. Es el mismo criterio de RNF-09 y RF-32 aplicado a la firma.

### El identificador es un usuario de red, no un correo

Los agentes municipales entran a los sistemas internos con usuario y contraseña. El usuario se arma con la primera letra del nombre, hasta seis del apellido y un número correlativo que resuelve las coincidencias: `gboubon0` (B-04).

D-09 ya había previsto que el puerto de autenticación recibiera un `identificador` opaco en vez de un `email`, así que **no hay nada que rehacer**: cambian la etiqueta del campo en la pantalla de acceso y el ejemplo. El adaptador de Supabase, que internamente necesita un correo, lo sintetiza agregándole el dominio reservado `@arbolado.test`. Ese armado vive **dentro del adaptador**: ni el núcleo ni el front lo conocen, y el día de la transferencia se va con él.

---

## 4. Esquema `arbolado` — reclamos y prioridad

### `arbolado.reclamo_estado`

Estado del reclamo **desde la mirada del módulo**. Clave: (`nro_reclamo_sua`, `anio`).

| Campo | Tipo | Notas |
| --- | --- | --- |
| `prioridad_base` | enum | `verde`, `amarillo`, `naranja`, `rojo`. Calculada al ingresar según riesgo |
| `prioridad_vigente` | enum | La que rige hoy, ya escalada |
| `fecha_ultimo_escalamiento` | fecha | |
| `estado_modulo` | enum | `sin_dictaminar`, `reservado`, `dictaminado`, `vencido_redictaminar`, `cerrado_definitivo` |
| `cerrado_por_dictamen_id` | uuid, nulo | Qué dictamen lo cerró. Se llena también cuando lo cierra el dictamen **de otro reclamo** (RF-38) |
| `cerrado_por_reclamo` | texto, nulo | El par (N° SUA, año) del reclamo que lo cubrió, si se cerró por duplicado |
| `insistencia_aplicada` | booleano | La insistencia ya subió el color. **No vuelve a subirlo** (D-92) |
| `etiqueta_tormenta` | booleano | Habilita la sección de emergencia (RF-28). Llega del SUA **o** la marca el Administrador mientras el CIL no la implemente (A-03) |
| `fecha_tormenta` | fecha y hora | Para la ventana de 3 días |
| `origen_alta` | enum | `sua`, `oficio`, `vecino`, `tormenta` |
| `categoria` | enum | Determina el ritmo de escalamiento. **Inferida del texto libre** (B-03). Ver reglas §2 |
| `categoria_origen` | enum | `inferida` o `corregida`. Nunca se muestra una categoría sin saber de dónde salió |
| `categoria_corregida_por` | uuid, nulo | Quién la corrigió |
| `senal_riesgo_detectada` | texto, nulo | Qué frase del texto del vecino disparó el salto de color. Nunca hay un color inexplicable |
| `cantidad_reclamos_ejemplar` | entero | Insistencia del vecino: cuántos reclamos hay sobre el mismo árbol |
| `id_ejemplar_agrupado` | texto | Agrupador de reclamos sobre el mismo ejemplar. Ver abajo |

**`cerrado_definitivo` es un estado nuevo y hace falta.** Un reclamo cerrado por un dictamen "sin trabajo" (D-83) o por ser duplicado de otro (RF-38) **no vence a los 18 meses y no vuelve a la cola**. `dictaminado` a secas sí vuelve. Sin distinguirlos, el trabajo de vencimientos manda a alguien a re-mirar un árbol que ya no existe.

**`insistencia_aplicada` es la que evita el sesgo.** La insistencia sube el color **un escalón, una sola vez** (D-92). Sin la bandera, un árbol muy visible en una esquina céntrica junta diez reclamos y llega a rojo, mientras uno peligroso en un barrio donde nadie sabe reclamar se queda en verde: la insistencia mide **cuánto reclama la gente, no cuánto riesgo hay**. Priorizar por demanda ciudadana premia a la zona que ya está mejor atendida, que es el sesgo que la matriz vino a corregir.

**Agrupación por ejemplar.** La insistencia del vecino solo se puede medir si el sistema sabe que tres reclamos hablan del mismo árbol. Se agrupa **por calle y altura normalizadas**, que es el único dato que da el origen, y se afina por cercanía menor a 15 metros solo cuando los dos puntos son de precisión `exacta` o corregidos por un usuario — dos puntos aproximados cercanos no prueban nada. El criterio se documenta explícitamente porque un mismo árbol de vereda puede recibir reclamos con la altura catastral corrida en un número, y agrupar de más sería tan malo como no agrupar.

### `arbolado.reclamo_geo`

El punto en el mapa de cada reclamo. Existe porque el SUA no lo da (B-02) y sin punto no hay ruta (RF-22, RF-26).

| Campo | Notas |
| --- | --- |
| `nro_reclamo_sua`, `anio` | Clave |
| `lat`, `lng` | El punto vigente |
| `origen_punto` | `geocodificado` o `corregido_por_usuario` |
| `precision` | `exacta` (se halló la altura), `aproximada` (interpolada sobre la cuadra), `solo_calle`, `fallida` |
| `direccion_normalizada` | Lo que efectivamente se geocodificó |
| `proveedor`, `geocodificado_en` | Con qué y cuándo |
| `corregido_por`, `corregido_en` | Quién movió el punto y cuándo |

Tres decisiones detrás de esta tabla:

- **La precisión se declara, no se oculta.** Un reclamo con precisión `solo_calle` se dibuja distinto en el mapa y el ingeniero sabe que tiene que buscar el ejemplar en la cuadra. Un punto falsamente exacto es peor que un punto declarado dudoso.
- **El ingeniero puede corregirlo.** Está parado frente al árbol: es la única persona con el dato bueno. La corrección se hace en la **pre-confirmación de la jornada** (ver `03-reglas-de-negocio.md` §8 bis), queda como `corregido_por_usuario` y **ninguna geocodificación posterior la pisa**.
- **La geocodificación va detrás de un puerto** (`IGeocodificador`), como todo lo demás. En la demo es un proveedor abierto; el día de la transferencia puede ser el servicio de la Municipalidad, que conoce la nomenclatura catastral de Rosario mejor que cualquier proveedor global.

Un reclamo con `precision = fallida` **no se pierde**: entra igual al listado, al dashboard y a la consulta por dirección, y queda afuera solo del armado de ruta hasta que alguien le ponga el punto.

**Índice geoespacial** sobre `(lat, lng)`, acá y no en `sua_sim`.

### `arbolado.regla_prioridad`

La matriz de priorización, en tabla y no en código: es la mejora central que pide el relevamiento y tiene que poder ajustarse sin un deploy (RNF-09, RF-32).

| Campo | Notas |
| --- | --- |
| `tipo_regla` | `senal_riesgo`, `reiteracion`, `ritmo_escalamiento` |
| `categoria` | A qué categoría de reclamo aplica |
| `patron` | La frase o señal que dispara, para las reglas de texto |
| `resultado` | Color al que salta, o días de escalamiento |
| `activa` | **Las reglas por texto se pueden apagar sin tocar código** |
| `orden` | Cuál se evalúa primero |
| `provisoria` | La cargó el equipo, **no la acordó la repartición**. El panel lo muestra arriba (D-59) |

Que la regla de señales de riesgo sea desactivable es una decisión deliberada: el relevamiento dice que la calidad del dato de entrada es muy despareja, y una regla que interpreta texto libre se puede equivocar. Si el área concluye que genera más ruido que valor, se apaga y el sistema sigue funcionando con las demás reglas.

**La tabla arranca cargada, y cargada de provisorio (D-59).** Se aparta a propósito de lo que hace `regla_complejidad`, que arranca vacía. Si las señales de riesgo arrancan vacías **ningún reclamo sube de verde por texto**, y una de las tres funcionalidades centrales del trabajo queda muda en la demo. La bandera `provisoria` es lo que evita el problema que D-49 quería evitar —que un supuesto del equipo se confunda con un criterio del área— sin apagar la funcionalidad: el panel del Administrador muestra arriba que esas señales esperan la validación de la repartición (A-12), y al validarlas se baja la bandera.

### `arbolado.regla_complejidad`

Los cortes que determinan la complejidad de la intervención (RF-15). Van en tabla porque **los carga el Administrador desde el panel** (D-49): la repartición no tenía los números a mano y no son nuestros para inventar.

| Campo | Notas |
| --- | --- |
| `nivel` | `baja`, `media`, `alta`, `maxima` |
| `diametro_desde`, `diametro_hasta` | En centímetros |
| `altura_desde`, `altura_hasta` | En metros |
| `orden` | Cuál se evalúa primero |
| `activa` | |

Mientras la tabla esté vacía, la sugerencia no aparece y el campo funciona como hoy, a criterio del ingeniero. **No hay valores por defecto inventados**: un umbral puesto por nosotros se vería igual que uno acordado con la repartición, y no lo es.

### `arbolado.escalamiento_historial`

Una fila **por cada salto de color**. Es lo que permite responder en la defensa "¿por qué este reclamo está en rojo?".

| Campo | Notas |
| --- | --- |
| `nro_reclamo_sua`, `anio` | A qué reclamo |
| `de_prioridad` → `a_prioridad` | El salto |
| `motivo` | `alta`, `tiempo`, `manual` |
| `fecha` | Cuándo |
| `ejecutado_por` | Nulo si fue el job automático |

**Mecanismo elegido:** una función pura decide la prioridad, un job diario la persiste y escribe el historial. La alternativa —calcularla en cada lectura— no deja rastro de cuándo escaló y complica filtrar por prioridad cuando el volumen crece. La función es pura para que el driver pueda verificarla sin tocar la base.

---

## 5. Alta de reclamos por el ingeniero

Decisión funcional: el ingeniero puede abrir un reclamo en tres situaciones — **de oficio** (ve un ejemplar riesgoso que nadie reclamó), **a pedido de un vecino** que lo aborda en la calle, y **durante el protocolo de tormenta**.

**Decisión técnica derivada:** el reclamo nuevo se crea a través de `IReclamoProvider`, no directamente en `arbolado`. Hoy eso lo escribe en `sua_sim`; mañana lo dará de alta en el SUA real.

Esto es la respuesta a la minuta del 12/08 ("aclarar por qué se puede cargar un reclamo nuevo"): **no se crea un reclamo paralelo, se lo hace entrar al circuito formal.** Sin esto, el ingeniero dictaminaría un árbol cuyo expediente no existe, y ninguna cuadrilla podría intervenirlo legalmente.

Todo alta queda marcada con `origen_ingreso`, `origen_alta` y `creado_por_usuario`: quién lo abrió y por qué, siempre auditable.

---

## 6. Reservas de trabajo

Materializa el principio "se toma con señal, se ejecuta sin señal" (ver `01-arquitectura.md` §4).

### `arbolado.reserva`

| Campo | Notas |
| --- | --- |
| `id` | uuid |
| `nro_reclamo_sua`, `anio` | Qué reclamo |
| `usuario_id` | Quién lo tomó |
| `ruta_id` | Nulo si lo tomó suelto, sin armar ruta |
| `tomada_en` | Cuándo |
| `vence_en` | Por defecto al cierre de la jornada. Configurable (RNF-09) |
| `liberada_en` | Nulo mientras está activa |
| `motivo_liberacion` | `dictaminado`, `vencida`, `manual`, `liberada_por_admin`, `cierre_jornada` |
| `blindada` | Verdadero desde que se confirma la jornada. Ver abajo (RF-34) |
| `captor_id` | Qué dispositivo se llevó el caso. Nulo si se tomó suelto desde el escritorio |
| `blindada_en` | Cuándo se confirmó la jornada que la blindó |

**Garantía dura:** un índice único parcial permite **una sola reserva activa por reclamo**. No depende de que el código se acuerde de chequear: lo impone la base. Dos pedidos simultáneos, uno gana y el otro recibe un rechazo limpio.

Mientras está reservado, el resto del equipo lo ve en el listado marcado con quién lo tiene y desde cuándo — no desaparece. Así el jefe ve el reparto del día y nadie reclama dos veces el mismo caso.

### El blindaje de la jornada (RF-34)

**Reservar y blindar no son dos tablas: son dos momentos de la misma fila.** Tomar un caso lo reserva; confirmar la jornada lo blinda. Se resolvió así, y no con una tabla aparte, porque la reserva ya es el candado exclusivo del reclamo y duplicarlo abriría la puerta a que los dos candados se contradigan.

Mientras `blindada` está en verdadero:

- Ningún otro usuario puede tomar, dictaminar ni modificar ese reclamo — lo de siempre en una reserva.
- **Ningún trabajo automático del servidor lo toca**: ni el escalamiento de prioridad, ni el vencimiento, ni la re-geocodificación. Todo job filtra por `NOT EXISTS (reserva activa y blindada)`.
- Sigue **visible** para el resto del equipo, con quién lo tiene, desde cuándo y con qué dispositivo (D-15).

El segundo punto es el que importa y el que no estaba. Sin blindaje, el job de escalamiento le sube la prioridad a un reclamo a las dos de la mañana mientras el ingeniero lleva en el bolsillo una copia precargada con la prioridad vieja. **El dato no se puede mover bajo los pies del que está en la calle**, porque en la calle no hay forma de enterarse de que se movió.

Al cierre de la jornada el blindaje se libera con `motivo_liberacion = cierre_jornada` y los reclamos no dictaminados vuelven a la cola (D-24). El Administrador puede desblindar a mano en cualquier momento, y esa acción va a auditoría.

**Qué pasa si el captor nunca vuelve.** El trabajo de esa jornada se pierde, y se dice sin vueltas. Pero la pérdida está **acotada a los reclamos de una jornada**, que son exactamente los que el blindaje enumeró, y al día siguiente vuelven a estar en circulación. El sistema no tiene que adivinar qué pasó: ya sabía qué había en juego y con quién.

### `arbolado.captor` (RF-35)

Los dispositivos son **provistos por la repartición**, no personales. Que existan como fila es lo que permite blindar a nombre de un equipo y darlo de baja si desaparece.

| Campo | Notas |
| --- | --- |
| `id` | uuid, generado en el alta y guardado en el dispositivo |
| `etiqueta` | Cómo lo llama la repartición: `captor-03` |
| `asignado_a` | uuid de perfil, nulo. Puede rotar entre agentes |
| `estado` | `activo`, `de_baja` |
| `motivo_baja` | `robo`, `extravio`, `destruccion`, `reasignacion` |
| `dado_de_baja_por`, `dado_de_baja_en` | Va a auditoría |

**Un captor de baja no puede autenticarse ni sincronizar.** Lo que ya tenga adentro no se descarta: si intenta sincronizar, sus operaciones caen en cuarentena y el Administrador decide (D-63).

### `arbolado.operacion_cuarentena`

| Campo | Notas |
| --- | --- |
| `id`, `captor_id`, `recibida_en` | |
| `tipo_operacion` | `dictamen`, `alta_reclamo`, `visita`, `correccion_punto`, `foto` |
| `carga` | El cuerpo original, tal como llegó, en `jsonb` |
| `estado` | `en_cuarentena`, `liberada`, `descartada` |
| `resuelta_por`, `resuelta_en`, `motivo` | |

**Por qué no se descarta y ya.** Un equipo robado no debe poder escribir dictámenes; un equipo olvidado en un cajón y recuperado a la semana puede traer trabajo de campo perfectamente válido. Tirarlo sin mirar violaría el principio que el proyecto sostiene en todos lados: **no se descarta trabajo de campo**. La cuarentena separa la decisión de seguridad —bloquear el equipo, que es inmediata— de la decisión sobre el contenido, que la toma una persona.

---

## 7. Dictamen

### `arbolado.dictamen`

| Grupo | Campos |
| --- | --- |
| Identidad | `id` (uuid **generado en el dispositivo**), `nro_reclamo_sua`, `anio` |
| Autoría | `usuario_id`, `legajo_firmante`, `rol_firmante`, `config_firma_version`, `nro_expediente`, `nro_nota` |
| Tiempos | `fecha_dictamen` (reloj del dispositivo), `fecha_recepcion` (reloj del servidor), `fecha_vencimiento` |
| Ejemplar | `especie` (texto libre), `perimetro_tronco`, `diametro_calculado`, `altura_aproximada`, `estado_copa`, `estado_tronco`, `estado_raices`, `inclinacion_ejemplar` |
| Ubicación | `direccion_confirmada`, `calle_esquina`, `distancia_medianera`, `cantidad_frente`, `lat_captura`, `lng_captura` |
| Intervención | `categoria_intervencion`, `extraccion[]`, `trabajos_aereos[]`, `trabajos_subterraneos[]`, `sin_trabajo[]`, `sin_trabajo_motivo`, `plantar[]` |
| Clasificación | `dano_vereda`, `complejidad`, `complejidad_sugerida`, `urgencia`, `epoca_recomendada` |
| Banderas | `urgente`, `frente_garage`, `media_tension`, `de_oficio` |
| Cierre | `observaciones_tecnicas`, `firma_trazo`, `firma_hash`, `hash_documento`, `sello_tiempo`, `estado` |
| Certificación | `estado_certificacion`, `certificadora`, `certificado_en`, `intentos_certificacion` |
| Control | `discrepancia_reloj`, `fecha_confirmada_por`, `fecha_confirmada_en`, `fotos_declaradas` |

Cuatro decisiones que vale la pena justificar:

- **`id` generado en el dispositivo.** Es la clave de idempotencia: si el celular reintenta el envío tres veces porque la señal va y viene, entra **un** dictamen, no tres. Sin esto, la cola offline duplicaría trabajo.
- **`fecha_dictamen` y `fecha_recepcion` separadas.** El dictamen se emitió frente al árbol el martes a las 10:30, aunque haya llegado al servidor el miércoles. La fecha legal es la primera; la segunda es trazabilidad. El vencimiento a 18 meses cuenta desde la emisión.
- **Dos fechas y dos relojes implican confiar en el reloj del celular.** Se acota: si `fecha_dictamen` es posterior a `fecha_recepcion` o anterior a la reserva, se registra la discrepancia en auditoría en vez de aceptarla en silencio.
- **`hash_documento`.** Huella del contenido al momento de firmar. Cualquier modificación posterior se detecta comparando. Es lo que sostiene la inmutabilidad de RNF-06 más allá de la promesa.
- **`firma_trazo` guarda vectores, no un PNG (H-05).** `signature_pad.toData()` devuelve los trazos como listas de puntos: 2 a 6 KB, contra los 20 a 80 KB de un PNG en base64. Se redibuja a cualquier resolución para el PDF sin perder calidad, y sobre todo **no infla el único envío que no puede fallar**. Sería incoherente comprimir con cuidado las fotos a menos de 400 KB porque con una barra de señal cada byte cuenta, y después meterle un PNG al cuerpo del dictamen.
- **El trazo viaja embebido en el dictamen y eso no se toca.** Si fuera una operación separada podría existir, aunque sea por un rato, un dictamen firmado sin firma. La regla es *o el dictamen existe entero y firmado, o no existe*.
- **`fotos_declaradas`.** El cuerpo del dictamen declara **cuántas fotos vienen**. Es lo que permite que el servidor sepa que faltan fotos en camino sin depender de que el dispositivo vuelva a hablar. Ver `dictamen_foto`.

**Estados del dictamen.** `estado` recorre `borrador` → `firmado` → `anulado`. La certificación **es un eje aparte** y por eso es una columna aparte: `estado_certificacion` toma `no_requerida`, `pendiente`, `certificado` o `fallida`.

Separarlos es la decisión D-65 hecha esquema. **Firmar y certificar no son lo mismo**: la firma interna —hash canónico, sello de tiempo del servidor, legajo, rol, versión de `config_firma`— es local, entra en la misma transacción y **no puede fallar**. La certificación externa es una llamada a un organismo, y todo lo que sale de nuestra frontera puede fallar. Si se mezclaran en un solo campo, un timeout de red dejaría un dictamen legalmente ambiguo.

Un dictamen `firmado` + `pendiente` **es válido puertas adentro**: es inmutable, auditable y cuenta para el vencimiento. Lo único que no puede hacer es **salir en un entregable a concesionarias** (§13), porque ahí es donde la validez se ejerce frente a un tercero.

**`discrepancia_reloj` (D-67).** Toma `ninguna`, `leve` o `grave`. Es `grave` cuando la diferencia entre `fecha_dictamen` y `fecha_recepcion` supera las 24 horas. Un dictamen con discrepancia grave **se acepta igual** —no se castiga a nadie por el reloj del equipo que le dieron— pero **el job de vencimientos no lo procesa** hasta que el Administrador confirme o corrija la fecha, y esa corrección queda auditada con la fecha vieja y la nueva. Un vencimiento legal es una fecha que alguien tiene que poder defender; que la fije un reloj demostrablemente roto y que después un job la ejecute sin preguntarle a nadie es peor que pedirle a una persona que la mire.

**`sin_trabajo_motivo` decide si el reclamo cierra para siempre (D-89).** Es obligatorio cuando `sin_trabajo` tiene contenido, y es un enum, no texto libre:

| Motivo | Cuándo |
| --- | --- |
| `no_requiere_intervencion` | El ejemplar está sano; el vecino se equivocó, o el árbol es así |
| `ejemplar_inexistente` | Ya no está: tormenta, extracción privada, dirección errada |
| `ya_intervenido` | Una cuadrilla o un privado hizo el trabajo antes de la visita |
| `fuera_de_alcance` | Árbol privado, otra jurisdicción, no es un árbol |

**Por qué enum y no observaciones.** El formulario físico tiene una casilla y el ingeniero explica al lado; en papel alcanza porque lo lee una persona. Acá **de ese dato depende que un trabajo automático decida si el reclamo vuelve o no**, y ningún trabajo automático puede leer texto libre.

**Un dictamen tiene que decir algo.** Las restricciones de exclusión garantizaban que las intervenciones no se contradijeran; **no garantizaban que hubiera alguna**. Con las cuatro listas vacías, las dos pasaban y el dictamen se firmaba — un documento con validez legal que no autoriza nada ni declara que no hace falta nada. Se suma la regla de completitud: **o hay intervención, o hay "sin trabajo" con motivo**.

**Vencimiento: solo vence lo que autoriza algo (D-83).** Un dictamen con `sin_trabajo` **no lleva `fecha_vencimiento`** y su reclamo pasa a `cerrado_definitivo`. El vencimiento existe porque una autorización para intervenir caduca; si no se autorizó nada, no hay nada que caduque. Contradice RF-19 como está escrito — ver `99-desvios.md` (DV-22).

**Inmutabilidad (RF-19).** Un dictamen firmado no se actualiza ni se borra: lo impide una regla en la base, no una convención del código. Corregir implica anular y emitir uno nuevo, y ambos quedan en el historial.

**Un dictamen válido por reclamo (RNF-07).** Índice único sobre (`nro_reclamo_sua`, `anio`) contando solo los vigentes. Es la red de seguridad final debajo de la reserva.

### `arbolado.dictamen_foto`

Las fotos van aparte: son varias por dictamen (RF-17), pesan, y se guardan en storage con referencia acá.

| Campo | Notas |
| --- | --- |
| `id`, `dictamen_id` | FK contra `dictamen` |
| `orden` | En qué orden las sacó el ingeniero |
| `storage_ref` | Ruta en el bucket privado. Nulo mientras la foto no llegó |
| `estado` | `esperando`, `subida`, `fallida` |
| `bytes`, `subida_en` | |

**La foto se crea en `esperando` y el archivo llega después (H-01).** Al recibir el dictamen, el servidor crea tantas filas `esperando` como diga `fotos_declaradas`. Cada foto que sube después completa una.

Esto corrige una contradicción que el diseño tenía escrita: `06-offline-y-sincronizacion.md` decía que las fotos suben **antes** que el dictamen, pero `dictamen_foto.dictamen_id` es una FK contra `dictamen`. Si la foto sube primero, **la FK falla** y el primer dictamen con fotos que se sincronice devuelve un error de integridad.

**Las fotos van últimas, no primeras**, y es mejor en todos los ejes: lo chico y lo valioso —el dictamen— sale primero cuando la señal es mala, la FK se satisface siempre, no quedan objetos huérfanos en storage, y no se pierde nada de lo que se buscaba, porque el diseño ya aceptaba que *un dictamen se puede enviar con sus fotos todavía en camino*. Un dictamen firmado al que le falta una foto es un dictamen válido con una foto pendiente; una foto sin dictamen no es nada.

### `arbolado.dictamen_borrador`

El rescate del caso excepcional. Si el dictamen se rechaza porque el reclamo ya fue dictaminado por otro, la carga **no se pierde**: queda como borrador consultable, con el motivo del rechazo. Veinte minutos de trabajo frente a un árbol no se descartan por una condición de carrera.

Suma `estado` (`activo`, `inactivo`, `descartado`), `ultima_actividad` y `descartado_por`.

**El sistema no borra borradores solo (D-57).** A los **30 días sin actividad** un borrador pasa a `inactivo` y aparece en una bandeja aparte, para que el ingeniero decida si lo retoma o lo descarta. Nunca se elimina por su cuenta. Un borrador puede tener adentro trabajo de campo real —de hecho es justamente para eso que existe— y era el único punto del diseño donde se perdía trabajo humano sin que nadie lo mirara.

### `arbolado.certificacion_intento`

Una fila por intento de certificación externa (D-65). `dictamen_id`, `intento_nro`, `certificadora`, `resultado` (`ok`, `error_red`, `rechazada`), `detalle`, `fecha`, `forzado_por`.

Existe para que la pregunta *"por qué este dictamen sigue sin certificar"* tenga respuesta con nombre, fecha y motivo, en vez de un contador. El Administrador puede forzar el reintento de uno o de todo el lote, y ese forzado también queda como fila.

### `arbolado.reclamo_foto` (RF-36)

Un reclamo dado de alta por el ingeniero en la calle (§5) **puede llevar fotos**, tomadas y encoladas sin conexión. Misma forma que `dictamen_foto`, pero colgada del par **(N° SUA, año)** en vez de un dictamen.

| Campo | Notas |
| --- | --- |
| `id`, `nro_reclamo_sua`, `anio` | A qué reclamo |
| `orden`, `storage_ref`, `estado`, `bytes` | Igual que `dictamen_foto` |
| `tomada_por`, `tomada_en` | |

**Por qué hacía falta una tabla y no alcanzaba con lo que había.** `sua_sim.reclamo.foto_url` es un solo campo de texto que **viene del SUA**, puede venir vacío y no es nuestro para escribir. Sin `reclamo_foto`, un reclamo de oficio quedaba sin evidencia hasta que alguien lo dictaminara — y durante el **protocolo de tormenta** (RF-28→RF-30) es justo cuando la foto más importa: un árbol caído cortando una calle se documenta cuando se lo ve, no tres días después, cuando ya lo movieron.

Bucket privado y URL firmada de vencimiento corto, como todo lo demás. **No salen en el entregable a concesionarias**, igual que las de dictamen.

---

## 8. Vencimiento a los 18 meses

Decisión funcional: al vencer, **el reclamo vuelve a la lista de pendientes** marcado como `vencido_redictaminar`, y el dictamen viejo queda consultable como historial.

Es lo correcto forestalmente: en 18 meses el árbol creció, se pudo secar o alguien pudo podarlo, y la evaluación anterior perdió validez legal para autorizar una intervención.

El mismo job diario que escala prioridades marca los vencimientos y devuelve los reclamos a la cola. El dashboard avisa los que vencen en 30 días o menos (RF-05), así el aviso llega **antes** de que el trabajo se pierda.

---

## 9. Rutas

### `arbolado.ruta`

| Campo | Notas |
| --- | --- |
| `id`, `usuario_id`, `fecha_planificacion` | |
| `zona`, `modo_traslado` | `auto`, `pie`, `bicicleta` (RF-22) |
| `criterio`, `valor_criterio` | Por horas o por cantidad de casos (RF-21) |
| `distribucion` | Los porcentajes del balanceador efectivamente aplicados |
| `estado` | `planificada`, `en_curso`, `finalizada`, `cancelada` |
| `minutos_traslado`, `minutos_dictaminacion` | El desglose que pide RF-26 |
| `eficiencia_pct` | |
| `geometria` | La polilínea, para que el front la dibuje sin recalcular |
| `proveedor_ruteo` | `osrm` o `google`. Queda registrado con qué se calculó |

**Se guarda la geometría, no se recalcula.** Pedido explícito de la minuta: *"el mapa va a tener que quedar igual hasta que se oprima un botón de restablecer, porque ese mapa es el que tienen que seguir todo el día"*. Si el front recalculara la ruta en cada render, el mapa cambiaría solo. Persistirla lo vuelve imposible por diseño, no por cuidado del programador.

### `arbolado.detalle_ruta`

Una fila por parada: `orden_visita`, `hora_estimada_llegada`, `visitado`, `visitado_en`. Existe porque un reclamo puede caer en rutas de días distintos si no se llegó a visitar.

### `arbolado.ruta_resumen`

Una fila por jornada cerrada, escrita **antes** de purgar el detalle (D-56): `ruta_id`, `usuario_id`, `fecha`, `casos_visitados`, `casos_no_visitados`, `kilometros`, `minutos_traslado`, `minutos_dictaminacion`, `eficiencia_pct`, `directiva_aplicada`.

**Se conserva el dato que justifica una decisión administrativa y se destruye el que solo serviría para vigilar a un empleado.**

| Dato | Retención |
| --- | --- |
| Horarios de cada parada y geometría del recorrido | **90 días** |
| Resumen de la jornada: casos, kilómetros, eficiencia | Indefinido |
| Qué casos entraron y bajo qué directiva se armó la jornada (D-28) | Indefinido |

Pasados los 90 días no se pierde ni el porqué ni el rendimiento: se pierde a qué hora estuvo el ingeniero en cada esquina, que es exactamente el dato que no conviene tener guardado. La justificación de por qué se dictaminaron esos casos no se borra nunca; su rastro sí.

**Por qué la consolidación va antes y no después.** La eficiencia se calcula a partir de los horarios de parada. Borrarlos sin consolidar primero se llevaba puesta la estadística — el trabajo `purgar_rutas` deja de ser un borrado y pasa a ser una consolidación seguida de un borrado.

### `arbolado.perfil_distribucion`

Los presets del balanceador (RF-24): nombre, porcentajes por prioridad, si es global o personal.

### `arbolado.directiva_jornada`

La "bajada de línea" completa, que es más que porcentajes por prioridad. Ver reglas §7 bis.

| Campo | Notas |
| --- | --- |
| `id`, `nombre` | Se guarda como preset reutilizable |
| `ambito` | `global`, `distrito`, `usuario` |
| `ambito_valor` | Qué distrito o qué usuario, según el ámbito |
| `zona_distrito`, `zona_barrio` | Restricción geográfica |
| `categorias` | Qué categorías de reclamo entran |
| `distribucion_prioridad` | Los porcentajes, si aplica |
| `protocolo` | `normal` o `tormenta` |
| `cantidad_casos`, `horas_jornada` | El volumen de la jornada |
| `modo_traslado` | Si se fuerza uno |
| `antiguedad_minima_meses` | Para campañas sobre rezago |
| `obligatoria` | Si el ingeniero puede salirse o no |
| `vigencia_desde`, `vigencia_hasta` | **Caduca sola**: nadie tiene que acordarse de apagarla |
| `creada_por`, `activa` | |

**Resolución de conflictos:** si varias directivas vigentes alcanzan al mismo ingeniero, gana la de ámbito más específico (usuario > distrito > global); a igual ámbito, la más reciente.

La tabla `ruta` guarda `directiva_aplicada`: qué directiva regía cuando se armó esa jornada. Sin ese dato, en dos meses nadie puede explicar por qué se dictaminaron esos casos y no otros.

---

## 10. Configuración y auditoría

### `arbolado.parametro`

Clave, valor, descripción, quién y cuándo lo cambió, **y una versión**. Es RNF-09 y RF-32 hechos tabla: cambiar el negocio sin tocar código.

**Los parámetros se versionan, igual que `config_firma` (D-76).** Cada cambio inserta una versión nueva del conjunto; ninguna fila se actualiza. La `jornada` guarda **con qué versión se armó**, y las jornadas ya confirmadas siguen usando esa.

**Por qué.** Si el Administrador cambia `minutos_por_dictamen` de 10 a 15 con tres ingenieros en la calle, una ruta calculada con 10 quedaría ejecutándose contra un cálculo de 15 y **el porcentaje de eficiencia del día dejaría de significar algo** — se estaría midiendo el rendimiento contra un objetivo que se movió después. Es la misma regla del blindaje (RF-34) llevada a la configuración: **nada se mueve bajo los pies del que está en la calle.**

| Clave | Valor inicial | Fundamento |
| --- | --- | --- |
| `minutos_por_dictamen` | 10 | RF-21 |
| `dias_escalamiento` | 60 | 2 meses (minuta) |
| `meses_vencimiento_dictamen` | 18 | RF-19 |
| `dias_ventana_tormenta` | 3 | RF-28 |
| `ttl_reserva` | cierre de jornada | §6 |
| `adaptador_ruteo` | `osrm` | RF-32 — se cambia a `google` sin deploy |
| `origen_rutas` | **Moreno 2350, Rosario** — sede de Parques y Paseos | RF-22 (A-02) |
| `adaptador_geocodificacion` | proveedor abierto | B-02 |
| `anios_selector_reclamo` | año en curso y los 10 anteriores | RF-12 (A-08) |
| `sugerencia_complejidad_activa` | se enciende sola cuando el admin carga los cortes | RF-15 (A-10, D-49) |
| `autocompletado_categoria_activo` | encendido | D-52 — toggle, nunca obligatorio |
| `autocompletado_especie_activo` | encendido | D-52 |
| `dias_aviso_vencimiento` | 30 | RF-05 |
| `dias_retencion_detalle_ruta` | 90 | D-56 |
| `dias_borrador_inactivo` | 30 | D-57 |
| `dias_purga_idempotencia` | 30 | H-11 |
| `horas_discrepancia_reloj_grave` | 24 | D-67 |
| `horas_aviso_cola_pendiente` | 48 | D-58 |
| `max_fotos_dictamen` | 6 | RF-17 · acota el peso de la cola |
| `kb_max_foto` | 400 | Condición de campo |
| `cierre_duplicados_activo` | encendido | RF-38 — **toggle**: apagado, vuelve al circuito documentado |
| `insistencia_sube_un_nivel` | `true` | D-92 |

### `arbolado.ventana_laboral` (RF-37)

Cuándo y cuánto trabajo se puede **tomar**. No limita dictaminar ni sincronizar.

| Campo | Notas |
| --- | --- |
| `id`, `nombre` | |
| `ambito` | `global`, `distrito`, `usuario` |
| `ambito_valor` | Qué distrito o qué usuario |
| `hora_desde`, `hora_hasta` | Franja en la que se puede tomar trabajo |
| `dias_semana` | Qué días aplica |
| `cupo_reclamos`, `cupo_periodo` | Cuántos casos como máximo, por día o por semana |
| `vigencia_desde`, `vigencia_hasta` | Caduca sola |
| `creada_por`, `activa` | |

**Resolución de conflictos: gana la de ámbito más específico** (usuario > distrito > global); a igual ámbito, la más reciente. **Es exactamente el mecanismo de `directiva_jornada`**, y no se inventa uno nuevo.

**La tabla arranca vacía y sin filas no limita nada** — mismo criterio que `regla_complejidad` (D-49). Un horario puesto por nosotros se vería igual que uno acordado con la repartición, y no lo es.

> El front **ya usa 10 minutos**, el valor de RF-21 (revisado el 21/08). Lo que falta es que lo **lea de acá** en vez de tenerlo escrito en el código, que es lo que pide RNF-09. Ver DV-02.

### `arbolado.auditoria`

Registra las acciones sensibles: firma de dictamen, cambio de rol o de habilitación para firmar, cambio de parámetro, reserva y liberación, alta de reclamo, corrección del punto en el mapa, corrección de categoría, anulación, **desblindaje manual, alta y baja de captor, liberación o descarte de operaciones en cuarentena, corrección de fecha por discrepancia de reloj, intento y forzado de certificación, y emisión de entregable a concesionaria**. Guarda quién, cuándo, qué cambió y desde dónde.

No es burocracia: es un sistema que emite documentos con validez legal. Si alguien pregunta quién autorizó extraer un árbol de treinta años, tiene que haber respuesta.

### `arbolado.idempotencia`

Clave de la operación, usuario, endpoint, `creado_en` y respuesta original. Si la cola offline reenvía algo ya procesado, se devuelve la respuesta original en lugar de ejecutar dos veces.

**Se purga a los 30 días (H-11).** Guarda la respuesta completa en `jsonb` y no tenía ni retención ni job: crecía para siempre. Treinta días está muy por encima de cualquier ventana de reintento real —la más larga que contempla el diseño es la de un captor que estuvo una semana sin volver— y por debajo de lo que haría de esta tabla un problema de tamaño. Es el trabajo 7 de `T9-jobs-y-reloj.md`.

---

## 11. Storage

| Bucket | Contenido | Acceso |
| --- | --- | --- |
| `fotos-dictamen` | Fotos de campo (RF-17) | Privado, por URL firmada de corta duración |
| `fotos-reclamo` | Fotos de un alta en la calle (RF-36) | Privado, idem |
| `entregables` | PDF por paquete de concesionaria (RF-33) | Privado, solo Administrador |

El **trazo de la firma ya no ocupa un bucket**: viaja como vectores dentro del propio dictamen (`firma_trazo`), así que no hay un archivo que perder ni un objeto que quede huérfano si el envío se corta a la mitad.

Ningún bucket público. Una foto puede mostrar el frente de la casa de un vecino: es dato personal y no se sirve por URL adivinable.

---

## 12. Seguridad a nivel de fila

Ninguna tabla sin política. Resumen:

| Tabla | Lector | Operario | Jefe | Administrador |
| --- | --- | --- | --- | --- |
| `sua_sim.reclamo` | — | lee los derivados a Arbolado | idem | lee todo |
| `reclamo_estado` | lee agregados | lee | lee y ajusta | lee y ajusta |
| `reclamo_geo` | — | lee; corrige el punto de lo que tiene reservado | idem | escribe |
| `perfil` | lee el propio | lee el propio | lee los del equipo | administra todos |
| `config_firma` | — | lee | lee | escribe |
| `regla_complejidad` | — | lee | lee | escribe |
| `reserva` | — | crea y libera **las propias**; ve las ajenas en solo lectura | ve todas; libera cualquiera | libera cualquiera |
| `dictamen` | — | crea y firma; nunca actualiza ni borra | idem | lee todo; puede anular. **No crea ni firma** |
| `ruta` / `detalle_ruta` | — | solo las propias | lee las del equipo | lee todas |
| `directiva_jornada` | — | lee la que le aplica | **escribe** | escribe |
| `parametro` | — | lee | lee | escribe |
| `regla_prioridad` | — | lee | lee | escribe |
| `dictamen_foto` / `reclamo_foto` | — | crea y sube las propias | idem | lee todo |
| `dictamen_borrador` | — | los propios | los propios | lee todo |
| `captor` | — | lee el propio | lee los del equipo | administra todos |
| `operacion_cuarentena` | — | — | — | lee y resuelve |
| `certificacion_intento` | — | — | lee | lee y fuerza reintento |
| `concesionaria` / `entregable_concesionaria` | — | — | — | **exclusivo** |
| `ventana_laboral` | — | lee la que le aplica | **escribe** | escribe |
| `parametro_version` | — | lee | lee | escribe |
| `ruta_resumen` | lee agregados | los propios | los del equipo | lee todo |
| `auditoria` | — | — | — | lee. **Nadie escribe directo** |

El rol se valida en la Edge Function **y** en la base. Es redundante a propósito: si un token se filtra o alguien expone la base, RLS sigue conteniendo.

---

## 13. Entregable para empresas concesionarias

Las concesionarias **no son usuarias del sistema**: no tienen cuenta, ni rol, ni acceso. Reciben un export que **solo el Administrador genera**, con los dictámenes firmados y vigentes que les toca ejecutar.

### `arbolado.concesionaria`

| Campo | Notas |
| --- | --- |
| `id`, `nombre`, `contacto` | |
| `zona_adjudicada`, `tipo_trabajo_adjudicado` | Opcionales, para precargar los filtros |
| `activa` | |

**Sin cuenta, sin rol, sin acceso.** La fila existe únicamente para poder registrar el destinatario de un entregable. Es la corrección de una inconsistencia que el diseño ya tenía escrita: §13 prometía poder contestar *qué se le informó a una contratista y cuándo*, y la tabla no guardaba a quién.

### `arbolado.entregable_concesionaria`

| Campo | Notas |
| --- | --- |
| `id`, `generado_por`, `generado_en` | Quién lo emitió y cuándo |
| `concesionaria_id` | **A quién se le informó** |
| `filtros` | Zona, período y estado usados para armarlo |
| `paquetes` | El detalle: acción autorizada, complejidad, cuántos ejemplares en cada paquete |
| `dictamenes_incluidos` | Qué dictámenes salieron en ese entregable |
| `archivo_ref` | El o los PDF generados, en storage privado |
| `tiene_anulaciones` | Se enciende si después se anuló alguno de los dictámenes incluidos |

Se guarda el registro de cada generación, no solo el archivo: si mañana hay una discusión sobre qué se le informó a una contratista y cuándo, hay respuesta.

**Solo entran dictámenes firmados, vigentes y certificados.** Nunca borradores, vencidos, anulados ni pendientes de certificación (D-65): el entregable es el punto donde la validez legal se ejerce frente a un tercero.

### Anular un dictamen que ya salió en un entregable

Al anular, el sistema verifica si ese dictamen salió en algún entregable emitido. Si salió, enciende `tiene_anulaciones` y le muestra al Administrador **a qué empresa hay que notificar**.

El sistema no puede des-enviar un PDF. Lo que no puede hacer es dejarlo pasar en silencio, porque del otro lado hay una autorización de extracción que ya no vale y una cuadrilla que puede estar por ejecutarla.

### El armado: el sistema propone, la persona ajusta, después emite

El Administrador elige **zona, período y empresa**; el sistema arma los paquetes agrupando por **acción autorizada y complejidad** —extracción compleja por un lado, poda simple por otro— y le muestra la propuesta antes de emitir nada: cuántos paquetes, cuántos ejemplares en cada uno. Recién ahí saca los que no correspondan y emite.

Es el mismo patrón que el balanceador (RF-25), la pre-confirmación de jornada (D-53) y las sugerencias de especie y categoría (D-52). **La repetición no es casualidad y conviene decirlo en la defensa**: el sistema nunca ejecuta sobre una persona una decisión que ella no pudo mirar antes.

**Fundamento de privacidad.** Es un tercero externo a la repartición. El entregable lleva lo necesario para ejecutar la intervención —ubicación del ejemplar, acción autorizada, complejidad, vigencia del dictamen— y **no** el circuito interno ni los datos del vecino que hizo el reclamo. Que las concesionarias sean lectoras del sistema completo sería exponer datos de vecinos a una empresa privada sin ninguna necesidad operativa.

---

## 14. Pendiente de decidir

Lo que estaba acá se cerró el 20/08 y quedó absorbido arriba: el entregable a concesionarias (C-01 → §13), la retención de rutas, fotos y auditoría (§9 y `07-seguridad-y-privacidad.md`), y las tablas nuevas del blindaje.

Queda abierto y **depende de terceros**:

- Si el rol `jefe` se confirma como se diseñó acá (**A-09**, la repartición).
- Los cortes de diámetro y altura de `regla_complejidad` (**A-10**, Dirección Técnica). El mecanismo ya está resuelto por D-49: la tabla arranca vacía y la sugerencia no aparece.
- Los textos reales de reclamos que validen las señales de riesgo provisorias (**A-12**).
- La política de datos personales propia de la repartición, que define la retención de fotos.

Qué expone exactamente cada endpoint sigue viviendo en `04-contrato-api.md`; no es una pregunta abierta, es una separación de documentos.
