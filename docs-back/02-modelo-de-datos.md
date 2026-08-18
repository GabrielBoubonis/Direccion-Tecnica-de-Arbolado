# Modelo de datos

> Última actualización: 18/08/2026 · Estado: **en diseño, sin aprobar**
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
| `origen_ingreso` | enum | `presencial`, `distrito`, `munibot`, `telefonico`, `de_oficio` |
| `tipo` / `subtipo` | texto | Fijos en `Reclamo` / `Problemas con el arbolado público`. Existen para que el adaptador filtre igual que contra el SUA real |
| `direccion_exacta` | texto | Para mostrar |
| `calle`, `altura` | texto, entero | Normalizados, para la búsqueda por dirección |
| `entre_calle_1`, `entre_calle_2` | texto | |
| `distrito` | enum | `Centro`, `Norte`, `Noroeste`, `Oeste`, `Sudoeste`, `Sur` |
| `barrio` | texto | Permite afinar la zona al planificar la jornada |
| `lat`, `lng` | punto geográfico | Sin esto no hay ruta posible (RF-22, RF-26) |
| `descripcion_motivo` | texto largo | |
| `foto_url` | texto | Puede venir vacío: la calidad del dato de entrada es heterogénea |
| `estado_sua` | enum | `ingresado`, `derivado`, `dictaminado`, `en_ejecucion`, `cerrado` |
| `area_asignada` | texto | Solo los derivados a Arbolado entran al sistema (RF-07) |
| `fecha_derivacion` | fecha y hora | |
| `creado_por_usuario` | uuid, nulo | Solo para altas de oficio. Ver §5 |

**Índices**: por `(area_asignada, estado_sua)` para el listado; por `distrito`; geoespacial sobre `(lat, lng)` para el armado de rutas; por `(calle, altura)` para la consulta por dirección.

---

## 3. Esquema `arbolado` — identidad

### `arbolado.perfil`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `usuario_id` | uuid | PK. Referencia a la identidad emitida por `IAuthProvider` |
| `identificador` | texto único | Lo que el agente tipea en el login |
| `legajo` | texto | |
| `nombre_apellido` | texto | |
| `rol` | enum | `lector`, `operario`, `administrador` |
| `matricula` | texto, nulo | **Sin matrícula no se puede firmar** (RF-18) |
| `activo` | booleano | Desactivar revoca el acceso a la app sin tocar la cuenta institucional (RF-31) |

La matrícula es un campo aparte y anulable a propósito: RF-02 dice que dentro del rol Operario **solo** los matriculados firman. Si fuera un rol distinto, un operario sin matrícula no podría hacer el resto de su trabajo.

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
| `etiqueta_tormenta` | booleano | Habilita la sección de emergencia (RF-28) |
| `fecha_tormenta` | fecha y hora | Para la ventana de 3 días |
| `origen_alta` | enum | `sua`, `oficio`, `vecino`, `tormenta` |
| `categoria` | enum | Determina el ritmo de escalamiento. Ver reglas §2 |
| `senal_riesgo_detectada` | texto, nulo | Qué frase del texto del vecino disparó el salto de color. Nunca hay un color inexplicable |
| `cantidad_reclamos_ejemplar` | entero | Insistencia del vecino: cuántos reclamos hay sobre el mismo árbol |
| `id_ejemplar_agrupado` | texto | Agrupador de reclamos sobre el mismo ejemplar. Ver abajo |

**Agrupación por ejemplar.** La insistencia del vecino solo se puede medir si el sistema sabe que tres reclamos hablan del mismo árbol. Se agrupa por calle y altura coincidentes y, cuando hay coordenadas, por cercanía menor a 15 metros. El criterio se documenta explícitamente porque un mismo árbol de vereda puede recibir reclamos con la altura catastral corrida en un número, y agrupar de más sería tan malo como no agrupar.

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
| Autoría | `usuario_id`, `matricula_usada`, `nro_expediente`, `nro_nota` |
| Tiempos | `fecha_dictamen` (reloj del dispositivo), `fecha_recepcion` (reloj del servidor), `fecha_vencimiento` |
| Ejemplar | `especie`, `perimetro_tronco`, `altura_aproximada`, `estado_copa`, `estado_tronco`, `estado_raices`, `inclinacion_ejemplar` |
| Ubicación | `direccion_confirmada`, `calle_esquina`, `distancia_medianera`, `cantidad_frente`, `lat_captura`, `lng_captura` |
| Intervención | `categoria_intervencion`, `extraccion[]`, `trabajos_aereos[]`, `trabajos_subterraneos[]`, `sin_trabajo[]`, `plantar[]` |
| Clasificación | `dano_vereda`, `complejidad`, `urgencia`, `epoca_recomendada` |
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
| `origen_rutas` | coordenadas de Parques y Paseos | RF-22 |
| `dias_aviso_vencimiento` | 30 | RF-05 |

> El front usa hoy 7 minutos por dictamen, contra los 10 de RF-21. Se corrige al valor del documento y se anota el desvío.

### `arbolado.auditoria`

Registra las acciones sensibles: firma de dictamen, cambio de rol o matrícula, cambio de parámetro, reserva y liberación, alta de reclamo, anulación. Guarda quién, cuándo, qué cambió y desde dónde.

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

| Tabla | Lector | Operario | Administrador |
| --- | --- | --- | --- |
| `sua_sim.reclamo` | — | lee los derivados a Arbolado | lee todo |
| `reclamo_estado` | lee agregados | lee | lee y ajusta |
| `perfil` | lee el propio | lee el propio | administra todos |
| `reserva` | — | crea y libera **las propias**; ve las ajenas en solo lectura | libera cualquiera |
| `dictamen` | — | crea **con matrícula**; nunca actualiza ni borra | lee todo; puede anular |
| `ruta` / `detalle_ruta` | — | solo las propias | lee todas |
| `parametro` | — | lee | escribe |
| `regla_prioridad` | — | lee | escribe |
| `auditoria` | — | — | lee. **Nadie escribe directo** |

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

- Cómo se generan las coordenadas de los reclamos inventados → `05-datos-semilla.md`
- Qué exponen exactamente los endpoints → `04-contrato-api.md`
- Retención del registro de auditoría y de las fotos → `07-seguridad-y-privacidad.md`
- Qué campos exactos lleva el entregable para concesionarias y en qué formato
