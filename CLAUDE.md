# CLAUDE.md

Contexto del proyecto para trabajar en este directorio. Se responde en **español rioplatense**.

## Qué es esto

**Sistema de Dictaminado y Rutas Eficientes** para la **Dirección Técnica de Arbolado** (Dirección General de Parques y Paseos, Municipalidad de Rosario).

Trabajo final de **Práctica Profesionalizante II** — Tecnicatura Superior en Análisis Funcional de Sistemas, Terciario Urquiza.
Equipo: Boubonis (Gabriel), Maschio (Alejandro), Pizzicatti (Gianluca), **Villega (Lucas — quien usa este entorno)**. Docente: Pedernera.

Lucas trabaja sobre la rama **`VillegaBackBranch`** del repo <https://github.com/GabrielBoubonis/Direccion-Tecnica-de-Arbolado> (backend / servicios).

## El problema real

Los ingenieros agrónomos hoy emiten el dictamen técnico **en papel**. El papel viaja a Procesamiento de Datos, que lo transcribe a mano al **SUA** (Sistema Único de Atención Ciudadana, el sistema macro de toda la Municipalidad). Eso genera demoras, errores de carga y expedientes con más de 3 años de atraso. Ninguna cuadrilla puede intervenir un árbol sin dictamen firmado (Ordenanza 5.118, Ley Prov. 13.836).

El sistema ataca tres cuellos de botella: despapelización del dictamen, priorización objetiva de reclamos y planificación de rutas de campo.

## Restricción que define toda la arquitectura

**El equipo no tiene permisos sobre el SUA ni sobre la autenticación institucional.** Por eso el prototipo simula esos servicios con una base en la nube, detrás de dos interfaces:

- `IReclamoProvider` — `obtenerReclamo(nroSua, anio)`, `actualizarEstado(nroSua, estado)`
- `IAuthProvider` — `validarCredenciales(usuario, password)`

Pasar a producción debe ser **cambiar la implementación concreta del adaptador, sin tocar el núcleo** (RNF-08, RF-32). Toda lógica de negocio que se escriba tiene que quedar de este lado de la interfaz, nunca acoplada al proveedor de datos.

## Documentación

Todo está convertido a Markdown en `docs/` — **leer de ahí, no de los `.docx`**:

- `docs/00-indice.md` — índice
- `docs/01-documentacion-tecnica.md` — RF-01→RF-32, RNF-01→RNF-13, HU-01→HU-14, CU-01→CU-09, MER, arquitectura
- `docs/02-minuta-relevamiento.md` — relevamiento, matriz de prioridad y pedidos del cliente
- `docs/03-diagramas.md` — fuente PlantUML de los 8 diagramas
- `docs/04-estado-del-codigo.md` — **estado real de la rama y brechas contra los RF**

Los `.docx` y `.svg` de la raíz son los entregables académicos; los `.md` son la copia legible. Si cambia un requerimiento, actualizar el `.md` y avisar que el `.docx` quedó desfasado.

Al citar una decisión, referenciar el ID (`RF-14`, `RNF-08`, `CU-04`, `HU-08`) — es el vocabulario que usa el profesor y el resto del equipo.

## Reglas de negocio que no se negocian

- **Alcance de entrada**: solo solicitudes del SUA con Tipo `Reclamo` / Subtipo `Problemas con el arbolado público`. Nada más.
- **Clave de un reclamo**: el par **(N° SUA, año)**. Es el primer paso obligatorio del dictamen (RF-12): si no existe o ya está dictaminado, no se puede continuar.
- **Prioridad por colores**: verde (baja) → amarillo (media) → naranja (alta) → rojo (urgente). **Escala sola cada 2 meses** si el reclamo sigue sin dictaminar; rojo se queda en rojo (RF-11).
- **Intervenciones mutuamente excluyentes** (RF-14): extracción bloquea poda y corte de raíces, y viceversa. No se puede confirmar el dictamen con la combinación inconsistente.
- **Firma digital** (RF-18): solo un Operario **con matrícula profesional registrada** puede firmar. Al firmar, el dictamen queda en **solo lectura**, con sello de tiempo, matrícula y hash (RF-19, RNF-06).
- **Vencimiento del dictamen: 18 meses** desde la emisión (RF-19). El dashboard avisa los que vencen en ≤30 días (RF-05).
- **Al firmar, el reclamo pasa a `dictaminado`** vía el adaptador (RF-20).
- **Rutas** (RF-21→RF-27): parten de Parques y Paseos y **vuelven** a Parques y Paseos. **10 minutos por dictamen, configurable** (RNF-09). Modos: auto, a pie, bicicleta. El balanceador reparte la jornada por porcentaje de prioridad, con modos `urgentes primero` / `por porcentaje del jefe` / `automático equilibrado`, y **redistribuye si falta stock** de una prioridad (RF-25).
- **Protocolo de tormenta** (RF-28→RF-30): sección visible **solo si hay casos** etiquetados, últimos 3 días, **todos con la misma prioridad** (no aplica balanceador), ruta de mínima distancia.
- **Roles**: Lector (solo dashboard), Operario (todo lo operativo; firma solo si tiene matrícula), Administrador (usuarios, roles, adaptadores, parámetros).
- **El sistema no crea reclamos propios**: consume los que Procesamiento de Datos deriva. Si se habilita el alta manual, hay que justificar el caso de uso (pedido explícito del cliente, minuta 12/08).

### Pedidos del cliente (minuta 12/08) que suelen olvidarse

- El **mapa de la ruta no se reinicia** al cargar un dictamen. Solo se limpia con un botón explícito de "restablecer" — el ingeniero lo sigue toda la jornada.
- Filtrar reclamos **por distrito** en el listado y en el dashboard.
- Botón de **consulta de reclamo por dirección**.
- El dictamen debe tener **todos** los campos del formulario físico actual, incluido trabajo en raíces y la opción "sin trabajo".

## El código

Vive en `Direccion-Tecnica-de-Arbolado/ArboladoRosario/` (la app está un nivel adentro del repo).

Stack actual de la rama: **Expo SDK 54 + React Native 0.81 + expo-router 6**, TypeScript strict, **Firebase Firestore** como base. Pantallas en `app/` (routing por archivo), acceso a datos en `services/`.

```bash
cd "Direccion-Tecnica-de-Arbolado/ArboladoRosario"
npm install
npm run web       # o: npm start / npm run android / npm run ios
```

Expo cambió mucho: consultar <https://docs.expo.dev/versions/v54.0.0/> antes de escribir código de Expo (es lo que pide el `AGENTS.md` del repo).

`index.html` y `login.html` en esa carpeta son el **prototipo estático anterior** (Leaflet + OSRM + signature_pad) — es la demo que se le mostró al profesor y tiene funcionalidad que la app Expo todavía no replicó. Sirve como referencia de comportamiento, no como código a mantener.

### Tensiones abiertas — leer antes de proponer cambios

La documentación dice **Supabase + Vercel + web app**; el código usa **Firebase + Expo**. También hay constantes que contradicen los RF (`T_DICT = 7` vs los 10 minutos de RF-21) y falta todo el login, los adaptadores y el vínculo dictamen↔reclamo. El detalle completo está en `docs/04-estado-del-codigo.md`. **No resolver estas discrepancias por cuenta propia: son decisiones de equipo.** Señalarlas y proponer, pero preguntar antes de reescribir.

## Cómo trabajar acá

- Confirmar en qué rama se está antes de commitear. La rama de Lucas es `VillegaBackBranch`; `main` es compartida.
- Si un cambio de código contradice un RF, decirlo explícitamente en vez de adaptar el requerimiento en silencio.
- Este es un trabajo académico con defensa oral: cada decisión técnica tiene que poder justificarse contra el relevamiento y la normativa, no solo funcionar.

## Trabajo de backend (rama `VillegaBackBranch`)

**Antes de tocar nada, leer `docs-back/00-protocolo-de-trabajo.md`.** Es un documento vivo con la definición de terminado, las decisiones cerradas y las preguntas abiertas.

Lo esencial:

- **Lucas define el qué, Claude el cómo.** Lucas es analista funcional. Las preguntas se le hacen en términos de comportamiento observable ("cuando el ingeniero está sin señal, ¿qué ve?"), nunca de mecanismo interno. El mecanismo se decide y se documenta.
- **Fase actual: diseño.** No se escribe código de producción hasta que el diseño esté aprobado.
- **Sin driver verde no está terminado.** Cada entregable se verifica en vivo contra el proyecto Supabase real y se muestra la salida.
- **No existe trabajo sin documentar.** README y documento de diseño se actualizan en el mismo commit que el cambio.
- **Siempre commit**, uno por entregable, con el RF referenciado.
- **La tecnología termina en los adaptadores.** Ni un `import` de un proveedor fuera de `adapters/`. Supabase se va entero el día de la transferencia, así que todo acceso a datos va detrás de un puerto.
- **El front no se pisa.** `ArboladoRosario/index.html` y `login.html` mantienen su comportamiento visible; se les migra lógica al backend.
- **Nunca commitear**: `service_role` key, password de la base, `.env` reales, tokens, keys con facturación. Si filtrarlo obliga a rotar una credencial, no va al repo.
- **Datos de vecinos: solo inventados.** Nunca PII real, ni siquiera anonimizada.

Proyecto Supabase: `arbolado-rosario` — ref `igflkzpfpvklhinycyup`, región `sa-east-1`.
