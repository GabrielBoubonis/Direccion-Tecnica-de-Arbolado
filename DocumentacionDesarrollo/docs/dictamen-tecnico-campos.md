# Dictamen Técnico de Arbolado — detalle de campos

_Este archivo es un respaldo de referencia: enumera los ~25 campos del formulario físico
"Dictamen Técnico de Arbolado" que el formulario digital reproduce (ver `diseño-ui.md`,
Pantalla/Módulo 4, y el wireframe `diagramas/wireframes/04-formulario-dictamen.svg`), con el
paso del formulario digital en el que aparece cada uno y, cuando corresponde, el atributo
equivalente en `er-modelo.md` (entidad `Dictamen`)._

---

## Paso 1 — Datos del ejemplar y ubicación

| Campo | Tipo / origen | Atributo en er-modelo.md |
|---|---|---|
| Distrito | Precargado desde la Solicitud, solo lectura | (vía `Solicitud.distrito`, no se duplica en `Dictamen`) |
| Nota N.° | Número entero positivo | `nota_numero` |
| Exp N.° | Número entero positivo | `expediente_numero` |
| Fecha | Fecha, autogenerada al emitir | `fecha_emision` |
| SUA N.° | Precargado, solo lectura | (vía `Solicitud.numero_sua`) |
| Domicilio de solicitud | Precargado, solo lectura | (vía `Solicitud.direccion`) |
| Domicilio del ejemplar\* | Punto elegido en el mapa; la dirección la completa el geocodificador (puede diferir del anterior — ver Decisiones 3 y 10 en `er-modelo.md`) | `domicilio_ejemplar`, `latitud_ejemplar`, `longitud_ejemplar` |
| Calle esquina / Número esquina | Selección entre calles sugeridas por el geocodificador | `calle_esquina`, `numero_esquina` |
| Referencia de ubicación | Texto libre con largo máximo | `referencia_ubicacion` |
| Especie\* | Selección con búsqueda en un catálogo; si la especie no figura, se agrega desde el selector. Obligatorio | `id_especie` |
| Distancia a medianera/referencia | Numérico, editable | `distancia_medianera_referencia` |
| Cantidad de ejemplares al frente | Numérico, editable | `cantidad_frente` |

## Paso 2 — Diagnóstico

| Campo | Tipo / origen | Atributo en er-modelo.md |
|---|---|---|
| Nivel de daño en vereda (Bloque 1) | Selección única: Alto / Medio / Bajo | `nivel_dano_vereda` |
| Extracción (Bloque 2) | Casillero booleano | `es_extraccion` |
| Perímetro del tronco (Bloque 2) | Numérico, visible solo si Extracción está marcada | `perimetro_tronco` |
| Motivo de extracción (Bloque 2) | Selección entre 12 opciones, visible solo si Extracción está marcada | `motivo_extraccion` |
| Sin trabajo (Bloque 5) | Casillero booleano | `es_sin_trabajo` |
| Motivo de sin trabajo (Bloque 5) | Selección entre 6 opciones | `motivo_sin_trabajo` |

## Paso 3 — Intervención

_Deshabilitado por completo si en el Paso 2 se marcó Extracción (RF-46; ver nota de
"Regla de validación — exclusión extracción/trabajos" junto a la entidad `Dictamen` en
`er.puml`)._

| Campo | Tipo / origen | Entidad / atributo en er-modelo.md |
|---|---|---|
| Trabajos subterráneos (Bloque 3) | Selección múltiple, 3 opciones (una con campo de distancia) | Entidad `TrabajoSubterraneo` (`tipo_trabajo`, `distancia_borde`) |
| Trabajos aéreos (Bloque 4) | Selección múltiple, 12 opciones | Entidad `TrabajoAereo` (`tipo_trabajo`) |

## Paso 4 — Información adicional y fotografías

| Campo | Tipo / origen | Atributo en er-modelo.md |
|---|---|---|
| Complejidad de la intervención\* | Selección única: Baja / Media / Alta / Máxima | `complejidad` |
| Urgente | Casillero booleano | `urgente` |
| Árbol frente a garage | Casillero booleano | `arbol_frente_garage` |
| Media tensión | Casillero booleano | `media_tension` |
| De oficio | Casillero booleano | `de_oficio` |
| Plantar | Selección: Cazuela / Construir cazuela / Vereda jardín / ninguna | `plantar` |
| Fotografías del ejemplar\* | Mínimo 1, obligatorio (RF-45) | Entidad `Fotografia` (`archivo_referencia`, `orden`) |

## Paso 5 — Observaciones y firma

| Campo | Tipo / origen | Atributo en er-modelo.md |
|---|---|---|
| Nivel de prioridad de la intervención\* | Selección única: Alta / Media / Baja (urgencia de ejecución, no confundir con la prioridad de triage de la Solicitud — ver Decisión 6 en `er-modelo.md`) | `nivel_prioridad` |
| Observaciones | Texto libre con largo máximo | `observaciones` |
| Firma digital | Generada por el sistema al confirmar (hash + timestamp + usuario, con verificación WebAuthn previa — RF-51) | `hash_firma` |

\* Campo obligatorio.

**Regla general (RF-56):** solo Referencia de ubicación y Observaciones admiten texto libre. Todo
campo con valores conocidos se elige de una lista cerrada o en el mapa, y el servidor rechaza
cualquier valor fuera de ellas (ver Decisión 10 en `er-modelo.md`).

---

## Conteo total

12 (Paso 1) + 6 (Paso 2) + 2 (Paso 3, cada una admite múltiples filas) + 7 (Paso 4) + 3
(Paso 5) ≈ 25 campos de carga directa, sin contar los derivados automáticamente por el
sistema (fecha de emisión, hash de firma) ni los de solo lectura precargados desde la
Solicitud.
