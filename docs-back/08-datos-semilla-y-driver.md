# Datos semilla y driver de verificación

> Última actualización: 18/08/2026 · Estado: **en diseño, sin aprobar**

---

# Parte A — Datos semilla

## A1. Regla

**Todo inventado.** Calles reales de Rosario y distritos reales, para que la demo sea creíble y las rutas den distancias plausibles. Vecinos, descripciones, fotos y números de reclamo, ficticios.

Nunca un export del SUA, ni siquiera anonimizado: una dirección exacta identifica un domicilio.

## A2. Usuarios de prueba

Cuatro, uno por situación real, con contraseña conocida y documentada fuera del repositorio:

| Usuario | Rol | Matrícula | Para probar qué |
| --- | --- | --- | --- |
| `lectura` | Lector | — | Que solo ve el dashboard y que **no puede** acceder a lo operativo |
| `operario` | Operario | **No** | Que trabaja con reclamos y rutas pero **no puede firmar** |
| `ingeniero` | Operario | **Sí** | El circuito completo, incluida la firma |
| `admin` | Administrador | — | Usuarios, parámetros, directivas, adaptadores y entregables |

Son cuatro y no tres a propósito: RF-02 distingue al Operario del Operario matriculado, y **esa distinción no se puede verificar con un solo usuario**. El operario sin matrícula existe para demostrar que el bloqueo de firma funciona.

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

## A4. Coordenadas

Se generan sobre calles reales de Rosario, dentro del distrito que les corresponde y sobre la traza de la calle, no en medio de una manzana. Sin esto las rutas dan distancias absurdas y el porcentaje de eficiencia no significa nada.

Punto de partida y regreso de todas las rutas: la sede de Parques y Paseos (RF-22).

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
RF-18  Operario sin matrícula no puede firmar ........ PASA
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
| **Firmar sin matrícula** | El bloqueo de RF-18 |
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
