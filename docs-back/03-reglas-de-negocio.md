# Reglas de negocio

> Última actualización: 18/08/2026 · Estado: **en diseño** — la matriz de §1 necesita validación funcional
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

**Solo firma quien tiene matrícula registrada.** Se valida contra el perfil, no contra lo que el cliente diga.

Al firmar, en un solo paso indivisible:

1. Se calcula el **hash** del contenido del dictamen.
2. Se registra el **sello de tiempo** del servidor.
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

### Por qué el Administrador y no solo el jefe

RF-24 le da los perfiles al jefe/coordinador. Las directivas las administra el rol Administrador porque son configuración del sistema con alcance sobre otros usuarios, igual que los parámetros de negocio y los adaptadores. En la práctica el jefe pide la directiva y el Administrador la carga, que es el mismo circuito que ya existe para cualquier cambio de criterio operativo.

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

---

## 11. Roles: qué puede hacer cada uno

| | Lector | Operario | Operario con matrícula | Administrador |
| --- | --- | --- | --- | --- |
| Dashboard y métricas | Sí | Sí | Sí | Sí |
| Ver reclamos pendientes | — | Sí | Sí | Sí |
| Tomar trabajo y planificar rutas | — | Sí | Sí | Sí |
| Cargar dictamen | — | Sí | Sí | — |
| **Firmar dictamen** | — | **No** | **Sí** | — |
| Dar de alta reclamos | — | Sí | Sí | Sí |
| Gestionar usuarios y roles | — | — | — | Sí |
| Configurar parámetros y adaptadores | — | — | — | Sí |
| **Generar el entregable para concesionarias** | — | — | — | **Sí** |

**Lector** es un rol de consulta ejecutiva: dirección o jefatura mirando "cómo venimos", y puestos periféricos que necesitan conocer el estado sin operar.

**Las empresas concesionarias no son usuarias del sistema.** No tienen rol ni acceso. Reciben un **entregable exportable que solo el Administrador genera**, con los dictámenes firmados y vigentes que les corresponde ejecutar. Es la decisión correcta en privacidad: son terceros externos a la repartición y no deben ver el circuito interno completo ni los datos de los vecinos que no les incumben.

---

## 12. Pendiente de validación funcional

1. **Las señales de riesgo de §1** son una propuesta redactada desde el relevamiento. Conviene contrastarlas con cómo escriben realmente los vecinos en el SUA.
2. **Las categorías de reclamo de §2** también son propuestas. Falta saber si el SUA trae un motivo categorizado o solo texto libre; si es lo segundo, la categoría se deduce con las mismas señales de §1.
3. **Qué campos lleva el entregable para concesionarias** y en qué formato.
