# T13 — Plan de implementación

> Diseño técnico · Última actualización: 21/08/2026 · Estado: **sin aprobar**
> Incorpora los módulos que salieron de la auditoría del 20/08 y cierra las preguntas C-01, C-02 y C-03.
> Responde: en qué orden se construye, qué depende de qué, qué entra en cada corte y qué son los datos semilla.

---

## 1. Dónde estamos

| Fase | Estado |
| --- | --- |
| **Fase 1 — Diseño** | Funcional **completo**. Técnico **completo** (esta carpeta). Falta la aprobación |
| Fase 2 — Desarrollo | No arranca hasta que el diseño esté aprobado |

**No se escribe una sola línea de código de producción hasta que el diseño esté aprobado.** La única excepción admitida es preparar infraestructura vacía —crear el proyecto Supabase— y escribir el driver, porque son herramientas de verificación y no producto.

Hoy es **viernes 21/08/2026**, día del corte académico. El diseño funcional y el técnico están completos y **absorbieron la auditoría del 20/08**; lo que sigue es la aprobación y una segunda auditoría antes de escribir código (§8).

---

## 2. Orden de construcción

El orden está determinado por las dependencias reales, no por la comodidad.

```
0. Cimientos ──► 1. Auth ──► 2. Reclamos ──► 3. Dictamen ──► 6. Dashboard
                                  │
                                  ├──► 4. Rutas ──► 5. Tormenta
                                  │
                                  └──► 7. Admin ──► 8. Offline ──► 9. Front
```

| # | Módulo | Entrega | No arranca sin |
| --- | --- | --- | --- |
| **0** | **Cimientos** | Migraciones 0001-0012, contenedor, router, middleware, driver con escenarios estructurales | — |
| **1** | **Autenticación y roles** | Login, token, perfiles, RLS de identidad | 0 |
| **2** | **Reclamos y filtros** | Listado, filtros, validación del par, alta, geocodificación, prioridad y escalamiento | 1 |
| **3** | **Dictamen** | Emisión, validaciones, firma, hash, inmutabilidad, vencimiento, borradores | 2 |
| **4** | **Rutas y balanceador** | Jornada en tres pasos, balanceador, orden de visita, geometría, directivas | 2 |
| **5** | **Protocolo de tormenta** | Casos etiquetados, ruta de mínima distancia, alta en campo | 4 |
| **6** | **Dashboard** | Métricas agregadas, filtro por distrito, próximos a vencer | 3 |
| **7** | **Panel de administración** | Usuarios, parámetros, adaptadores, firma digital, cortes, directivas, auditoría, **captores, cuarentena, certificaciones pendientes, concesionarias y entregable en dos pasos** | 3 |
| **8** | **Offline** | Service Worker, IndexedDB, cola **por dependencias**, precarga, `storage.persist()`, reconciliación | 3, 4 |
| **9** | **Conexión del front** | SDK y los nueve cambios de T12 | Cada módulo, uno a uno |

### Dónde entra lo que salió de la auditoría

Ningún requerimiento nuevo abre un módulo nuevo: **todos caen dentro de módulos que ya existían**, y eso es un buen indicio de que el orden estaba bien elegido.

| Qué | Módulo | Por qué ahí |
| --- | --- | --- |
| **RF-34** · Blindaje de la jornada | **4** (rutas), con efecto en **2** | Se blinda al confirmar la jornada; los trabajos del módulo 2 tienen que aprender a saltearlo |
| **RF-35** · Captores y cuarentena | **1** (auth) para el corte en el login, **7** para el panel | El control más temprano es no emitir token |
| **RNF-14** · Sesión única y corte al apagar | **1** | Es una regla de emisión e invalidación de token |
| **RF-36** · Fotos en el reclamo | **2** | El alta de reclamo ya vive ahí |
| **RF-33** · Entregable a concesionarias | **7** | Es una función exclusiva del Administrador |
| **D-65** · Certificación diferida | **3** para el estado, **7** para la cola y el forzado | Firmar es del módulo 3; la pendencia se administra |
| **H-01** · Fotos después del dictamen | **3** y **8** | Cambia el contrato de emisión y el orden de la cola |
| **H-06** · Cola por dependencias | **8** | |
| **H-08** · Almacenamiento persistente | **8** | |
| **H-11** · Purga de idempotencia | **0** | Es un trabajo programado de la migración `0011` |
| **RF-37** · Ventana laboral | **4**, con panel en **7** | Limita tomar trabajo, que es lo que hace el módulo de rutas |
| **RF-38** · Cierre de duplicados | **3** | Ocurre al firmar |
| **D-89** · Completitud del dictamen | **0** y **3** | La restricción va en la migración; la validación, en el caso de uso |
| **D-83** · "Sin trabajo" cierra y no vence | **3**, con efecto en **0** | El trabajo de vencimientos deja de verlos solo |
| **D-76** · Parámetros versionados | **0** | Cambia el esquema base y lo lee todo el resto |
| **D-72**, **D-74**, **D-77** · Ampliar, cerrar antes, novedades | **4** y **8** | Son operaciones de jornada, con su parte offline |
| **D-69** · Solicitud de anulación | **3** y **7** | La pide el ingeniero, la ejecuta el Administrador |
| **D-78** · Baja con trabajo pendiente | **7** | |

**D-76 es el que hay que hacer primero de los nuevos, aunque parezca menor.** Versionar `parametro` cambia cómo lee la configuración **todo el resto del sistema**; meterlo después de tener cinco módulos escritos significa tocarlos los cinco.

**El único que cruza módulos es el blindaje**, y conviene decirlo en la defensa: se **escribe** en el módulo 4 pero se **respeta** en el módulo 2. Si los trabajos programados del módulo 2 no aprenden el `not exists`, el blindaje existe en la tabla y no protege nada. Es la clase de dependencia que se pierde si no está anotada.

### Por qué este orden

**Reclamos antes que dictamen** porque el dictamen empieza validando el par (N° SUA, año): sin reclamos no hay nada que dictaminar.

**Rutas después de reclamos pero en paralelo con dictamen**: las rutas necesitan reclamos y puntos geográficos, no dictámenes.

**Offline al final**, aunque sea la funcionalidad más vistosa. Depende de que dictamen y rutas estén estables: conectarlo antes obligaría a depurar dos cosas a la vez —la cola y el endpoint— cada vez que algo falle.

**Administración después de dictamen** porque su parte más importante es la configuración de firma, que necesita que la firma exista.

---

## 3. Definición de terminado

Un módulo está terminado **solo si cumple los cinco puntos**:

1. Desplegado en el proyecto Supabase real (`arbolado-rosario`), no en local ni en teoría.
2. Su escenario está en el driver y **ejecutado en vivo**, con salida `PASA`. Se pega la salida real.
3. Documentación actualizada **en el mismo commit**: README, el documento de diseño afectado y el protocolo si cambió una regla.
4. Cero secretos en el commit.
5. Commit hecho, con el RF referenciado en el mensaje.

Si falta alguno, **no está terminado**, y se dice explícitamente cuál falta. Nunca se reporta "listo" sin driver verde y salida a la vista.

---

## 4. Datos semilla

**Todo inventado.** Calles reales de Rosario y distritos reales, para que la demo sea creíble y las rutas den distancias plausibles. Vecinos, descripciones, fotos y números de reclamo, ficticios. Nunca un export del SUA, ni siquiera anonimizado: una dirección exacta identifica un domicilio.

### Cinco usuarios

Con el **formato real** de usuario de red municipal (B-04) y **personas inventadas**:

| Usuario | Nombre ficticio | Rol | Firma | Para probar qué |
| --- | --- | --- | --- | --- |
| `mparede0` | Marta Paredes | Lector | No | Que solo ve el dashboard y no accede a lo operativo |
| `jgutier0` | Julián Gutiérrez | Operario | Sí | El circuito completo y el **choque de reserva** |
| `cbenite0` | Carla Benítez | Operario | Sí | El circuito completo: tomar, dictaminar, firmar |
| `dmolina0` | Diego Molina | Jefe | Sí | Directivas y trabajo del equipo, **sin** administrar |
| `rquirog0` | Raúl Quiroga | Administrador | **No** | Que **configura la firma y no puede usarla** |

**Hacen falta dos operarios**: el choque —dos personas pidiendo el mismo reclamo a la vez— no se puede montar con un solo usuario, y es el que demuestra que la reserva es exclusiva de verdad.

Las contraseñas **no van al repositorio** (D-60). El repositorio lista quién es cada uno y para qué sirve; el seed las lee de una variable de entorno que no se versiona, y el README dice dónde pedirlas: el canal del equipo. Si algo se filtra, no hay nada que rotar.

**Tres captores de prueba**, uno de ellos `captor-03` **dado de baja por robo**: sin un dispositivo de baja en el seed, RF-35 y la cuarentena no se pueden demostrar en vivo. Y **dos concesionarias ficticias**, porque con una sola no se distingue si el registro contesta de verdad *a quién se le informó*.

### Alrededor de doscientos reclamos

| Dimensión | Cómo se reparte |
| --- | --- |
| Distrito | Los seis, con más volumen en Centro y Oeste |
| Prioridad | Las cuatro, con predominio de verde y amarillo, como en la realidad |
| Antigüedad | Desde días hasta más de tres años, para exhibir el rezago del relevamiento |
| Estado | Sin dictaminar, dictaminados, reservados, y algunos con dictamen vencido |
| Tormenta | Un puñado dentro de la ventana de 3 días, y otros fuera |
| **Calidad del dato** | **Algunos sin foto y con descripción mínima**, como dice el relevamiento |
| **Geocodificación** | Casos `exacta`, `aproximada`, `solo_calle` y **`fallida`** |
| Insistencia | Varios grupos de 2 y 3 reclamos sobre el mismo ejemplar |

**Las tres últimas filas importan más de lo que parece.** Un seed donde todos los reclamos están completos y son distintos entre sí produce una demo que funciona y un sistema que se rompe con datos reales. Los casos incómodos tienen que estar desde el principio.

### Reproducible

Mismo comando, mismos doscientos reclamos. Si el driver falla, tiene que fallar de nuevo con los mismos datos. Un seed aleatorio produce pruebas que fallan una vez cada diez corridas y nadie sabe por qué.

### Direcciones, no coordenadas

El seed guarda **direcciones escritas** — igual que el SUA real, que no tiene coordenadas (B-02). Las coordenadas las produce el sistema geocodificando, que es exactamente lo que va a pasar en producción. Un seed con coordenadas ya puestas probaría un circuito que no existe.

**Punto de partida y regreso: Moreno 2350** (A-02). Se geocodifica una vez y se **verifica a ojo contra el mapa** antes de darlo por bueno: de ese punto cuelga el cálculo de toda ruta.

---

## 5. El entregable visual por hitos

> Decisión D-29

Una única página web que crece por hitos y **nunca muestra como funcionando lo que solo está diseñado**.

| Hito | Contenido | Estado |
| --- | --- | --- |
| **H1** | Diseño completo: arquitectura, modelo, reglas, contrato, desvíos | **Publicado** |
| **H2** | Base y autenticación: esquema desplegado, usuarios, primeros escenarios verdes | Pendiente |
| **H3** | Dictamen de punta a punta, con salida real del driver | Pendiente |
| **H4** | Rutas, balanceador y tormenta | Pendiente |
| **H5** | Sistema completo, offline y front conectado | Pendiente |

La distinción entre "diseñado" y "funcionando" es lo que hace confiable el entregable. Una página que muestra todo verde desde el principio no le sirve a nadie para saber cómo viene el trabajo.

---

## 6. Riesgos y qué hacemos con cada uno

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| **La geocodificación de Rosario falla más de lo esperado** | Rutas pobres | La precisión se declara, el ingeniero corrige, y los `fallida` no rompen el listado |
| **Las señales de riesgo no coinciden con cómo escriben los vecinos** (A-12) | Prioridad y categoría mal inferidas | La regla es desactivable, la categoría corregible, y ambas viven en tabla |
| **Los cortes de complejidad no llegan** | RF-15 sin sugerencia | La sugerencia queda apagada; el campo funciona como hoy |
| **OSRM público con límite de uso** | Rutas lentas en la demo | Cachear la matriz por jornada; `GoogleRoutesAdapter` listo por si acaso |
| **El alcance del diseño es grande para el tiempo** | No llegar a H5 | El orden de módulos garantiza que lo que esté hecho sea **defendible solo** |
| **Reescribir el front por "prolijidad"** | Perder la demo que ya funciona | Está prohibido por protocolo: el front no se pisa |
| **El navegador descarta IndexedDB con dictámenes adentro** | Pérdida de trabajo con validez legal | `storage.persist()` + **PWA instalada como requisito de despliegue**. Si aun así ocurre, se declara |
| **Un módulo 2 que no respeta el blindaje del módulo 4** | El blindaje existe y no protege | Escenario propio en el driver: adelantar el reloj con una jornada blindada y verificar que la prioridad **no** cambió |
| **La certificadora externa nunca responde** | Dictámenes que no salen en entregables | Quedan firmados y válidos; cola visible, reintento forzable, alerta en el dashboard |
| **La ventana laboral se configura mal y frena el trabajo** | Ingenieros sin poder tomar casos | La pantalla muestra la consecuencia antes de guardar (RF-37), la tabla arranca vacía, y la vigencia caduca sola |
| **El interruptor de duplicados se apaga y nadie se entera** | Vuelven las visitas repetidas | El panel muestra el estado del interruptor junto al de las señales de riesgo; ambos son decisiones, no defectos |

El anteúltimo merece énfasis: **cada módulo cierra con driver verde y documentación**, así que si el proyecto se corta en el módulo cinco, lo entregado son cinco módulos verificables — no un sistema a medio hacer.

---

## 7. Lo que falta definir antes de arrancar

Las tres preguntas del equipo se cerraron el 20/08. Lo que queda **no depende del equipo**:

| # | Qué | Quién | Estado |
| --- | --- | --- | --- |
| A-12 | Diez o quince descripciones reales de reclamos | Dirección Técnica | Abierta. Mitigada: las señales arrancan cargadas y **marcadas como provisorias** (D-59) |
| A-10 bis | Los cortes de diámetro y altura | Dirección Técnica | Abierta. Mitigada: la tabla arranca vacía y no se sugiere nada (D-49) |
| A-09 | Si el rol Jefe se confirma como se diseñó | Dirección Técnica | Abierta |
| **Nuevo** | Qué franja horaria y qué cupo van en la ventana laboral | Dirección Técnica | Abierta. Mitigada: la tabla arranca vacía y no limita nada |
| — | Política propia de datos personales | La repartición | Abierta. Los plazos son parámetros |
| C-01 | Qué lleva el entregable para concesionarias | Equipo | **Cerrada** → RF-33, D-54, D-55 |
| C-02 | Cuánto se guarda el historial de recorridos | Equipo | **Cerrada** → D-56: 90 días el rastro, indefinido el resumen |
| C-03 | Dónde se guardan las contraseñas de prueba | Equipo | **Cerrada** → D-60: variable de entorno, canal del equipo |
| D-01 | Si los desvíos van al documento o como anexo | Docente | Abierta |
| D-02 | Si cada corte espera el `.docx` actualizado | Docente | Abierta |

**Ninguna bloquea el diseño**: para todas hay un supuesto tomado y documentado. Lo que cambia es cuánto habría que rehacer si el supuesto está mal — y en todos los casos, poco: son parámetros, tablas o texto, **no arquitectura**.

**Lo que sí hay que hacer antes de codear, y no depende de terceros: los siete requerimientos nuevos tienen que entrar al `.docx`** — RF-33 a RF-38 y RNF-14 (DV-17 a DV-22). El diseño ya los tiene absorbidos; el documento académico todavía no.

---

## 8. La auditoría previa al desarrollo

Antes de escribir la primera línea de código de producción se corre **una segunda auditoría completa** del diseño, distinta de la del 20/08: aquella recorrió una jornada sin conexión, esta recorre **todo el sistema**.

El protocolo, los ejes y la lista de verificación están en **`docs-back/10-auditoria-previa-al-desarrollo.md`**. En una línea: cada requerimiento tiene que tener flujo principal **y alternativos**, cada flujo un dueño en el código, y cada regla un escenario en el driver.

**Por qué se audita el diseño y no el código.** Un error de diseño encontrado en el código cuesta reescribir módulos; encontrado en el documento cuesta editar un párrafo. La auditoría del 20/08 lo demostró: produjo **cuatro requerimientos funcionales y un no funcional que faltaban**, y ninguno costó más que redactarlo, porque no había código escrito que los contradijera.
