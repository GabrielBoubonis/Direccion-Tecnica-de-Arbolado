# Datos semilla y driver de verificación

> Última actualización: 18/08/2026 · Estado: **en diseño, sin aprobar**

---

# Parte A — Datos semilla

## A1. Regla

**Todo inventado.** Calles reales de Rosario y distritos reales, para que la demo sea creíble y las rutas den distancias plausibles. Vecinos, descripciones, fotos y números de reclamo, ficticios.

Nunca un export del SUA, ni siquiera anonimizado: una dirección exacta identifica un domicilio.

## A2. Usuarios de prueba

Cinco, uno por situación real, con contraseña conocida y documentada fuera del repositorio. Usan el **formato real** de usuario de red municipal —primera letra del nombre, hasta seis del apellido, número correlativo (B-04)— con **personas inventadas**:

| Usuario | Nombre ficticio | Rol | Firma | Para probar qué |
| --- | --- | --- | --- | --- |
| `mparede0` | Marta Paredes | Lector | **No** | Que solo ve el dashboard y que **no puede** acceder a lo operativo |
| `jgutier0` | Julián Gutiérrez | Operario | Sí | El circuito completo, y el **choque de reserva** contra el otro operario |
| `cbenite0` | Carla Benítez | Operario | Sí | El circuito completo: tomar, dictaminar, firmar |
| `dmolina0` | Diego Molina | Jefe | Sí | Que baja directivas y ve el trabajo del equipo, **sin** poder administrar el sistema |
| `rquirog0` | Raúl Quiroga | Administrador | **No** | Usuarios, parámetros, firma digital, adaptadores y entregables — y que **el servidor le rechaza firmar** aunque configure la firma |

Hacen falta **dos operarios**, no uno: el escenario del choque —dos personas pidiendo el mismo reclamo a la vez— no se puede montar con un solo usuario, y es el que demuestra que la reserva es exclusiva de verdad. El Administrador cubre el límite de la firma, y es el escenario más interesante de los dos: desde que firmar es atributo del rol (D-50), hay que demostrar que **quien configura la firma digital no puede usarla** aunque le pegue directo a la API. Es personal del CIL, no un ingeniero agrónomo. El Jefe demuestra el límite contrario: dirigir el trabajo no da acceso a la administración.

Además hay un **par de coincidencia** preparado —dos apellidos que colisionan en el mismo usuario base— para mostrar de dónde sale el número correlativo del formato municipal.

## A3. Reclamos

Alrededor de doscientos, repartidos para que cada situación tenga casos:

| Dimensión | Cómo se reparte |
| --- | --- |
| Distrito | Los seis, con más volumen en Centro y Oeste |
| Prioridad | Las cuatro, con predominio de verde y amarillo, como en la realidad |
| Antigüedad | Desde días hasta más de tres años, para exhibir el rezago del relevamiento |
| Estado | Sin dictaminar, dictaminados, reservados, y algunos con dictamen vencido |
| Tormenta | Un puñado dentro de la ventana de 3 días, y otros fuera |
| Calidad del dato | **Algunos sin foto y con descripción mínima**, como dice el relevamiento |
| Insistencia | Varios grupos de 2 y 3 reclamos sobre el mismo ejemplar |

Las últimas dos filas importan más de lo que parece. Un seed donde todos los reclamos están completos y son distintos entre sí produce una demo que funciona y un sistema que se rompe con datos reales. **Los casos incómodos tienen que estar en el seed desde el principio.**

## A4. Direcciones y coordenadas

El seed guarda **direcciones escritas, no coordenadas** — igual que el SUA real, que no tiene ninguna (B-02). Las coordenadas las produce el sistema geocodificando, que es exactamente lo que va a pasar en producción. Un seed con coordenadas ya puestas probaría un circuito que no existe.

Las direcciones son de calles reales de Rosario, con altura coherente con el distrito que les toca, para que las rutas den distancias plausibles y el porcentaje de eficiencia signifique algo.

**Punto de partida y regreso de todas las rutas: Moreno 2350, sede de Parques y Paseos** (RF-22, A-02). Se geocodifica una sola vez y el punto queda fijo en la tabla de parámetros; se verifica a ojo contra el mapa antes de darlo por bueno, porque de ese punto cuelga el cálculo de toda ruta.

### Los casos malos de geocodificación van en el seed

Igual que las descripciones mínimas y las fotos faltantes, tienen que estar desde el principio:

| Caso | Para qué |
| --- | --- |
| Altura inexistente en esa calle | Que el reclamo caiga en `aproximada` y se vea distinto en el mapa |
| Calle con nombre ambiguo o mal escrito | Que termine en `solo_calle` sin romper el listado |
| Dirección que no resuelve | Que quede como `fallida`, visible en el listado y **excluida de la ruta** |
| Punto corregido en campo | Que una geocodificación posterior **no lo pise** |

Sin estos cuatro, la demo muestra un mapa perfecto y el sistema real se rompe la primera semana.

## A5. Reproducible

El seed se genera siempre igual: mismo comando, mismos doscientos reclamos. Si el driver falla, tiene que fallar de nuevo con los mismos datos. Un seed aleatorio produce pruebas que fallan una vez cada diez corridas y nadie sabe por qué.

---

# Parte B — Driver de verificación

## B1. Qué es

Un programa que corre **escenarios de punta a punta contra el proyecto Supabase real** y emite una tabla `RF → PASA / FALLA`.

No es una suite de tests unitarios. Es la evidencia de que el sistema hace lo que la documentación dice, ejecutable frente al profesor.

```
RF-01  Login con credenciales válidas ............... PASA
RF-02  Lector no accede a reclamos ................... PASA
RF-12  Rechaza par SUA/año inexistente ............... PASA
RF-14  Bloquea extracción + poda ..................... FALLA
       esperado 422, recibido 201
RF-18  Un Administrador no puede firmar ............. PASA
```

## B2. Regla de crecimiento

**Cada entregable suma su escenario y ninguno se saca nunca.** El driver solo crece. Si un cambio rompe algo de hace tres semanas, se entera en la corrida siguiente y no en la defensa.

## B3. Los escenarios difíciles

Los fáciles se escriben solos. Estos son los que le dan valor real al driver:

| Escenario | Qué demuestra |
| --- | --- |
| **Adelantar el reloj 14 meses** | El escalamiento de prioridad y el vencimiento a 18 meses. Imposible de probar sin el puerto de reloj |
| **Dos usuarios piden el mismo reclamo a la vez** | Que la reserva es exclusiva de verdad, no solo en teoría |
| **Enviar el mismo dictamen tres veces** | Que la idempotencia funciona y no entran tres |
| **Firmar con un rol sin permiso** | El bloqueo de RF-18: ni Lector ni Administrador firman, validado en el servidor |
| **Lector llamando a endpoints operativos** | Mínimo privilegio real, no solo botones ocultos en el front |
| **Cambiar el adaptador de ruteo** | RF-32 en vivo, sin deploy |
| **Pedir 25% de urgentes sin stock** | La redistribución de RF-25 |
| **Directiva obligatoria vigente** | Que el ingeniero no puede salirse de su alcance |
| **Chequeo estructural del código** | Que no hay imports de proveedores fuera de los adaptadores |

El último no toca la base: recorre los archivos. Es lo que evita que la regla de oro de la arquitectura se erosione sola en dos semanas.

## B4. Los tres modos

| Modo | Para qué |
| --- | --- |
| Completo | Todos los escenarios. Antes de cada commit de entregable |
| Por módulo | Solo lo que se está tocando, para iterar rápido |
| Demostración | Corrida narrada y más lenta, para proyectar en la defensa |

## B5. Sobre los datos que deja

El driver **limpia lo que crea**. Si deja basura, cada corrida ensucia la base y la demo termina mostrando cincuenta dictámenes de prueba con nombres inventados.

Los datos del seed no se tocan: son el escenario, no el resultado.

---

## C. Qué falta definir

- Si el driver se ejecuta automáticamente ante cada cambio, o solo a mano antes de commitear.
- Dónde se documentan las contraseñas de los usuarios de prueba, ya que no van al repositorio.
