# T3 — Núcleo de dominio y funciones puras

> Diseño técnico · Última actualización: 19/08/2026 · Estado: **sin aprobar**
> Responde: qué entidades existen y cómo se calcula cada regla de negocio, con firma exacta y tabla de decisión.

---

## 1. Qué hace especial a esta capa

Todo lo de este documento son **funciones puras**: reciben datos, devuelven datos, no tocan la base, no piden la hora al sistema, no llaman a nadie por red. Se pueden ejecutar mil veces con la misma entrada y dan lo mismo.

Eso tiene tres consecuencias prácticas:

1. **Se prueban sin infraestructura.** El escalamiento de catorce meses se verifica en milisegundos pasándole una fecha, en vez de esperando catorce meses o preparando una base.
2. **Se pueden explicar.** Cada regla es una tabla de decisión que se puede leer en voz alta en una defensa oral.
3. **No se rompen al cambiar de proveedor.** Son el activo que sobrevive el día que Supabase se va.

La regla de oro: **si una función necesita saber la hora, se la pasan por parámetro.** El reloj es un puerto (`IRelojProvider`, T2) justamente para que las reglas no tengan que llamarlo.

---

## 2. Entidades del dominio

```ts
// core/dominio/reclamo.ts
export type ReclamoOrigen = {          // lo que da el sistema de origen (SUA)
  clave: ClaveReclamo;
  fechaIngreso: Date;
  origenIngreso: 'munibot' | 'presencial' | 'distrito' | 'de_oficio';
  direccionExacta: string;             // la del EJEMPLAR, no la del vecino
  calle: string; altura: number | null;
  entreCalle1?: string; entreCalle2?: string;
  distrito: Distrito; barrio?: string;
  descripcionMotivo: string;           // TEXTO LIBRE, sin categorizar
  fotoUrl?: string;                    // puede venir vacío
  estadoSua: 'ingresado'|'derivado'|'dictaminado'|'en_ejecucion'|'cerrado';
  areaAsignada: string; fechaDerivacion: Date;
};

export type EstadoReclamo = {          // lo que sabe el módulo, y el SUA no
  clave: ClaveReclamo;
  prioridadBase: Prioridad; prioridadVigente: Prioridad;
  fechaUltimoEscalamiento: Date | null;
  estadoModulo: EstadoModulo;
  etiquetaTormenta: boolean; fechaTormenta: Date | null;
  origenAlta: 'sua' | 'oficio' | 'vecino' | 'tormenta';
  categoria: Categoria; categoriaOrigen: 'inferida' | 'corregida';
  categoriaCorregidaPor: string | null;
  senalRiesgoDetectada: string | null;
  cantidadReclamosEjemplar: number; idEjemplarAgrupado: string;
};
```

**La prioridad vive del lado del módulo, no del SUA.** El SUA real no tiene matriz de priorización por colores: es una de las mejoras *propuestas* en el relevamiento, no una capacidad existente. Si la guardáramos del lado del origen simulado, el prototipo estaría simulando una funcionalidad que el sistema real no tiene, y el diseño se caería el día de la conexión (DV-03).

La misma lógica aplica a las coordenadas (DV-12) y a la categoría (B-03): son datos **derivados**, y viven donde se derivan.

---

## 3. Prioridad inicial

> Implementa RF-11 y la matriz de priorización del relevamiento · Decisiones D-20, D-21, D-23

### El principio: no inventar precisión que no existe

Cuando entra un reclamo **nadie miró el árbol todavía**. El único que lo va a evaluar de verdad es el ingeniero, y recién cuando llegue. Por eso la regla base es conservadora y las excepciones tienen que justificarse solas.

La mejora que pide el relevamiento no es "que el sistema adivine mejor": es **que el criterio sea el mismo siempre y esté escrito**. Hoy cada persona que recibe un reclamo le pone la prioridad según su propio criterio.

```ts
export function calcularPrioridadInicial(
  texto: string,
  reclamosDelMismoEjemplar: number,
  esTormenta: boolean,
  reglas: ReglaPrioridad[],
): { prioridad: Prioridad; senal: string | null; categoria: Categoria } 
```

### Regla 0 — Verde por defecto

Todo reclamo arranca en baja prioridad. Es lo honesto: no hay evaluación técnica.

### Regla 1 — Salto por señales de riesgo en el texto

| Salta a | Señales en el texto del vecino |
| --- | --- |
| **Rojo** | rama colgando, por caerse, se está cayendo, árbol caído, inclinado, partido, rajado, se desprendió |
| **Naranja** | cables, cableado, media tensión, luminaria, levanta la vereda, rompió la vereda, raíces, toca el techo, balcón |
| **Amarillo** | ramas bajas, no se puede pasar, obstruye, tapa el semáforo, tapa la luz |

**Esta regla es desactivable, y la tabla vive en la base** (`arbolado.regla_prioridad`), no en el código. Fundamento: el relevamiento dice que la calidad del dato de entrada es muy despareja, y una regla que interpreta texto libre se puede equivocar. Si el área concluye que genera más ruido que valor, se apaga sin desplegar y el sistema sigue funcionando con las otras reglas.

Cuando la regla actúa, **queda registrado qué frase la disparó** en `senal_riesgo_detectada`. Nunca hay un color inexplicable: en la defensa se puede abrir cualquier reclamo rojo y mostrar por qué está rojo.

**Normalización del texto antes de comparar**: minúsculas, sin tildes, espacios colapsados. `"Está INCLINADO"` y `"esta inclinado"` tienen que disparar lo mismo. El vecino no escribe pensando en nuestro parser.

### Regla 2 — Insistencia del vecino

| Reclamos sobre el mismo ejemplar | Efecto |
| --- | --- |
| 1 | Sin efecto |
| 2 | Sube un nivel |
| 3 o más | Sube un nivel adicional |

Es **la regla más confiable de las tres** y no depende de cómo escribió el vecino: tres personas reclamando el mismo árbol es información objetiva.

### Regla 3 — Tormenta

Un reclamo con etiqueta de tormenta **queda fuera de la escala de colores**: todos los casos de tormenta tienen la misma urgencia entre sí (RF-29) y se atienden en su propio circuito.

### Prioridad final

Se aplican las tres y **gana la más alta. Nunca baja.** Si el texto dice rojo y la insistencia dice amarillo, queda rojo.

---

## 4. Agrupación por ejemplar

```ts
export function idEjemplar(r: ReclamoOrigen): string    // clave de agrupación
export function mismoEjemplar(a: Ubicacion, b: Ubicacion): boolean
```

La insistencia solo se puede medir si el sistema sabe que tres reclamos hablan del mismo árbol.

| Criterio | Cuándo se usa |
| --- | --- |
| **Calle y altura normalizadas** | Siempre. Es el único dato que da el origen |
| Cercanía menor a 15 metros | Solo si **ambos** puntos son de precisión `exacta` o corregidos por un usuario |

Se documenta el criterio porque un mismo árbol de vereda puede recibir reclamos con la altura catastral corrida en un número, y **agrupar de más sería tan malo como no agrupar**: inflaría la insistencia y subiría prioridades sin fundamento.

Dos puntos aproximados a diez metros no prueban nada: la geocodificación interpola sobre la cuadra, así que dos direcciones distintas de la misma cuadra pueden caer pegadas sin ser el mismo árbol.

**Normalización de dirección** (compartida con la búsqueda por dirección y con la geocodificación):

1. Minúsculas, sin tildes.
2. Expansión de abreviaturas: `av.`→`avenida`, `bv.`→`boulevard`, `dr.`→`doctor`, `gral.`→`general`, `pje.`→`pasaje`.
3. Se quitan artículos y palabras de relleno.
4. La altura se lleva a entero.

---

## 5. Escalamiento por tiempo

> Implementa RF-11 · Decisiones D-11, D-22

Un reclamo que no se dictamina **sube de color solo**. Es lo que evita que casos viejos queden olvidados detrás de los nuevos, que es exactamente el rezago de más de tres años que describe el relevamiento.

```
verde ──► amarillo ──► naranja ──► rojo ──► (se mantiene)
```

```ts
export function escalarPorTiempo(
  estado: EstadoReclamo, hoy: Date, ritmos: Map<Categoria, number>,
): { prioridad: Prioridad; salto: boolean; diasTranscurridos: number }
```

### El ritmo depende de la categoría

La minuta propone dos meses parejos para todos. El diseño lo afina: **un caso de interferencia con cableado no puede esperar lo mismo que una poda estética.**

| Categoría | Escala cada | Fundamento |
| --- | --- | --- |
| Riesgo estructural (inclinado, rama colgando) | 30 días | Riesgo directo a personas |
| Interferencia con cableado o media tensión | 30 días | Riesgo eléctrico y corte de servicio |
| Infraestructura (vereda, raíces, cañerías) | 60 días | Daño patrimonial progresivo |
| Molestia u obstrucción | 60 días | Valor por defecto de la minuta |
| Poda de mantenimiento o estética | 90 días | Sin riesgo asociado |

Todos los ritmos son parámetros configurables. El valor por defecto de sesenta días mantiene el compromiso original de la minuta donde no se justifica otra cosa.

**La categoría se infiere del texto** (B-03) y **el ingeniero puede corregirla** (D-47). Corregida, el escalamiento pasa a usar el ritmo de la categoría buena. Cada corrección es además evidencia de qué señal falló, que es lo que hace falta para afinar la tabla.

### Por qué un job y no un cálculo al leer

El escalamiento **debe ocurrir aunque nadie abra la página**. Un reclamo que nadie mira durante seis meses es justamente el que más necesita escalar. Calcularlo al leer también complicaría filtrar y ordenar por prioridad cuando el volumen crece, y no dejaría rastro de cuándo escaló.

Un job diario aplica la función y escribe **una fila de historial por cada salto**, con el motivo (`alta`, `tiempo`, `manual`) y quién lo ejecutó. Eso es lo que permite contestar en la defensa *"¿por qué este reclamo está en rojo?"* con un dato y no con una explicación.

---

## 6. Intervenciones mutuamente excluyentes

> Implementa RF-14 y RF-15

El relevamiento detectó reclamos con extracción **y** poda cargadas a la vez, que es contradictorio y rompe la planificación operativa. El dictamen técnico prevalece sobre cualquier otra carga.

```ts
export function validarIntervencion(i: Intervencion): ResultadoValidacion
```

| Si el dictamen determina | Quedan bloqueadas |
| --- | --- |
| Extracción | Poda y corte de raíces |
| Poda (trabajo aéreo) | Extracción |
| Corte de raíces (trabajo subterráneo) | Extracción |
| Sin trabajo | Todas las demás |

También se bloquean las contradicciones dentro de un mismo campo: no se puede marcar un caso como **urgente y a largo plazo** simultáneamente (RF-15).

**El front valida por comodidad; el backend valida por obligación.** El front deshabilita las casillas para que el ingeniero no se equivoque. El backend vuelve a validar porque no puede confiar en el cliente: un dictamen es un documento con validez legal, y su coherencia no puede depender de que el JavaScript del navegador se haya ejecutado.

---

## 7. Complejidad sugerida

> Implementa RF-15 · Decisiones D-43, D-49 · Desvío DV-15

La complejidad no es criterio libre: en la repartición se decide **por el diámetro del tronco y la altura del ejemplar** (A-10). Eso la vuelve calculable, y RF-15 pasa de casilla a completar a ojo a dato asistido.

```ts
export function perimetroADiametro(perimetroCm: number): number {
  return perimetroCm / Math.PI;
}

export function sugerirComplejidad(
  diametroCm: number, alturaM: number, cortes: ReglaComplejidad[],
): Complejidad | null    // null si no hay cortes cargados
```

**El ingeniero mide perímetro, la regla habla de diámetro.** El formulario físico —y el prototipo— piden perímetro de tronco, porque en la calle se mide con cinta métrica alrededor. La regla se expresa en diámetro. El sistema convierte y **muestra los dos valores**, para que nadie tenga que hacer la cuenta parado frente al árbol ni cargar un dato que no midió.

**Los cortes los carga el Administrador desde el panel** (D-49). La tabla arranca vacía y la sugerencia aparece recién cuando hay números cargados; hasta entonces el campo funciona como hoy, a criterio del ingeniero.

No hay valores por defecto inventados, y es deliberado: **un umbral puesto por el equipo de desarrollo se vería exactamente igual que uno acordado con la repartición**, y el ingeniero no tendría cómo distinguirlos. Mostrar una automatización que no refleja el criterio profesional es peor que no tenerla.

La sugerencia **nunca reemplaza la decisión**: se guardan la sugerida y la elegida, para poder medir después cuánto se aparta el criterio real de la tabla.

---

## 8. Época recomendada de intervención

> Implementa RF-16 · Decisión D-39 · Desvío DV-14

```ts
export function normalizarEspecie(escrito: string, catalogo: Especie[]): Especie | null
export function sugerirEpoca(especie: Especie | null, fecha: Date): Epoca | null
```

**La especie se escribe a mano** porque no hay lista oficial y el ingeniero agrónomo conoce hasta el nombre científico (A-06). El campo queda como texto libre —así está hoy en el prototipo y así se queda— con dos agregados que salvan RF-16:

- **Autocompletado sobre un catálogo interno** de las especies frecuentes del arbolado de Rosario, con nombre común, nombre científico y sinonimias ("tipa", "tipa blanca", *Tipuana tipu*). Sugiere mientras escribe; **no obliga a elegir** (D-52).
- **Normalización al guardar**: si lo escrito coincide con una entrada del catálogo, se guarda además la especie normalizada, y con eso se calcula la época.

Si no coincide con nada, el dictamen se guarda igual con lo que el ingeniero escribió y **el sistema no sugiere época**, en lugar de inventar una. Es preferible una sugerencia ausente a una sugerencia falsa en un documento con validez legal.

Es una sugerencia, no un bloqueo: la decisión técnica es del ingeniero, y **un riesgo inminente se atiende en cualquier época del año**.

---

## 9. Vencimiento del dictamen

> Implementa RF-19 y RF-05 · Decisiones D-17, D-44 · Desvío DV-05

```ts
export function calcularVencimiento(fechaDictamen: Date, meses: number): Date
export function estadoVencimiento(d: Dictamen, hoy: Date, diasAviso: number)
  : 'vigente' | 'por_vencer' | 'vencido'
```

| Momento | Qué pasa |
| --- | --- |
| Faltan 30 días o menos | El dashboard lo cuenta en la alerta de próximos a vencer (RF-05) |
| Se cumplen 18 meses | El dictamen pasa a `vencido` y el reclamo **vuelve a la cola** como `vencido_redictaminar` |
| Después | El dictamen viejo queda consultable como historial, **nunca se borra** |

Fundamento forestal, confirmado por la repartición (A-11): en dieciocho meses el ejemplar creció, se pudo secar o alguien pudo intervenirlo. La evaluación anterior ya no autoriza legalmente una intervención, así que hay que volver a mirarlo.

**El vencimiento cuenta desde `fecha_dictamen`**, el reloj del dispositivo, que es la fecha legal de emisión frente al árbol — no desde `fecha_recepcion`, que es cuándo llegó al servidor.

Ningún RF del documento decía qué pasa al vencer, solo cómo calcularlo y cómo avisar. Es un requerimiento faltante, registrado en DV-05.

---

## 10. Balanceador de carga

> Implementa RF-23, RF-24, RF-25

```ts
export function balancear(
  disponibles: ReclamoParaRuta[], cupo: number,
  modo: ModoBalanceo, distribucion?: Record<Prioridad, number>,
): { seleccionados: ReclamoParaRuta[]; redistribuido: RedistribucionInfo[] }
```

| Modo | Comportamiento |
| --- | --- |
| `urgentes_primero` | Llena la jornada empezando por rojo y bajando hasta completar |
| `por_porcentaje` | Los porcentajes que fija el jefe con los deslizables |
| `automatico_equilibrado` | Reparto parejo entre las cuatro prioridades |

### Redistribución obligatoria (RF-25)

Si se pide 25% de urgentes y **solo hay dos casos rojos disponibles en la zona**, el cupo sobrante se completa con otras prioridades, de mayor a menor.

Nunca se devuelve una jornada a medio llenar: el tiempo del ingeniero en la calle no se desperdicia porque falte stock de un color. La redistribución **se informa** en la respuesta (`redistribuido`), así que el ingeniero ve que pidió 25% de rojos y recibió 10% porque no había más, en vez de descubrirlo contando casos en el mapa.

### Orden dentro de cada prioridad

A igual prioridad, primero **el más antiguo**. Es coherente con el problema que ataca el proyecto: el rezago.

---

## 11. Directivas de jornada

> Implementa y extiende RF-24 · Decisiones D-27, D-28, D-30 · Desvío DV-07

```ts
export function directivaAplicable(dirs: Directiva[], perfil: Perfil, hoy: Date): Directiva | null
export function aplicarDirectiva(filtro: FiltroReclamos, d: Directiva)
  : { filtro: FiltroReclamos; forzado: string[] }
```

RF-24 reduce la "bajada de línea" a porcentajes por prioridad. En la práctica una directiva es más amplia: *"esta semana, todo el equipo a Distrito Oeste, solo casos de cableado, veinte por jornada"*. Con solo porcentajes, la mitad de esa directiva termina comunicándose de palabra, que es exactamente el problema de discrecionalidad que el proyecto quiere resolver.

| Dimensión que restringe | Ejemplo |
| --- | --- |
| Zona | Solo Distrito Oeste; o un barrio puntual |
| Categoría | Solo interferencia con cableado |
| Prioridad | 100% urgentes, o la mezcla porcentual que se quiera |
| Protocolo | Jornada normal, o exclusivamente tormenta |
| Volumen | Cantidad de casos u horas de jornada |
| Modo de traslado | Forzar a pie en zona céntrica de alta concentración |
| Antigüedad | Solo reclamos con más de X meses sin dictaminar |

**Resolución de conflictos**: si varias directivas vigentes alcanzan al mismo ingeniero, gana la de ámbito más específico (usuario > distrito > global); a igual ámbito, la más reciente.

**Obligatoria o sugerida**, decidido al crearla (D-30): la sugerida precarga el planificador y el ingeniero puede cambiarla; la obligatoria no se puede exceder, y el intento devuelve `DIRECTIVA_OBLIGATORIA_VIOLADA`.

La ruta generada **registra bajo qué directiva se armó**. Si el jefe pregunta en dos meses por qué se dictaminaron esos casos y no otros, la respuesta está en el dato y no en la memoria de nadie.

---

## 12. Reglas de firma

> Implementa RF-18 · Decisiones D-50, D-51 · Desvío DV-10

```ts
export function puedeFirmar(perfil: Perfil, cfg: ConfigFirma): boolean {
  return perfil.activo && cfg.rolesHabilitados.includes(perfil.rol);
}
export function hashDictamen(d: Dictamen, algoritmo: string): string
```

**Firman Operario y Jefe**, los dos roles que van a la calle. El Lector no firma porque no opera, y el **Administrador tampoco**: la sección 3 del documento académico lo define como *personal del CIL*, el Centro de Informática. No es ingeniero agrónomo. Un dictamen técnico autoriza intervenir un árbol bajo la Ordenanza 5.118 y la Ley 13.836; que lo pueda firmar alguien de sistemas sería un problema real, no una formalidad. **Administra la firma, no la ejerce.**

Los roles habilitados son **un dato configurable**, no una constante: si mañana la repartición decide restringirlo, es un cambio en el panel y no un despliegue.

El `hash` se calcula sobre una **serialización canónica** del dictamen: claves ordenadas alfabéticamente, sin espacios, fechas en ISO 8601, números sin ceros a la izquierda. Sin canonicalización, dos serializaciones del mismo dictamen darían hashes distintos y la verificación de integridad sería inútil.

---

## 13. Resumen de funciones puras

| Función | Implementa | Verificada por |
| --- | --- | --- |
| `calcularPrioridadInicial` | RF-11, matriz del relevamiento | escenario `prioridad-inicial` |
| `idEjemplar` / `mismoEjemplar` | Regla 2 de prioridad | `insistencia-vecino` |
| `escalarPorTiempo` | RF-11 | `escalamiento-14-meses` |
| `validarIntervencion` | RF-14, RF-15 | `exclusiones` |
| `perimetroADiametro`, `sugerirComplejidad` | RF-15 | `complejidad-sugerida` |
| `normalizarEspecie`, `sugerirEpoca` | RF-16 | `epoca-recomendada` |
| `calcularVencimiento`, `estadoVencimiento` | RF-19, RF-05 | `vencimiento-18-meses` |
| `balancear` | RF-23, RF-24, RF-25 | `balanceador-sin-stock` |
| `directivaAplicable`, `aplicarDirectiva` | RF-24 extendido | `directiva-obligatoria` |
| `puedeFirmar`, `hashDictamen` | RF-18, RF-19 | `firma-por-rol` |
| `ordenarVisitas` (T7) | RF-22, RF-26 | `ruta-optima` |

Cada una tiene su escenario propio en el driver (T11) y se prueba **sin base de datos**.
