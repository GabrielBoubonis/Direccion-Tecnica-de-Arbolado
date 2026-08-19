# Diseño técnico — índice

> Última actualización: 19/08/2026 · Rama: `VillegaBackBranch` · Estado: **diseño técnico completo, sin aprobar**
> Sistema de Dictaminado y Rutas Eficientes — Dirección Técnica de Arbolado, Municipalidad de Rosario.

---

## Qué es esta carpeta

Los documentos `docs-back/0X-*.md` responden **qué** hace el sistema y **por qué**: reglas de negocio, modelo conceptual, decisiones y desvíos. Esta carpeta responde **cómo** se construye: estructura del código, interfaces con su firma exacta, esquema SQL completo, contrato HTTP endpoint por endpoint, algoritmos, jobs, seguridad y plan de implementación.

La separación es deliberada. El **qué** lo define el analista funcional y se defiende contra el relevamiento y la normativa. El **cómo** lo define el desarrollo y se defiende contra el propio diseño: cada pieza técnica de acá abajo tiene que poder rastrearse hasta un requerimiento.

**Nada de esto está implementado todavía.** La fase 1 del proyecto es diseño, y termina cuando el diseño está aprobado (ver `docs-back/00-protocolo-de-trabajo.md`). Este conjunto de documentos **es** el entregable de esa fase.

## Cómo leerlo

Cada documento se puede leer solo. Eso implica que se repiten definiciones entre documentos, y es a propósito: quien va a implementar el módulo de rutas no debería tener que leer los trece archivos para entender qué recibe y qué devuelve.

| # | Documento | Qué contesta |
| --- | --- | --- |
| **T1** | [Estructura y convenciones](T1-estructura-y-convenciones.md) | Dónde vive cada archivo, cómo se nombra, cómo se manejan errores, configuración y tiempos |
| **T2** | [Puertos](T2-puertos.md) | Las trece interfaces, con la firma exacta de cada método y qué adaptador la implementa |
| **T3** | [Núcleo de dominio](T3-nucleo-dominio.md) | Entidades, tipos y **las funciones puras**: prioridad, escalamiento, exclusiones, complejidad, época, balanceador |
| **T4** | [Casos de uso](T4-casos-de-uso.md) | Cada operación paso a paso: precondiciones, orden de validación, errores, transaccionalidad |
| **T5** | [Esquema SQL](T5-esquema-sql.md) | DDL completo: tipos, tablas, restricciones, índices, triggers y políticas RLS |
| **T6** | [API HTTP](T6-api-http.md) | Cada endpoint con su request y response reales, códigos de error e idempotencia |
| **T7** | [Ruteo y geocodificación](T7-ruteo-y-geocodificacion.md) | Cómo se arma una ruta, cómo se balancea la jornada, cómo se convierte una dirección en un punto |
| **T8** | [Offline y sincronización](T8-offline.md) | Service Worker, cola durable, precarga de jornada, reintentos y reconciliación |
| **T9** | [Trabajos programados y reloj](T9-jobs-y-reloj.md) | Escalamiento diario, vencimientos, liberación de reservas, retención, y por qué el reloj se inyecta |
| **T10** | [Seguridad técnica](T10-seguridad-tecnica.md) | Autenticación, claims del token, RLS, storage privado, límite de intentos, auditoría |
| **T11** | [Driver de escenarios](T11-driver-de-escenarios.md) | El programa que demuestra en vivo que el sistema hace lo que la documentación dice |
| **T12** | [Integración del front](T12-integracion-del-front.md) | Cómo el prototipo estático pasa de datos simulados a la API sin cambiar lo que se ve |
| **T13** | [Plan de implementación](T13-plan-de-implementacion.md) | Orden de construcción, dependencias entre módulos y qué entra en cada corte semanal |

## Las cinco reglas que atraviesan todo

Se repiten en cada documento porque condicionan cada decisión técnica.

**1. La tecnología termina en los adaptadores.** `core/` no importa infraestructura: ni el SDK de Supabase, ni APIs del runtime, ni HTTP. Solo tipos, reglas y puertos. `adapters/` es el único lugar del repositorio donde puede aparecer el nombre de un proveedor. El driver verifica esta regla de forma automática (T11).

**2. Supabase se va entero.** No es "la base del sistema": simula al SUA, a la autenticación institucional, al file server y a la base propia del módulo, todo junto. El diseño tiene que quedar a un adaptador de distancia de la infraestructura municipal (RNF-08, RF-32).

**3. Se toma con señal, se ejecuta sin señal.** Pedir trabajo requiere conexión, porque es pedir una asignación exclusiva. Cargar y firmar el dictamen, no. Todo el diseño offline se apoya en eso (T8).

**4. El front valida por comodidad, el backend valida por obligación.** Toda regla que el navegador aplica se vuelve a aplicar en el servidor. Un dictamen es un documento con validez legal; su coherencia no puede depender de que el JavaScript se haya ejecutado.

**5. Nada se reporta terminado sin driver verde.** Cada módulo cierra con su escenario ejecutado en vivo contra el proyecto Supabase real, con la salida pegada en el commit.

## Trazabilidad

Cada documento cita los requerimientos que implementa con su ID (`RF-14`, `RNF-08`, `CU-04`, `HU-08`). Es el vocabulario del documento académico y del resto del equipo, y es lo que permite defender una decisión técnica sin apelar a preferencias.

Las decisiones funcionales están numeradas `D-01` a `D-53` en `docs-back/00-protocolo-de-trabajo.md`. Los apartamientos respecto del documento entregado están numerados `DV-01` a `DV-16` en `docs-back/99-desvios.md`. Cuando un documento técnico se apoya en una de esas decisiones, la cita.
