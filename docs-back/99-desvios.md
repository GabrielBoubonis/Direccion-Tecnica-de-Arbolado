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
