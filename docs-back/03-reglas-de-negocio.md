# Reglas de negocio

> Última actualización: 19/08/2026 · Estado: **en diseño** — la matriz de §1 necesita validación funcional
> Incorpora las respuestas de relevamiento del 18/08 (grupos A y B de `entregables/preguntas-abiertas.html`).
> Todas las reglas viven en el núcleo, son funciones puras y tienen escenario propio en el driver.

---

## 1. Prioridad inicial de un reclamo

El problema real, según el relevamiento: hoy cada persona que recibe un reclamo le pone la prioridad según su propio criterio. La mejora no es "que el sistema adivine mejor", sino **que el criterio sea el mismo siempre y esté escrito**.

### Principio: no inventar precisión que no existe

Cuando entra un reclamo, **nadie miró el árbol todavía**. El único que lo va a evaluar de verdad es el ingeniero, y recién cuando llegue. Por eso la regla base es conservadora y las excepciones tienen que justificarse solas.

### Las cuatro reglas, en orden de aplicación

**Regla 0 — Verde por defecto.** Todo reclamo arranca en baja prioridad. Es lo honesto: no hay evaluación técnica.

**Regla 1 — Salto por señales de riesgo en el texto.** Si la descripción del vecino contiene señales claras, salta directo al color correspondiente.

| Salta a | Señales en el texto |
| --- | --- |
| **Rojo** | rama colgando, por caerse, se está cayendo, árbol caído, inclinado, partido, rajado, se desprendió |
| **Naranja** | cables, cableado, media tensión, luminaria, levanta la vereda, rompió la vereda, raíces, toca el techo, balcón |
| **Amarillo** | ramas bajas, no se puede pasar, obstruye, tapa el semáforo, tapa la luz |

> **Esta regla es opcional y se puede desactivar.** Es un parámetro del sistema, no una constante del código. Fundamento: el relevamiento dice que la calidad del dato de entrada es muy despareja, y una regla que lee texto libre se puede equivocar. Si el área decide que genera más ruido que valor, se apaga sin tocar código y el sistema sigue funcionando con las otras tres reglas.
>
> Cuando la regla actúa, **queda registrado en el historial qué señal la disparó**. Nunca hay un color inexplicable.

**Regla 2 — Insistencia del vecino.** Si sobre el mismo ejemplar entra más de un reclamo, la prioridad sube.

| Reclamos sobre el mismo ejemplar | Efecto |
| --- | --- |
| 1 | Sin efecto |
| 2 | Sube un nivel |
| 3 o más | Sube un nivel adicional |

La insistencia es una señal legítima y **no depende de cómo escribió el vecino**: tres personas reclamando el mismo árbol es información objetiva. Es la regla más confiable de las tres.

"Mismo ejemplar" se resuelve por calle y altura coincidentes, y si el reclamo trae coordenadas, por cercanía menor a 15 metros. Se documenta el criterio porque un árbol de vereda puede recibir reclamos con la altura catastral corrida en un número.

**Regla 3 — Tormenta.** Un reclamo con etiqueta de tormenta **queda fuera de la escala de colores**: todos los casos de tormenta tienen la misma urgencia entre sí (RF-29) y se atienden en su propio circuito.

### Prioridad final

Se aplican las tres reglas y **gana la más alta**. Nunca baja: si el texto dice rojo y la insistencia dice amarillo, queda rojo.

---

## 2. Escalamiento por tiempo (RF-11)

Un reclamo que no se dictamina sube de color solo. Es lo que evita que casos viejos queden olvidados detrás de los nuevos.

```
verde ──► amarillo ──► naranja ──► rojo ──► (se mantiene)
```

### El ritmo depende del tipo de reclamo

La minuta propone 2 meses parejos para todos. El diseño lo afina: **un caso de interferencia con cableado no puede esperar lo mismo que una poda estética.**

> **La categoría se deduce del texto.** El SUA no trae un motivo elegido de una lista: el reclamo llega con lo que escribió quien lo tomó, y nada más (B-03). La categoría la infiere el sistema con las mismas señales de §1, queda marcada como `inferida`, y **el ingeniero puede corregirla**. Corregida, se marca como tal y el escalamiento pasa a usar el ritmo de la categoría buena.
>
> **Es un autocompletado, nunca una imposición** (D-52). Igual que el de especie: propone, no obliga, y tiene su toggle en configuración. Si el área concluye que la inferencia acierta poco, se apaga y los reclamos quedan sin categoría hasta que alguien se las ponga — que es honesto, y mejor que arrastrar una categoría mal puesta que además fija el ritmo de escalamiento.
>
> Es la diferencia entre un sistema que se equivoca en silencio y uno que muestra de dónde sacó cada dato. Y la corrección tiene un beneficio lateral: cada categoría corregida es evidencia de qué señales fallan, que es exactamente lo que hace falta para afinar la tabla de reglas.

| Categoría del reclamo | Escala cada | Fundamento |
| --- | --- | --- |
| Riesgo estructural (inclinado, rama colgando) | 30 días | Riesgo directo a personas |
| Interferencia con cableado o media tensión | 30 días | Riesgo eléctrico y corte de servicio |
| Infraestructura (vereda, raíces, cañerías) | 60 días | Daño patrimonial progresivo |
| Molestia u obstrucción | 60 días | Valor por defecto de la minuta |
| Poda de mantenimiento o estética | 90 días | Sin riesgo asociado |

Todos los ritmos son parámetros configurables (RNF-09). El valor por defecto de 60 días mantiene el compromiso original de la minuta para las categorías donde no se justifica otra cosa.

### Cómo se ejecuta

Una función pura decide qué color corresponde según fecha de ingreso, categoría y prioridad actual. Un **job diario** la aplica y escribe **una fila de historial por cada salto**, con el motivo.

Que sea un job y no un cálculo al leer tiene un fundamento: el escalamiento debe ocurrir aunque nadie abra la página. Un reclamo que nadie mira durante seis meses es justamente el que más necesita escalar.

Que la función sea pura tiene otro: el driver puede adelantar el reloj catorce meses y verificar la secuencia completa de saltos sin esperar catorce meses.

---

## 3. Intervenciones mutuamente excluyentes (RF-14)

El dictamen técnico prevalece sobre cualquier otra carga. El relevamiento detectó reclamos con extracción **y** poda cargadas a la vez, que es contradictorio y rompe la planificación operativa.

| Si el dictamen determina | Quedan bloqueadas |
| --- | --- |
| Extracción | Poda y corte de raíces |
| Poda (aérea) | Extracción |
| Corte de raíces (subterránea) | Extracción |
| Sin trabajo | Todas las demás |

También se bloquean las contradicciones dentro de un mismo campo: no se puede marcar un caso como urgente y a largo plazo simultáneamente (RF-15).

**El front valida por comodidad; el backend valida por obligación.** El front deshabilita las casillas para que el ingeniero no se equivoque. El backend vuelve a validar porque no puede confiar en el cliente: un dictamen es un documento con validez legal, y su coherencia no puede depender de que el JavaScript del navegador se haya ejecutado.

---

## 4. Firma y cierre del dictamen (RF-18, RF-19)

**Firman los dos roles que van a la calle: Operario y Jefe.** Se valida contra el perfil del servidor, nunca contra lo que diga el cliente.

El Administrador **no firma**, y el motivo está en el propio documento: la sección 3 lo define como *personal del CIL, el Centro de Informática*. No es un ingeniero agrónomo. Un dictamen técnico autoriza intervenir un árbol bajo la Ordenanza 5.118 y la Ley 13.836; que lo pueda firmar alguien de sistemas sería un problema real, no una formalidad. Administra la firma, no la ejerce.

Cómo se llegó acá. RF-18 pide *matrícula profesional registrada*; en la repartición nadie pudo precisar qué forma tiene esa matrícula ni quién la valida, y propusieron reemplazarla por el título presentado en RRHH (A-07). La definición funcional final es más simple: **la constancia la da el alta del usuario**. Si una persona está dada de alta como Operario en el sistema municipal, es porque el área ya verificó que puede hacer ese trabajo; pedirle al sistema que vuelva a certificar lo mismo con un campo aparte duplica un control que ya existe fuera.

> **Esto contradice RF-02 y RF-18 como están escritos**, que distinguen al Operario del Operario matriculado. Es una decisión funcional tomada, no un olvido: está en `99-desvios.md` (DV-10) con lo que hay que corregir del documento antes de la entrega.

**Lo que sí se configura en un solo lugar es cómo firma el sistema**, no quién. El apartado de firma digital (`config_firma`) concentra los roles habilitados, la certificadora, el algoritmo del hash, la leyenda legal del pie y qué datos se sellan. El día que la firma tenga que certificarse de verdad, se toca ese apartado y **sale andando**: la lógica de firmado no está desparramada por el código. Cada dictamen guarda **bajo qué versión de esa configuración se firmó**, porque un dictamen de marzo se defiende con las reglas de marzo.

Al firmar, en un solo paso indivisible:

1. Se calcula el **hash** del contenido del dictamen.
2. Se registra el **sello de tiempo** del servidor, junto con el legajo y el rol del firmante y la versión vigente de la configuración de firma.
3. Se fija la **fecha de vencimiento** a 18 meses de la fecha de emisión.
4. El dictamen pasa a **solo lectura**: no se actualiza ni se borra, y lo impide la base, no una convención.
5. El reclamo pasa a **dictaminado** a través de `IReclamoProvider` (RF-20).
6. Se **libera la reserva**, con motivo `dictaminado`.
7. Se registra en **auditoría**.

Si cualquiera de los pasos falla, no queda nada a medias: o el dictamen existe entero y firmado, o no existe.

**Corregir un dictamen firmado no es editarlo**: es anularlo y emitir uno nuevo. Ambos quedan en el historial. Es lo que exige RNF-06 y lo que hace defendible el documento ante una impugnación.

---

## 5. Vencimiento a los 18 meses

| Momento | Qué pasa |
| --- | --- |
| Faltan 30 días o menos | El dashboard lo cuenta en la alerta de próximos a vencer (RF-05) |
| Se cumplen 18 meses | El dictamen pasa a `vencido` y el reclamo **vuelve a la cola** como `vencido_redictaminar` |
| Después | El dictamen viejo queda consultable como historial, nunca se borra |

Fundamento forestal: en 18 meses el ejemplar creció, se pudo secar o alguien pudo intervenirlo. La evaluación anterior ya no autoriza legalmente una intervención, así que hay que volver a mirarlo.

> Ningún RF del documento dice qué pasa al vencer — solo cómo calcularlo y cómo avisar. Está registrado como requerimiento faltante en `99-desvios.md` (DV-05).

---

## 6. Reserva de trabajo

| Regla | Detalle |
| --- | --- |
| Tomar trabajo requiere conexión | Es pedirle al sistema una asignación exclusiva |
| Un reclamo, una reserva activa | Lo garantiza la base con un índice único, no el código |
| No se dictamina sin reserva propia | La reserva es requisito previo, no una comodidad |
| Visible para todo el equipo | Se ve quién lo tiene y desde cuándo; no desaparece del listado |
| Vence al cierre de la jornada | Configurable |
| Al vencer, vuelve a la cola | Lo que no se visitó queda libre para quien esté más cerca mañana |

Excepción: el ingeniero puede dar de alta y dictaminar un reclamo **de oficio** sin conexión, porque un reclamo nuevo no puede estar tomado por nadie.

---

## 7. Balanceador de carga (RF-23, RF-24, RF-25)

Tres modos:

| Modo | Comportamiento |
| --- | --- |
| Urgentes primero | Llena la jornada empezando por rojo y bajando hasta completar |
| Por porcentaje | Los porcentajes que fija el jefe con los deslizables |
| Automático equilibrado | Reparto parejo entre las cuatro prioridades |

**Redistribución obligatoria (RF-25).** Si se pide 25% de urgentes y solo hay dos casos rojos disponibles en la zona, el cupo sobrante **se completa con otras prioridades**. Nunca se devuelve una jornada a medio llenar: el tiempo del ingeniero en la calle no se desperdicia porque falte stock de un color.

**Perfiles reutilizables (RF-24).** El jefe guarda una distribución con nombre y la reaplica en dos clics. Incluye poder asignar el 100% a una sola prioridad.

---

## 7 bis. Bajadas de línea: directivas de jornada

El relevamiento describe la "bajada de línea" como una directiva superior puntual, y RF-24 la reduce a porcentajes por prioridad. En la práctica una directiva es más amplia que eso: *"esta semana, todo el equipo a Distrito Oeste, solo casos de cableado, veinte por jornada"*.

Por eso se diseña la **directiva de jornada** como una entidad propia, que el Administrador arma, guarda como preset y baja al equipo.

### Qué puede restringir una directiva

| Dimensión | Ejemplo |
| --- | --- |
| **Zona** | Solo Distrito Oeste; o un barrio puntual |
| **Categoría** | Solo interferencia con cableado; solo riesgo estructural |
| **Prioridad** | 100% urgentes; o la mezcla porcentual que se quiera |
| **Protocolo** | Jornada normal, o exclusivamente tormenta |
| **Volumen** | Cantidad de casos, u horas de jornada |
| **Modo de traslado** | Forzar a pie en zona céntrica de alta concentración |
| **Antigüedad** | Solo reclamos con más de X meses sin dictaminar |

### A quién alcanza

| Ámbito | Uso típico |
| --- | --- |
| Global | Toda la Dirección Técnica, para una campaña o una emergencia |
| Por distrito | El equipo que trabaja esa zona |
| Por usuario | Un ingeniero puntual, o el que atiende casos complejos |

### Obligatoria o sugerida

Cada directiva se marca de una de las dos formas:

- **Sugerida**: precarga el planificador con esos valores; el ingeniero puede cambiarlos. Sirve para orientar sin trabar.
- **Obligatoria**: el ingeniero no puede salirse del alcance. Sirve para directivas de emergencia, donde el criterio individual no debe primar.

En ambos casos, la ruta generada **registra bajo qué directiva se armó**. Si el jefe pregunta por qué se dictaminaron esos casos y no otros, la respuesta está en el dato, no en la memoria de nadie.

### Vigencia y convivencia

Una directiva tiene fecha de inicio y de fin, así que caduca sola: nadie tiene que acordarse de apagarla el lunes. Si hay varias vigentes que alcanzan al mismo ingeniero, **gana la de ámbito más específico** (usuario sobre distrito, distrito sobre global), y si empatan, la más reciente. La que se aplicó queda registrada en la ruta.

### Quién baja la directiva

**El Jefe**, que es quien dirige el trabajo, y también el Administrador. RF-24 le da los perfiles de distribución al jefe/coordinador, y ahora que la jefatura está confirmada como real (A-09) el permiso queda donde corresponde: quien decide el criterio operativo lo carga él mismo, sin depender de un tercero.

El Administrador lo conserva porque es configuración con alcance sobre otros usuarios, y porque alguien tiene que poder corregir una directiva mal cargada cuando el jefe está en la calle. Lo que **no** hereda el Jefe es la gestión de usuarios, los parámetros del sistema, los adaptadores ni el entregable para concesionarias: dirigir el trabajo no es administrar el sistema.

> Esto extiende RF-24 más allá de lo que dice el documento. Queda registrado en `99-desvios.md` (DV-07).

---

## 8. Planificación de la ruta (RF-21, RF-22, RF-26)

| Parámetro | Valor |
| --- | --- |
| Tiempo por dictamen | 10 minutos, configurable (RF-21) |
| Punto de partida y de regreso | Parques y Paseos, siempre (RF-22) |
| Modos de traslado | Auto, a pie, bicicleta |
| Zona | Distrito, con barrio opcional para afinar |
| Criterio de jornada | Por horas disponibles o por cantidad de casos |

El resultado incluye orden de visita, horario estimado de llegada a cada caso, desglose entre tiempo de traslado y de dictaminación, porcentaje de eficiencia y la geometría del recorrido.

**La ruta calculada se guarda y no se recalcula.** Pedido explícito de la minuta: *"el mapa va a tener que quedar igual hasta que se oprima un botón de restablecer, porque ese mapa es el que tienen que seguir todo el día"*. Persistir la geometría lo vuelve imposible por diseño, no por cuidado del programador.

---

## 8 bis. La pre-confirmación de la jornada

Entre pedir trabajo y salir a la calle hay un momento, y es el único con señal garantizada. El diseño lo convierte en un paso propio.

| Paso | Qué pasa |
| --- | --- |
| 1. El ingeniero define la jornada | Cuántas horas o cuántos casos, en qué zona, con qué modo de traslado |
| 2. **El sistema reserva** | Los reclamos quedan tomados a su nombre **antes** de que empiece a configurar |
| 3. Pantalla de pre-confirmación | Ve los casos ya reservados y puede ajustar sin apuro |
| 4. Confirma | Se arma la ruta definitiva y se precarga todo para trabajar sin señal |

**La reserva ocurre en el paso 2, no en el 4.** Es el punto entero: el ingeniero puede tomarse el tiempo que necesite para revisar la jornada sabiendo que nadie le va a sacar un caso mientras decide. Si la reserva esperara a la confirmación, cada minuto que se toma para revisar sería un minuto de riesgo de perder el trabajo, y el diseño lo empujaría a apurarse justo donde conviene que mire con calma.

### Qué se ajusta en esa pantalla

| Ajuste | Por qué acá |
| --- | --- |
| **Corregir puntos del mapa** que cayeron mal | Es el momento con señal y con el mapa a la vista. En la calle, con una barra y el sol de frente, no se corrige nada |
| Sacar un caso de la jornada | Lo libera y vuelve a la cola para otro |
| Corregir la categoría inferida | Antes de que la ruta se arme con una prioridad equivocada |
| Reordenar o forzar una parada | El orden óptimo es una sugerencia, no una orden |

Los reclamos con geocodificación `fallida` o `solo_calle` aparecen **destacados** en esta pantalla: son los que más se benefician de un minuto de atención antes de salir, y los que más tiempo hacen perder si se descubren recién en la calle.

Una vez confirmada la jornada, el mapa **no se reinicia**: es el pedido explícito de la minuta, y solo se limpia con el botón de restablecer.

---

## 9. Protocolo de tormenta (RF-28, RF-29, RF-30)

| Regla | Detalle |
| --- | --- |
| Visibilidad | La sección aparece **solo si hay casos** etiquetados |
| Ventana | Últimos 3 días, configurable |
| Prioridad | Todos iguales entre sí; no se aplica la escala de colores ni el balanceador |
| Ruta | Se optimiza por mínima distancia y tiempo total, sin cupos por prioridad |
| Alta en campo | El ingeniero puede registrar casos nuevos con etiqueta de tormenta |

---

## 10. Época recomendada de intervención (RF-16)

El sistema **sugiere** la época conveniente según especie y estación, y la deja disponible como criterio al armar rutas (RF-25).

Es una sugerencia, no un bloqueo: la decisión técnica es del ingeniero, y un riesgo inminente se atiende en cualquier época del año. El sistema aporta el criterio; no lo impone.

### La especie se escribe a mano

No hay lista oficial de especies: el ingeniero agrónomo escribe la especie, y conoce el nombre científico (A-06). El campo queda como texto libre —así está hoy en el prototipo y así se queda—, pero con dos agregados que salvan RF-16:

- **Autocompletado sobre un catálogo interno** de las especies frecuentes del arbolado de Rosario, con nombre común, nombre científico y sinonimias ("tipa", "tipa blanca", *Tipuana tipu*). Sugiere mientras escribe; **no obliga a elegir**.
- **Normalización al guardar**: si lo escrito coincide con una entrada del catálogo, se guarda además la especie normalizada, y **con eso** se calcula la época recomendada.

Si no coincide con nada, el dictamen se guarda igual con lo que el ingeniero escribió y **el sistema no sugiere época**, en lugar de inventar una. Es preferible una sugerencia ausente a una sugerencia falsa en un documento con validez legal.

---

## 10 bis. Complejidad sugerida (RF-15)

La complejidad no es criterio libre: en la repartición se decide **por el diámetro del tronco y la altura del ejemplar** (A-10). Eso la vuelve calculable, y RF-15 pasa de casilla a dato asistido.

| Cómo funciona | Detalle |
| --- | --- |
| Entrada | Diámetro y altura, ya cargados en el dictamen |
| Cálculo | Tabla `regla_complejidad`, con los cortes en la base y no en el código |
| Quién carga los cortes | **El Administrador, desde el panel** (D-49). No vienen fijos de fábrica |
| Salida | Un valor **sugerido**, que el ingeniero confirma o cambia |
| Registro | Se guardan la sugerida y la elegida, para saber cuánto se aparta el criterio real de la tabla |

**El ingeniero mide perímetro, la regla habla de diámetro.** El formulario físico —y el prototipo— piden perímetro de tronco, porque en la calle se mide con cinta métrica alrededor. La regla se expresa en diámetro. El sistema convierte (diámetro = perímetro ÷ π) y muestra los dos valores, para que nadie tenga que hacer la cuenta parado frente al árbol ni cargar un dato que no midió.

> **Los cortes los pone el Administrador, no nosotros.** La tabla arranca vacía y la sugerencia aparece recién cuando hay cortes cargados; hasta entonces el campo funciona como hoy, a criterio del ingeniero. Poner umbrales por defecto sería peor que no tenerlos: un número inventado por el equipo de desarrollo se ve exactamente igual que uno acordado con la repartición, y el ingeniero no tiene cómo distinguirlos.

---

## 11. Roles: qué puede hacer cada uno

| | Lector | Operario | Jefe | Administrador |
| --- | --- | --- | --- | --- |
| Dashboard y métricas | Sí | Sí | Sí | Sí |
| Ver reclamos pendientes | — | Sí | Sí | Sí |
| Tomar trabajo y planificar rutas | — | Sí | Sí | — |
| Cargar dictamen | — | Sí | Sí | — |
| **Firmar dictamen** | — | **Sí** | **Sí** | **—** |
| Dar de alta reclamos | — | Sí | Sí | Sí |
| Ver el trabajo de todo el equipo | — | — | **Sí** | Sí |
| **Bajar directivas de jornada** | — | — | **Sí** | Sí |
| Gestionar usuarios y roles | — | — | — | Sí |
| **Configurar la firma digital** | — | — | — | **Sí** |
| Configurar parámetros y adaptadores | — | — | — | Sí |
| **Generar el entregable para concesionarias** | — | — | — | **Sí** |

> Antes había una columna más: el **Operario con matrícula**, que dejó de existir como categoría (D-50). La distinción que el documento hacía dentro del Operario se disolvió, y la que quedó en pie es otra: **quién va a la calle y quién administra el sistema**.

**Lector** es un rol de consulta ejecutiva: dirección mirando "cómo venimos", y puestos periféricos que necesitan conocer el estado sin operar.

**Administrador** es personal del CIL: configura el sistema, incluida la firma digital, pero **no dictamina ni firma**. Administrar la herramienta con la que se firma y firmar son dos cosas distintas, y el documento ya lo tenía claro al ubicarlo en el Centro de Informática.

**Jefe** es un ingeniero más: dictamina y firma como cualquier otro. Lo que agrega es dirigir el trabajo del equipo —ver cómo viene el reparto del día y bajar las directivas de jornada— sin necesidad de ser administrador del sistema.

> El rol existe porque la jefatura **existe hoy en la Dirección Técnica**: hay un ingeniero en jefe que suele quedarse atendiendo al público más difícil, y la intención de la repartición es que también dictamine en la calle (A-09). Hasta esta respuesta el diseño lo daba por inexistente y le cargaba las directivas al Administrador. Que exista resuelve además una incoherencia del documento: HU-12 y HU-13 le hablan a un "jefe" que el modelo de roles de la sección 3 no tenía. Queda registrado en `99-desvios.md` (DV-11).

**Las empresas concesionarias no son usuarias del sistema.** No tienen rol ni acceso. Reciben un **entregable exportable que solo el Administrador genera**, con los dictámenes firmados y vigentes que les corresponde ejecutar. Es la decisión correcta en privacidad: son terceros externos a la repartición y no deben ver el circuito interno completo ni los datos de los vecinos que no les incumben.

---

## 12. Pendiente de validación funcional

1. **Las señales de riesgo de §1** son una propuesta redactada desde el relevamiento. Siguen sin contrastarse con reclamos reales (A-12), y ahora pesan el doble: con el motivo en texto libre confirmado (B-03), de esas mismas señales sale también la categoría que fija el ritmo de escalamiento. Por eso la regla es desactivable y la categoría, corregible.
2. **Los cortes de diámetro y altura** que determinan la complejidad (§10 bis). Los carga el Administrador cuando la repartición los defina; el sistema ya está listo para recibirlos.
3. **Qué campos lleva el entregable para concesionarias** y en qué formato (C-01).
