# Entregable visual por progreso

> Última actualización: 18/08/2026 · Estado: **H1 publicado**
>
> **H1 en vivo:** <https://claude.ai/code/artifact/797fd3f0-1af9-4310-893a-f02397dca478>
> Fuente versionada en `entregables/h1-dossier.html`. Republicar ese archivo actualiza la misma URL.
> Se construye cuando haya sustancia real que mostrar. Un entregable visual sin contenido detrás es una maqueta, y una maqueta no defiende un trabajo.

---

## 1. Para qué existe

El trabajo se entrega y se defiende por etapas, no solo al final. En cada corte hay que poder mostrar algo concreto, y "tenemos documentos en Markdown en una rama de GitHub" no funciona como material de presentación frente a un docente.

El entregable visual es **una sola página web**, autocontenida y compartible por link, que se actualiza en cada hito. No es una presentación nueva por etapa: es la misma pieza que crece, así se ve el progreso acumulado en vez de una serie de PowerPoints sueltos.

## 2. Principio: nunca mostrar lo que no existe

Cada afirmación de la página tiene que estar respaldada por algo que se pueda ejecutar en el momento. Si dice "el sistema bloquea intervenciones contradictorias", el driver tiene que poder demostrarlo en vivo.

Lo que está diseñado pero no construido se muestra **marcado como diseñado**, nunca como funcionando. Un profesor que descubre una función maquillada anula la credibilidad de todo lo demás.

## 3. Estructura de la página

| Sección | Contenido | Desde qué hito |
| --- | --- | --- |
| El problema | Circuito actual en papel, dónde está el cuello de botella, cuánto cuesta | H1 |
| Qué resuelve | Alcance del sistema y qué queda deliberadamente afuera | H1 |
| La restricción | Por qué no hay conexión real y cómo eso ordenó la arquitectura | H1 |
| Arquitectura | Diagrama de puertos y adaptadores, con la frontera de lo que se reemplaza | H1 |
| Principio de campo | "Se toma con señal, se ejecuta sin señal", con el caso de los dos ingenieros | H1 |
| Modelo de datos | Entidades y relaciones, con los dos esquemas diferenciados | H1 |
| Reglas de negocio | Prioridad, escalamiento, exclusiones, vencimiento, directivas | H1 |
| Estado de avance | Tabla de módulos, con lo diseñado y lo funcionando claramente distinguidos | H1, se actualiza |
| Evidencia | Salida real del driver: qué RF están verificados en vivo | H2 |
| Desvíos | Qué cambiamos respecto del documento y por qué | H2 |

## 4. Hitos

**H1 — Diseño cerrado. PUBLICADO el 18/08 para el corte del viernes 21/08.** Arquitectura, modelo de datos y reglas aprobados. La página sale completa en su parte conceptual, con el avance en cero. Es lo que se muestra si la fecha de entrega llega antes que el código: un análisis completo y defendible, que es exactamente lo que se evalúa en una tecnicatura de análisis funcional.

**H2 — Base y autenticación.** Esquema desplegado, usuarios de prueba, primeros escenarios del driver en verde. Aparece la sección de evidencia con salida real.

**H3 — Dictamen de punta a punta.** Validar el par SUA/año, cargar, firmar, quedar inmutable y actualizar el reclamo. Es el corazón del trabajo y el hito que más pesa.

**H4 — Rutas, balanceador y tormenta.** Con mapa y cronograma reales.

**H5 — Completo.** Panel de administrador, directivas de jornada, dashboard, sincronización offline. El driver corre entero frente al profesor.

## 5. La demostración fuerte

Hay dos cosas que este proyecto puede mostrar y que un trabajo académico promedio no:

**Cambiar de proveedor en vivo.** Cambiar el parámetro del adaptador de ruteo y que el sistema siga funcionando, sin tocar código ni volver a desplegar. Eso *es* RF-32 y se ve en diez segundos.

**Borrar el SUA simulado.** Eliminar el esquema `sua_sim` y mostrar que lo único que se rompe es un adaptador, mientras el resto del sistema queda intacto. Es la prueba de que el desacoplamiento no es una promesa del documento.

Ambas requieren que el sistema esté construido, así que van en H5. Pero conviene tenerlas presentes desde ahora, porque **condicionan el diseño**: si no se construye pensando en poder demostrarlas, después no se pueden demostrar.

## 6. Formato

Página web autocontenida, publicable por link privado y compartible con el equipo y el docente. Responsive, porque se va a abrir tanto en una notebook como proyectada.

Los diagramas van dibujados en la página, no como capturas de imagen: tienen que leerse en un proyector y seguir siendo legibles.

## 7. Qué falta definir

- La fecha de cada corte académico, para saber qué hito tiene que estar listo cuándo.
- Si el docente quiere además el `.docx` actualizado en cada corte o solo al final.
