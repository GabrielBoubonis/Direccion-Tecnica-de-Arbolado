# T11 — El driver de escenarios

> Diseño técnico · Última actualización: 19/08/2026 · Estado: **sin aprobar**
> Responde: qué es el driver, qué escenarios corre, qué demuestra cada uno y cómo se ve la salida.

---

## 1. Qué es y qué no es

El driver es un programa que corre **escenarios de punta a punta contra el proyecto Supabase real** y emite una tabla `RF → PASA / FALLA`.

**No es una suite de pruebas unitarias.** Es la evidencia de que el sistema hace lo que la documentación dice, **ejecutable en vivo frente al profesor**. Esa diferencia condiciona todo el diseño:

| Una suite de tests | El driver |
| --- | --- |
| Corre contra mocks | Corre contra la base real |
| Se organiza por archivo de código | Se organiza **por requerimiento** |
| Sirve al que programa | Sirve al que **defiende el trabajo** |
| Falla con un stack trace | Falla diciendo qué requerimiento no se cumple |

Las pruebas unitarias también existen —`deno task test`, sobre las funciones puras del núcleo— y son otra cosa. El driver es lo que se proyecta en la defensa.

---

## 2. Por qué existe

El protocolo del proyecto define terminado con cinco puntos, y el segundo es *"su escenario está agregado al driver y ejecutado en vivo, con salida `PASA`; se pega la salida real"*.

**Sin driver verde no está terminado.** No es una formalidad: un módulo que "anda" en la máquina de quien lo escribió y no tiene escenario reproducible es un módulo del que no se puede decir nada en una defensa oral.

---

## 3. Cómo se corre

| Comando | Qué hace |
| --- | --- |
| `deno task driver` | Todos los escenarios |
| `deno task driver -- --rf RF-18` | Solo los de un requerimiento |
| `deno task driver -- --grupo dictamen` | Solo un módulo |
| `deno task driver -- --rapido` | Omite los que dependen de proveedores externos |

`deno task desplegar` **corre el driver antes de publicar**. Si un escenario falla, no se despliega.

---

## 4. Cómo se ve la salida

```
════════════════════════════════════════════════════════════
  DRIVER · Sistema de Dictaminado y Rutas Eficientes
  Proyecto: arbolado-rosario (igflkzpfpvklhinycyup)
  19/08/2026 14:22 · 47 escenarios
════════════════════════════════════════════════════════════

ESTRUCTURA
  ---    core/ no importa infraestructura ................. PASA
  ---    core/ no llama al reloj del sistema .............. PASA

AUTENTICACIÓN Y ROLES
  RF-01  Login con usuario de red (gboubon0) .............. PASA
  RF-01  Credenciales incorrectas → mensaje genérico ...... PASA
  RF-02  Un Lector no accede a lo operativo ............... PASA
  RF-31  Usuario desactivado no obtiene token ............. PASA

RECLAMOS
  RF-07  Solo entran Reclamo / arbolado público ........... PASA
  RF-12  Par (N° SUA, año) inexistente se rechaza ......... PASA
  RF-12  Reclamo ya dictaminado no se puede redictaminar .. PASA
  RF-11  Escalamiento a 14 meses: 3 saltos, rojo se queda . PASA
  RF-11  Regla de señales desactivada → no escala por texto  PASA

DICTAMEN
  RF-14  Extracción + poda se rechaza ..................... PASA
  RF-18  Un Administrador no puede firmar ................. PASA
  RF-19  Un dictamen firmado no se puede modificar ........ PASA
  RF-19  Vencimiento a 18 meses desde la emisión .......... PASA
  RF-20  Al firmar, el reclamo pasa a dictaminado ......... PASA
  RNF-07 Dos dictámenes vigentes: la base rechaza ......... PASA

RESERVAS Y JORNADA
  ---    Dos usuarios piden el mismo reclamo a la vez ..... PASA
  ---    La reserva ocurre ANTES de la pre-confirmación ... PASA
  D-16   Choque: la carga se conserva como borrador ....... PASA

RUTAS
  RF-21  10 minutos por dictamen, desde parámetros ........ PASA
  RF-22  La ruta parte de Moreno 2350 y vuelve ahí ........ PASA
  RF-25  Sin stock de rojos, redistribuye e informa ....... PASA
  RF-32  Cambio de adaptador de ruteo sin desplegar ....... PASA

────────────────────────────────────────────────────────────
  47 escenarios · 47 PASA · 0 FALLA · 31,4 s
════════════════════════════════════════════════════════════
```

**Cada línea empieza con el requerimiento**, no con el nombre de una función. Es lo que permite proyectar la salida y que el profesor siga la lista contra su propio documento.

Cuando algo falla, la línea dice qué se esperaba y qué pasó, en castellano:

```
  RF-25  Sin stock de rojos, redistribuye e informa ....... FALLA
         Esperado: 14 casos asignados, 2 rojos, redistribución informada
         Obtenido: 12 casos asignados, 2 rojos, sin campo 'redistribuido'
         → El cupo sobrante no se completó con otras prioridades
```

---

## 5. Los escenarios estructurales

Son los primeros y no tienen RF asociado. Verifican **la arquitectura, no el comportamiento**.

| Escenario | Qué recorre | Falla si |
| --- | --- | --- |
| `core-sin-infraestructura` | `src/core/**/*.ts` | Hay un import que sale de `core/`, o una URL, o `npm:` |
| `core-sin-reloj` | `src/core/**/*.ts` | Aparece `Date.now()` o `new Date()` sin argumentos |
| `adapters-aislados` | `src/adapters/**` | Un adaptador importa a otro adaptador |
| `sin-secretos` | Todo el repositorio | Hay algo con forma de clave o token |

**Una regla que no se verifica se rompe sola en dos semanas.** La regla de oro del proyecto —"la tecnología termina en los adaptadores"— es exactamente el tipo de regla que todo el mundo respeta al principio y alguien rompe sin darse cuenta, en una función auxiliar, para resolver algo trivial.

Que estos escenarios fallen en la misma tabla que los de negocio hace que romper la arquitectura sea **tan visible como romper una regla**.

---

## 6. Los escenarios difíciles

Son los que justifican que el driver exista, porque son los que nadie prueba a mano.

### `escalamiento-14-meses` — RF-11

```ts
const reloj = new RelojFijo('2026-08-19');
crearReclamo({ categoria: 'obstruccion', fechaIngreso: '2026-08-19' });  // verde

reloj.avanzar({ dias: 61 }); await job('escalar');   // → amarillo
reloj.avanzar({ dias: 60 }); await job('escalar');   // → naranja
reloj.avanzar({ dias: 60 }); await job('escalar');   // → rojo
reloj.avanzar({ dias: 60 }); await job('escalar');   // rojo se mantiene

verificar(historial).tieneSaltos(3);
```

Cuatro líneas prueban catorce meses de escalamiento. **Sin el reloj inyectable esto solo se podría verificar esperando catorce meses.**

### `choque-de-reserva`

Dos usuarios reales (`jgutier0` y `cbenite0`) piden **el mismo reclamo en la misma milésima**. Se verifica que uno gana, el otro recibe `409` con el nombre de quien lo tiene, y que **existe una sola reserva activa**.

Es el escenario que demuestra que la exclusividad la garantiza el índice único de la base y no un chequeo del código.

### `dictamen-offline-duplicado`

El mismo dictamen se envía **tres veces** con la misma `Idempotency-Key`, como haría un celular con señal intermitente. Se verifica que existe **un** dictamen y que las tres respuestas son idénticas.

Es el escenario que sostiene todo el diseño offline: sin idempotencia, la cola duplicaría trabajo de campo.

### `firma-por-rol` — RF-18, D-50

Cuatro intentos de firma, uno por rol:

| Usuario | Rol | Esperado |
| --- | --- | --- |
| `cbenite0` | Operario | **Firma** |
| `dmolina0` | Jefe | **Firma** |
| `mparede0` | Lector | Rechazado |
| `rquirog0` | Administrador | **Rechazado** |

El cuarto es el interesante: demuestra que **quien configura la firma digital no puede usarla**. Es personal del CIL, no ingeniero agrónomo (D-50, DV-10).

Y se prueba **pegándole directo a la API con un token válido**, no ocultando el botón: la validación tiene que estar en el servidor, no en la interfaz.

### `dictamen-inmutable` — RF-19, RNF-06

Se firma un dictamen y después se intenta modificarlo por tres caminos: la API, un `update` directo a la tabla y un `delete`. Los tres tienen que fallar, **el segundo y el tercero por el trigger de la base**.

Demuestra que la inmutabilidad no es una convención del código sino una regla de la base.

### `cambio-de-proveedor` — RF-32

Se arma una ruta con `adaptador_ruteo = osrm`, se cambia el parámetro **desde la API de administración**, se arma otra ruta y se verifica que `proveedorRuteo` cambió — **sin desplegar nada**.

Es RF-32 demostrado en vivo, y es de los momentos más fuertes que puede tener la defensa.

### `borrar-esquema-sua`

Se borra el esquema `sua_sim` entero en una transacción, se corre el resto de los escenarios y se verifica que **lo único que falla es `SuaSimuladoAdapter`**; el núcleo, las reglas y los casos de uso siguen compilando y respondiendo.

Es la demostración literal de "la tecnología termina en los adaptadores". Después se restaura por rollback.

### `geo-correccion-no-se-pisa`

Un ingeniero corrige el punto de un reclamo; después corre el job de geocodificación. Se verifica que el punto **sigue siendo el corregido**.

Protege la regla más importante de la geocodificación: el ingeniero estuvo parado frente al árbol.

---

## 7. Datos que usa

Los del seed (T13), **siempre iguales**: mismo comando, mismos doscientos reclamos. Si el driver falla, tiene que fallar de nuevo con los mismos datos. Un seed aleatorio produce pruebas que fallan una vez cada diez corridas y nadie sabe por qué.

Cada escenario **limpia lo que crea**. Corre dentro de una transacción que se revierte, salvo los que verifican trabajos programados, que necesitan datos persistidos y limpian explícitamente.

**Los casos incómodos están en el seed desde el principio**: reclamos sin foto, con descripción mínima, con geocodificación fallida, con altura inexistente, grupos de dos y tres reclamos sobre el mismo ejemplar. Un seed donde todo está completo produce una demo que funciona y un sistema que se rompe con datos reales.

---

## 8. Los cuatro modos de fallo que el driver tiene que atrapar

| Modo de fallo | Escenario que lo atrapa |
| --- | --- |
| La regla está en el código pero no en la base | `dictamen-inmutable`, `dos-dictamenes-vigentes` |
| La regla está en la base pero no en la API | Los escenarios de negocio, que pasan por HTTP |
| La regla está en el front pero no en el backend | Todos: el driver **nunca** usa el front |
| La arquitectura se rompió sin que nadie se diera cuenta | Los escenarios estructurales |

El tercero es el que más importa en este proyecto. El prototipo ya valida exclusiones y escalamiento en JavaScript del navegador; si el backend no lo repitiera, el sistema parecería correcto en la demo y aceptaría cualquier cosa por API. **El driver no toca el front nunca**, justamente para que esa diferencia sea imposible de disimular.
