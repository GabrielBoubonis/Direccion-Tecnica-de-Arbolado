# T7 — Ruteo, balanceador y geocodificación

> Diseño técnico · Última actualización: 19/08/2026 · Estado: **sin aprobar**
> Responde: cómo se arma una ruta, cómo se reparte la jornada y cómo una dirección escrita se convierte en un punto.

---

## 1. El problema, en concreto

El ingeniero sale de **Moreno 2350** —la sede de Parques y Paseos (A-02)— a las ocho de la mañana, tiene seis horas, y hay cuatrocientos reclamos sin dictaminar repartidos por seis distritos. Tiene que volver a la sede al terminar (RF-22).

El sistema decide **cuáles** visita (balanceador, §3), **en qué orden** (§4) y **por dónde** (§5). Cada dictamen lleva **diez minutos, configurable** (RF-21, RNF-09).

Hoy esa decisión se toma a criterio de cada uno, y el relevamiento la señala como uno de los tres cuellos de botella del área.

---

## 2. Geocodificación

> Puerto `IGeocodificador` · Decisión D-46 · Desvío DV-12

### Por qué existe este paso

El SUA guarda **solo la dirección escrita** del ejemplar y ninguna coordenada, porque el censo de arbolado nunca se geolocalizó (B-02). Sin punto no hay mapa ni ruta (RF-22, RF-26), así que convertir "Mendoza 3450" en un punto es trabajo del módulo.

### Normalización previa, específica de Rosario

Antes de llamar al proveedor:

1. Minúsculas y sin tildes.
2. Expansión de abreviaturas: `av.`→`avenida`, `bv.`→`boulevard`, `pje.`→`pasaje`, `gral.`→`general`, `dr.`→`doctor`, `pte.`→`presidente`.
3. Se agrega `, Rosario, Santa Fe, Argentina` — sin eso, "San Martín 4500" puede caer en cualquier ciudad del país.
4. Si hay `entre_calle_1` y `entre_calle_2` y **no** hay altura, se consulta la **intersección** en lugar de la altura.

El paso 3 parece trivial y es el que más errores evita: casi todas las calles de Rosario tienen homónimas en otras ciudades argentinas.

### La precisión se declara

| Precisión | Cuándo | Cómo se comporta el sistema |
| --- | --- | --- |
| `exacta` | El proveedor halló la altura | Entra a la ruta normalmente |
| `aproximada` | Interpoló sobre la traza de la cuadra | Entra a la ruta, **se dibuja distinto** |
| `solo_calle` | Ubicó la calle pero no la altura | Entra a la ruta, **destacado en pre-confirmación** |
| `fallida` | No resolvió | **No entra a la ruta.** Sí al listado y al dashboard |

**Un punto falsamente exacto es peor que un punto declarado dudoso.** Si el sistema muestra todos los pines iguales, el ingeniero descubre el problema parado en la vereda equivocada. Si los muestra distintos, lo resuelve antes de salir.

### El ingeniero corrige, y su corrección manda

La corrección ocurre en la **pantalla de pre-confirmación** (D-53): es el momento con señal, con el mapa a la vista y sin apuro. En la calle, con una barra de señal y el sol de frente, no se corrige nada.

Una vez corregido, el punto queda como `corregido_por_usuario` y **ninguna geocodificación posterior lo pisa**. El ingeniero estuvo parado frente al árbol: es la única persona con el dato bueno.

### Cuándo se geocodifica

| Momento | Qué |
| --- | --- |
| Al importar un reclamo del origen | Se encola |
| Job nocturno | Procesa la cola y reintenta las `fallida` (T9) |
| Al dar de alta en campo | En línea, y si falla queda encolado |

Nunca en el camino crítico de armar una ruta: si el geocodificador está caído, la jornada se arma igual con los reclamos que ya tienen punto.

### Límites de uso

Nominatim tiene política de uso razonable: **una consulta por segundo**, con identificación en la cabecera. El job respeta ese ritmo y cachea por dirección normalizada — dos reclamos de "Mendoza 3450" consultan una vez.

Ese límite es una de las razones por las que la geocodificación es un puerto: el geocodificador municipal, cuando exista, no va a tener ese techo, y el cambio va a ser de configuración.

---

## 3. Balanceador de jornada

> RF-23, RF-24, RF-25 · Función pura `balancear` (T3 §10)

### Paso 1 — Cuántos casos entran

```
Por casos:  cupo = valor pedido
Por horas:  cupo = (horas × 60 − trasladoEstimado) / minutosPorDictamen
```

`trasladoEstimado` arranca en un valor conservador por modo de traslado y se **recalcula** después del primer ordenamiento, porque el traslado real depende de qué casos entraron. Es un ciclo de dos pasadas, no una fórmula cerrada: se estima, se ordena, se corrige el cupo, se reordena.

**`minutosPorDictamen` sale de la tabla de parámetros.** El requerimiento dice diez (RF-21); el prototipo usa siete y hay que corregirlo (DV-02).

### Paso 2 — Qué mezcla

| Modo | Comportamiento |
| --- | --- |
| `urgentes_primero` | Llena empezando por rojo y bajando hasta completar |
| `por_porcentaje` | Los porcentajes que fija el jefe con los deslizables (RF-24) |
| `automatico_equilibrado` | Reparto parejo entre las cuatro prioridades |

A igual prioridad, **primero el más antiguo**. Es coherente con el problema que ataca el proyecto: el rezago de expedientes.

### Paso 3 — Redistribución obligatoria (RF-25)

Si se pide 25% de urgentes y **solo hay dos casos rojos disponibles en la zona**, el cupo sobrante se completa con las otras prioridades, de mayor a menor.

**Nunca se devuelve una jornada a medio llenar**: el tiempo del ingeniero en la calle no se desperdicia porque falte stock de un color.

La redistribución **se informa** en la respuesta (`redistribuido`, T6 §4). El ingeniero ve que pidió cuatro rojos y recibió dos, con el motivo, en vez de descubrirlo contando pines en el mapa.

### Paso 4 — La directiva manda

Si hay una directiva vigente que alcanza al ingeniero (T3 §11), su filtro se aplica **antes** del balanceo. Si es **obligatoria**, una jornada que la exceda se rechaza con `DIRECTIVA_OBLIGATORIA_VIOLADA`; si es **sugerida**, precarga los valores y el ingeniero puede cambiarlos.

La ruta registra **bajo qué directiva se armó** (D-28).

---

## 4. Orden de visita

> Función pura `ordenarVisitas` · RF-22, RF-26

### El problema y la decisión

Es un problema del viajante con punto de partida y regreso fijos. Para diez a veinte paradas, la solución exacta es cara y **no hace falta**: la diferencia entre la ruta óptima y una buena ronda el cinco por ciento, y la calle introduce más variación que eso.

**Heurística en dos etapas:**

1. **Vecino más cercano** desde la sede, usando la matriz de tiempos.
2. **Mejora 2-opt** hasta que no haya mejora o se agoten doscientas iteraciones.

Con veinte paradas eso corre en milisegundos y queda a un puñado de puntos porcentuales del óptimo.

### Por qué el orden lo decide el núcleo y no el proveedor

`IRuteoProvider` devuelve **matriz de tiempos y geometría por separado** (T2 §4.9). El orden lo decide una función pura del dominio.

Si el orden lo resolviera el proveedor, el balanceador, las directivas de jornada y las paradas forzadas por el ingeniero quedarían dentro de una caja negra de un tercero. Y el día que se cambie de OSRM a Google Routes, el orden de visitas cambiaría solo — con lo cual el sistema daría resultados distintos por un cambio de configuración, que es exactamente lo que RF-32 promete que no pasa.

### Paradas forzadas

El ingeniero puede fijar una parada en una posición (T4 §5). El algoritmo respeta las fijadas y optimiza el resto entre ellas. **El orden óptimo es una sugerencia, no una orden**: el ingeniero conoce la calle, sabe qué esquina está cortada y qué zona conviene evitar a determinada hora.

### Horarios estimados

```
hora(1) = inicioJornada + traslado(sede → parada1)
hora(n) = hora(n−1) + minutosPorDictamen + traslado(parada n−1 → parada n)
```

Se devuelven con la ruta y se guardan en `detalle_ruta`, para poder comparar después lo estimado con lo real.

### Eficiencia

```
eficiencia = minutosDictaminacion / (minutosDictaminacion + minutosTraslado) × 100
```

Es el porcentaje de la jornada efectivamente dedicado a dictaminar. **Es la métrica que justifica el módulo entero**: si el sistema no la mejora respecto de la planificación manual, no está resolviendo el problema que dice resolver.

---

## 5. Geometría del recorrido

Una vez fijado el orden, se pide la **polilínea** al proveedor y se guarda en `arbolado.ruta.geometria`.

**Se guarda, no se recalcula.** Pedido explícito de la minuta: *"el mapa va a tener que quedar igual hasta que se oprima un botón de restablecer, porque ese mapa es el que tienen que seguir todo el día"*. Si el front recalculara en cada render, el mapa cambiaría solo al cargar un dictamen. Persistirla lo vuelve imposible por diseño, no por cuidado del programador.

También queda registrado `proveedor_ruteo`: si mañana una ruta se ve rara, se sabe con qué se calculó.

---

## 6. Los dos adaptadores de ruteo

> RF-32 · Decisión D-08

| Adaptador | Estado | Para qué |
| --- | --- | --- |
| `OsrmAdapter` | **Activo** | La demo. Servicio público, sin credenciales, sin costo |
| `GoogleRoutesAdapter` | **Escrito y seleccionable, sin conectar** | Es lo que la Municipalidad contrataría |

Cambiar de uno a otro es **cambiar un parámetro en el panel de administración**, sin desplegar. Eso **es** RF-32, y es demostrable en vivo frente al profesor: se cambia el valor, se arma otra ruta y se muestra que el campo `proveedorRuteo` de la respuesta cambió.

`GoogleRoutesAdapter` queda **sin credenciales a propósito**: una clave de Google con facturación asociada no va a un repositorio académico bajo ninguna circunstancia (T10).

### Cuando el proveedor no responde

| Situación | Respuesta |
| --- | --- |
| Tiempo de espera agotado | `PROVEEDOR_NO_DISPONIBLE` (503), reintentable |
| Error del proveedor | Igual, con el detalle registrado |
| Ruta ya confirmada | **No se ve afectada**: la geometría está persistida |

Una jornada ya confirmada sigue funcionando aunque OSRM se caiga, porque todo lo necesario se descargó al confirmar (T8). Eso es deliberado: el ingeniero en la calle no puede depender de un servicio externo.

---

## 7. Ruta de tormenta

> RF-28, RF-29, RF-30

| Diferencia | Detalle |
| --- | --- |
| Sin balanceador | Todos los casos tienen la misma urgencia entre sí (RF-29) |
| Sin cupos por prioridad | No se aplica la escala de colores |
| Criterio | **Mínima distancia y tiempo total** |
| Alcance | Casos etiquetados de los últimos tres días, configurable |
| Visibilidad | La sección **solo aparece si hay casos** |

El algoritmo de orden es el mismo (§4); lo que cambia es que la selección no pasa por el balanceador: entran **todos** los casos de la ventana que quepan en la jornada, empezando por los más cercanos entre sí.

**La etiqueta todavía no existe en el SUA**: la tiene que agregar el CIL (A-03, DV-09). Mientras tanto la marcan el Administrador y el Jefe, o el ingeniero al dar de alta un caso en campo durante el temporal. Si el módulo dependiera solo del CIL, quedaría inutilizable justo el peor día del año.

---

## 8. Modos de traslado

| Modo | Perfil OSRM | Cuándo |
| --- | --- | --- |
| `auto` | `driving` | Por defecto, distritos extensos |
| `pie` | `foot` | Zona céntrica de alta concentración de casos |
| `bicicleta` | `cycling` | Distancias medias |

El modo cambia la matriz de tiempos, así que **cambia el cupo de la jornada**: seis horas a pie rinden menos casos que seis horas en auto, y el sistema lo refleja en vez de prometer lo mismo.

Una directiva de jornada puede **forzar** el modo (T3 §11): *"esta semana el equipo del centro sale a pie"*.

---

## 9. Qué se verifica en el driver

| Escenario | Qué demuestra |
| --- | --- |
| `ruta-optima` | La ruta parte de Moreno 2350 y **vuelve** ahí (RF-22) |
| `ruta-cupo-horas` | El cupo respeta las horas y los diez minutos por dictamen (RF-21) |
| `balanceador-sin-stock` | La redistribución de RF-25 se aplica **y se informa** |
| `directiva-obligatoria` | Una jornada que excede una directiva obligatoria se rechaza |
| `geo-precision` | Un reclamo `fallida` queda fuera de la ruta y dentro del listado |
| `geo-correccion` | Un punto corregido no lo pisa una geocodificación posterior |
| `cambio-de-proveedor` | Se cambia el adaptador por parámetro y la ruta se calcula con el otro. **Eso es RF-32** |
| `ruta-persistida` | La geometría guardada no cambia al volver a consultar la ruta |
| `tormenta-sin-balanceador` | En tormenta no se aplican cupos por prioridad (RF-29) |
