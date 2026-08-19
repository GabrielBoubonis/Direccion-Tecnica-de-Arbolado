# Modelo de datos

> Última actualización: 19/08/2026 (segunda vuelta) · Estado: **en diseño, sin aprobar**
> Incorpora las respuestas de relevamiento del 18/08 (grupos A y B de `entregables/preguntas-abiertas.html`).
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
| `estado_modulo` | enum | `sin_dictaminar`, `reservado`, `dictaminado`, `vencido_redictaminar` |
| `etiqueta_tormenta` | booleano | Habilita la sección de emergencia (RF-28). Llega del SUA **o** la marca el Administrador mientras el CIL no la implemente (A-03) |
| `fecha_tormenta` | fecha y hora | Para la ventana de 3 días |
| `origen_alta` | enum | `sua`, `oficio`, `vecino`, `tormenta` |
| `categoria` | enum | Determina el ritmo de escalamiento. **Inferida del texto libre** (B-03). Ver reglas §2 |
| `categoria_origen` | enum | `inferida` o `corregida`. Nunca se muestra una categoría sin saber de dónde salió |
| `categoria_corregida_por` | uuid, nulo | Quién la corrigió |
| `senal_riesgo_detectada` | texto, nulo | Qué frase del texto del vecino disparó el salto de color. Nunca hay un color inexplicable |
| `cantidad_reclamos_ejemplar` | entero | Insistencia del vecino: cuántos reclamos hay sobre el mismo árbol |
| `id_ejemplar_agrupado` | texto | Agrupador de reclamos sobre el mismo ejemplar. Ver abajo |

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

Que la regla de señales de riesgo sea desactivable es una decisión deliberada: el relevamiento dice que la calidad del dato de entrada es muy despareja, y una regla que interpreta texto libre se puede equivocar. Si el área concluye que genera más ruido que valor, se apaga y el sistema sigue funcionando con las demás reglas.

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
| `motivo_liberacion` | `dictaminado`, `vencida`, `manual`, `liberada_por_admin` |

**Garantía dura:** un índice único parcial permite **una sola reserva activa por reclamo**. No depende de que el código se acuerde de chequear: lo impone la base. Dos pedidos simultáneos, uno gana y el otro recibe un rechazo limpio.

Mientras está reservado, el resto del equipo lo ve en el listado marcado con quién lo tiene y desde cuándo — no desaparece. Así el jefe ve el reparto del día y nadie reclama dos veces el mismo caso.

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
| Intervención | `categoria_intervencion`, `extraccion[]`, `trabajos_aereos[]`, `trabajos_subterraneos[]`, `sin_trabajo[]`, `plantar[]` |
| Clasificación | `dano_vereda`, `complejidad`, `complejidad_sugerida`, `urgencia`, `epoca_recomendada` |
| Banderas | `urgente`, `frente_garage`, `media_tension`, `de_oficio` |
| Cierre | `observaciones_tecnicas`, `firma_ref`, `firma_hash`, `hash_documento`, `sello_tiempo`, `estado` |

Cuatro decisiones que vale la pena justificar:

- **`id` generado en el dispositivo.** Es la clave de idempotencia: si el celular reintenta el envío tres veces porque la señal va y viene, entra **un** dictamen, no tres. Sin esto, la cola offline duplicaría trabajo.
- **`fecha_dictamen` y `fecha_recepcion` separadas.** El dictamen se emitió frente al árbol el martes a las 10:30, aunque haya llegado al servidor el miércoles. La fecha legal es la primera; la segunda es trazabilidad. El vencimiento a 18 meses cuenta desde la emisión.
- **Dos fechas y dos relojes implican confiar en el reloj del celular.** Se acota: si `fecha_dictamen` es posterior a `fecha_recepcion` o anterior a la reserva, se registra la discrepancia en auditoría en vez de aceptarla en silencio.
- **`hash_documento`.** Huella del contenido al momento de firmar. Cualquier modificación posterior se detecta comparando. Es lo que sostiene la inmutabilidad de RNF-06 más allá de la promesa.

**Inmutabilidad (RF-19).** Un dictamen firmado no se actualiza ni se borra: lo impide una regla en la base, no una convención del código. Corregir implica anular y emitir uno nuevo, y ambos quedan en el historial.

**Un dictamen válido por reclamo (RNF-07).** Índice único sobre (`nro_reclamo_sua`, `anio`) contando solo los vigentes. Es la red de seguridad final debajo de la reserva.

### `arbolado.dictamen_foto`

Las fotos van aparte: son varias por dictamen (RF-17), pesan, y se guardan en storage con referencia acá.

### `arbolado.dictamen_borrador`

El rescate del caso excepcional. Si el dictamen se rechaza porque el reclamo ya fue dictaminado por otro, la carga **no se pierde**: queda como borrador consultable, con el motivo del rechazo. Veinte minutos de trabajo frente a un árbol no se descartan por una condición de carrera.

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

Clave, valor, descripción, quién y cuándo lo cambió. Es RNF-09 y RF-32 hechos tabla: cambiar el negocio sin tocar código.

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

> El front usa hoy 7 minutos por dictamen, contra los 10 de RF-21. Se corrige al valor del documento y se anota el desvío.

### `arbolado.auditoria`

Registra las acciones sensibles: firma de dictamen, cambio de rol o de habilitación para firmar, cambio de parámetro, reserva y liberación, alta de reclamo, corrección del punto en el mapa, corrección de categoría, anulación. Guarda quién, cuándo, qué cambió y desde dónde.

No es burocracia: es un sistema que emite documentos con validez legal. Si alguien pregunta quién autorizó extraer un árbol de treinta años, tiene que haber respuesta.

### `arbolado.idempotencia`

Clave de la operación, usuario, endpoint y respuesta original. Si la cola offline reenvía algo ya procesado, se devuelve la respuesta original en lugar de ejecutar dos veces.

---

## 11. Storage

| Bucket | Contenido | Acceso |
| --- | --- | --- |
| `fotos-dictamen` | Fotos de campo (RF-17) | Privado, por URL firmada de corta duración |
| `firmas` | Trazo de la firma (RF-18) | Privado, nunca expuesto al front |

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
| `auditoria` | — | — | — | lee. **Nadie escribe directo** |

El rol se valida en la Edge Function **y** en la base. Es redundante a propósito: si un token se filtra o alguien expone la base, RLS sigue conteniendo.

---

## 13. Entregable para empresas concesionarias

Las concesionarias **no son usuarias del sistema**: no tienen cuenta, ni rol, ni acceso. Reciben un export que **solo el Administrador genera**, con los dictámenes firmados y vigentes que les toca ejecutar.

### `arbolado.entregable_concesionaria`

| Campo | Notas |
| --- | --- |
| `id`, `generado_por`, `generado_en` | Quién lo emitió y cuándo |
| `filtros` | Zona, período y estado usados para armarlo |
| `dictamenes_incluidos` | Qué dictámenes salieron en ese entregable |
| `archivo_ref` | El documento generado, en storage privado |

Se guarda el registro de cada generación, no solo el archivo: si mañana hay una discusión sobre qué se le informó a una contratista y cuándo, hay respuesta.

**Fundamento de privacidad.** Es un tercero externo a la repartición. El entregable lleva lo necesario para ejecutar la intervención —ubicación del ejemplar, acción autorizada, complejidad, vigencia del dictamen— y **no** el circuito interno ni los datos del vecino que hizo el reclamo. Que las concesionarias sean lectoras del sistema completo sería exponer datos de vecinos a una empresa privada sin ninguna necesidad operativa.

---

## 14. Pendiente de decidir

- Qué exponen exactamente los endpoints → `04-contrato-api.md`
- Retención del registro de auditoría, de las fotos y de las rutas → `07-seguridad-y-privacidad.md`
- Qué campos exactos lleva el entregable para concesionarias y en qué formato (C-01)
- Si el rol `jefe` se confirma como se diseñó acá (A-09)
