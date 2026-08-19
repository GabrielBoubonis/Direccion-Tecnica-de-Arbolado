# T13 — Plan de implementación

> Diseño técnico · Última actualización: 19/08/2026 · Estado: **sin aprobar**
> Responde: en qué orden se construye, qué depende de qué, qué entra en cada corte y qué son los datos semilla.

---

## 1. Dónde estamos

| Fase | Estado |
| --- | --- |
| **Fase 1 — Diseño** | Funcional **completo**. Técnico **completo** (esta carpeta). Falta la aprobación |
| Fase 2 — Desarrollo | No arranca hasta que el diseño esté aprobado |

**No se escribe una sola línea de código de producción hasta que el diseño esté aprobado.** La única excepción admitida es preparar infraestructura vacía —crear el proyecto Supabase— y escribir el driver, porque son herramientas de verificación y no producto.

Hoy es **miércoles 19/08/2026**. El próximo corte académico es el **viernes 21/08**.

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
| **7** | **Panel de administración** | Usuarios, parámetros, adaptadores, firma digital, cortes, directivas, auditoría, entregable | 3 |
| **8** | **Offline** | Service Worker, IndexedDB, cola, precarga, reconciliación | 3, 4 |
| **9** | **Conexión del front** | SDK y los nueve cambios de T12 | Cada módulo, uno a uno |

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

Las contraseñas **no van al repositorio** (C-03, pendiente definir dónde).

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

El anteúltimo merece énfasis: **cada módulo cierra con driver verde y documentación**, así que si el proyecto se corta en el módulo cinco, lo entregado son cinco módulos verificables — no un sistema a medio hacer.

---

## 7. Lo que falta definir antes de arrancar

| # | Qué | Quién |
| --- | --- | --- |
| A-12 | Diez o quince descripciones reales de reclamos | Dirección Técnica |
| A-10 bis | Los cortes de diámetro y altura | Dirección Técnica (los carga el Administrador) |
| C-01 | Qué lleva el entregable para concesionarias y en qué formato | Equipo |
| C-02 | Cuánto se guarda el historial de recorridos | Equipo |
| C-03 | Dónde se guardan las contraseñas de prueba | Equipo |
| D-01 | Si los desvíos van al documento o como anexo | Docente |
| D-02 | Si cada corte espera el `.docx` actualizado | Docente |

**Ninguna bloquea el diseño**: para todas hay un supuesto tomado y documentado. Lo que cambia es cuánto habría que rehacer si el supuesto está mal — y en los siete casos, poco: son parámetros, tablas o texto, no arquitectura.
