# Estado del código — rama `VillegaBackBranch`

> **⚠ Documento desactualizado a propósito, al 19/08/2026.**
> Describe el estado del repositorio **antes** del 18/08. Desde entonces: la app Expo / React Native con Firebase **se eliminó de la rama** (D-33, DV-06), el front quedó reducido a `index.html` + `login.html` autocontenidos, y el diseño del backend se completó en `docs-back/` y `docs-back/tecnico/`.
> Se conserva sin reescribir porque es el **relevamiento de código original**, y como tal es evidencia del análisis: muestra qué se encontró y por qué se decidió lo que se decidió. Reescribirlo borraría ese recorrido.
> El estado vigente está en `README.md` y en `docs-back/tecnico/T13-plan-de-implementacion.md`.

Repo: <https://github.com/GabrielBoubonis/Direccion-Tecnica-de-Arbolado>
Rama de trabajo: `VillegaBackBranch` (clonada en `Direccion-Tecnica-de-Arbolado/`).
Ramas existentes: `main`, `VillegaBackBranch`, `Alemaschio-Front-Test`.

Historial actual (3 commits): `fix: preparacion del entorno` → `Create Front Test` → `Add files via upload`.

## Estructura

```
Direccion-Tecnica-de-Arbolado/
└── ArboladoRosario/            <- la app vive un nivel adentro
    ├── app/                    <- pantallas expo-router (file-based routing)
    │   ├── _layout.tsx         <- Tabs: Inicio · Reclamos · Dictamen · Rutas · Tormenta
    │   ├── index.tsx           <- Dashboard / métricas          (219 líneas)
    │   ├── reclamos.tsx        <- Listado + alta de reclamo     (322 líneas)
    │   ├── dictamen.tsx        <- Formulario de dictamen        (472 líneas)
    │   ├── rutas.tsx           <- Planificador + balanceador    (379 líneas)
    │   └── tormenta.tsx        <- Protocolo de tormenta         (369 líneas)
    ├── services/
    │   ├── firebase.ts         <- init Firestore (memoryLocalCache)
    │   ├── reclamo.ts          <- tipo Reclamo + CRUD
    │   └── dictamen.ts         <- tipo Dictamen + CRUD
    ├── index.html / login.html <- prototipo estático anterior (Leaflet + OSRM + signature_pad)
    ├── App.tsx / index.ts      <- entry points de Expo
    ├── app.json, babel.config.js, tsconfig.json, package.json
    └── AGENTS.md / CLAUDE.md   <- solo dicen: leer docs de Expo SDK 54
```

## Stack real

| Capa | En el código | En la documentación |
| --- | --- | --- |
| Frontend | Expo SDK 54 + React Native 0.81 + expo-router 6 (TS strict) | PWA / Web App HTML+CSS+JS |
| Backend | ninguno — el cliente pega directo a Firestore | API serverless en Vercel |
| Base de datos | **Firebase Firestore** (proyecto `arbolado-rosario`) | **Supabase** PostgreSQL |
| Auth | **no implementada** | Supabase Auth vía `IAuthProvider` |
| Mapas | no hay mapa en la app Expo | Google Maps / Leaflet |
| Adaptadores | **no existen** `IReclamoProvider` / `IAuthProvider` | núcleo del diseño (RNF-08, RF-32) |

## Qué está implementado

- **Dashboard** (`app/index.tsx`): totales de reclamos, pendientes, urgentes, tormenta, resueltos, dictámenes; últimos 3 reclamos. Sin gráficos ni filtro por distrito.
- **Reclamos** (`app/reclamos.tsx`): listado desde Firestore ordenado por fecha, filtro por prioridad, alta manual de reclamo. Sin filtro por distrito/antigüedad/tipo de intervención.
- **Dictamen** (`app/dictamen.tsx`): formulario completo con las opciones reales del dictamen físico (extracción, trabajos aéreos, subterráneos, sin trabajo, plantar, complejidad, urgente, frente garage, media tensión, de oficio). Guarda en la colección `dictamenes`.
- **Rutas** (`app/rutas.tsx`): balanceador con 3 modos (`urgentes` / `auto` 25-25-25-25 / `jefe` por porcentajes) y estimación de jornada por constantes fijas.
- **Tormenta** (`app/tormenta.tsx`): filtro por día y ruta de emergencia estimada.

## Brechas contra los requerimientos

| Tema | Estado |
| --- | --- |
| RF-01 / RF-02 login, JWT, roles | **falta por completo** — no hay pantalla de login ni control de sesión en la app Expo |
| RF-12 validar par (N° SUA, año) antes del formulario | **falta** — el formulario arranca libre |
| RF-14 bloqueo de intervenciones excluyentes | **falta** en la app Expo (sí está en `index.html`) |
| RF-18 firma digital + matrícula | **falta** en Expo (`firmaBase64` existe en el tipo pero no se captura) |
| RF-19 vencimiento a 18 meses + hash + inmutabilidad | **falta** |
| RF-20 actualizar estado del reclamo al firmar | **falta** — el dictamen se guarda suelto, no marca el reclamo |
| RF-11 escalamiento de prioridad por tiempo | **falta** en Expo (sí está en `index.html`) |
| RF-26 mapa real de la ruta | **falta** en Expo (Leaflet + OSRM sí están en `index.html`) |
| RF-31 / RF-32 panel de administrador | **falta por completo** |
| RNF-08 desacoplamiento por adaptadores | **falta** — Firestore está importado directo en cada pantalla |

## Discrepancias a resolver con el equipo

1. **Firebase vs Supabase.** Toda la documentación (MER, despliegue, clases, secuencia) nombra Supabase. El código usa Firestore. Hay que decidir cuál gana y corregir el otro lado; el patrón adaptador vuelve la decisión reversible si se implementa.
2. **Expo/React Native vs Web App.** RNF-02 exige "URL pública fija sin instalar nada". Expo Web lo cumple, pero el diagrama de despliegue dice frontend estático en Vercel.
3. **`T_DICT = 7` minutos** en `rutas.tsx` y `tormenta.tsx` contra los **10 minutos** de RF-21. Además RNF-09 pide que sea configurable, no una constante.
4. **`VEL` y `DIST_KM` son constantes inventadas** (auto 30 km/h, 1.6 km entre casos): la ruta es una estimación, no un cálculo geográfico. `index.html` sí llama a OSRM.
5. **Sin geolocalización ni distrito en `Reclamo`**: sin `lat`/`lng` no hay ruta real posible (RF-22, RF-26) ni filtro por distrito (RF-09, pedido explícito en la minuta).
6. **Modelo de datos divergente**: `Reclamo` usa `nsum` y no tiene `anio`, `distrito`, `origen_ingreso`, `foto_adjunta`. El MER exige la clave (`nro_reclamo_sua`, año) para RF-12.
7. **Credenciales de Firebase versionadas** en `services/firebase.ts`. Es una API key web (no es secreta por diseño), pero conviene moverla a variables de entorno y activar reglas de seguridad en Firestore.
