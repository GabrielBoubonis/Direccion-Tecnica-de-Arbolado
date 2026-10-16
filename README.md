# Sistema de Dictaminación Técnica de Arbolado Público

Dirección Técnica de Arbolado · Dirección General de Parques y Paseos · Municipalidad de Rosario.

Los ingenieros consultan las solicitudes de arbolado derivadas por el SUA, arman su ruta diaria,
completan y firman el dictamen técnico (también sin señal, desde el celular) y el resultado vuelve al
SUA. La Dirección sigue el trabajo en un tablero; el Administrador gestiona usuarios, captores y
auditoría.

## Qué hay en este repositorio

| Carpeta | Contenido |
|---|---|
| `DocumentacionDesarrollo/` | Especificación del sistema (requisitos, casos de uso, historias, arquitectura, ER, wireframes y devoluciones de la cátedra) |
| `backend/` | API REST: Node + TypeScript + Express + Prisma (PostgreSQL) |
| `frontend/` | PWA instalable: React + Vite, Workbox (service worker) y Dexie (IndexedDB cifrado con AES-GCM) |
| `api/` | Entrada de la API como función de Vercel |
| `datos-prueba/` | Datos ficticios de la especificación (42 solicitudes, 7 usuarios, dictámenes, captores, casos): los que carga la demo |
| `e2e/` | Pruebas punta a punta en navegador (Playwright), una por historia de usuario |

## Qué está simulado en la demo

- **SUA** y **Autenticación Institucional**: son sistemas externos; se reemplazan por bases simuladas
  (tablas `sim_*`) detrás de los mismos puertos que usaría la integración real
  (`backend/src/integraciones`). La pantalla **Simulador externo** permite derivar reclamos,
  re-derivarlos, mandar un registro inválido o hacer que un servicio "no responda".
- **Huella al firmar** (RF-51): el modal "Verificá tu identidad" es el del captor, pero no se lee
  ninguna huella; está indicado en pantalla.
- **Mapas**: con `ORS_API_KEY` se usa OpenRouteService. Sin clave (o con `MAPAS=prueba`) se usa un
  servicio de prueba con las coordenadas reales de las direcciones de los datos de prueba (tomadas
  una vez de OpenStreetMap) y distancias en línea recta con un factor de desvío.
- **Volver la demo al estado inicial**: el Administrador lo hace desde el Simulador externo. La base
  vuelve a los datos de prueba y se cierran todas las sesiones.

## Correrlo en una computadora

Requisitos: Node 20 o más. No hace falta instalar PostgreSQL.

```bash
npm install
node backend/scripts/postgres-local.mjs          # deja PostgreSQL corriendo en el puerto 54329
```

En otra terminal, con estas variables (o en un archivo `.env` en la raíz, que no se sube):

```bash
DATABASE_URL=postgresql://postgres:local@localhost:54329/arbolado
DIRECT_URL=postgresql://postgres:local@localhost:54329/arbolado
JWT_SECRETO=<una cadena larga al azar>
MAPAS=prueba                                      # o ORS_API_KEY=<clave> para OpenRouteService

npm run db:push && npm run db:seed                # esquema y datos de prueba
npm run dev                                       # API en :3000 y la app en :5173
```

Usuarios de prueba (contraseña `Demo2026!`): `mrossi0`, `cbenite0`, `lfernan0` (Operador),
`pgimene0` (Jefe), `asuarez0` (Administrador), `tmolina0` (Lector). `jdiaz0` (no vigente) y
`nmedina0` (sin cuenta) fallan a propósito.

## Pruebas

| Nivel | Comando | Qué cubre |
|---|---|---|
| Unitarias del servidor | `npm run test --workspace backend` | Reglas del dominio: firma, formulario, ruteo, tiempo, usuarios |
| Unitarias del cliente | `npm run test --workspace frontend` | Cifrado del captor, clave envuelta, firma idéntica a la del servidor, tiempo límite |
| Integración | `npm run test:integracion --workspace backend` | La API completa contra un PostgreSQL real con los datos de prueba |
| Navegador | `npm run test:e2e` | Cada historia en un Pixel 7 emulado, con y sin señal, y cada pantalla contra su wireframe |

Cada prueba lleva en su título los IDs que verifica (`[RF-21][CU-06 3.1][HU-06 c2] …`). Las pruebas
de integración y de navegador levantan cada vez su propio PostgreSQL temporal y cargan los datos de
prueba: no tocan ninguna base existente.

## Publicación (Vercel + Supabase)

Se cargan en Vercel `DATABASE_URL` y `DIRECT_URL` (las dos del *pooler* de Supabase), `JWT_SECRETO`
y, si se quiere, `ORS_API_KEY`, y se vuelve a desplegar. El build (`npm run vercel-build`) compila la app y la API y
prepara la base (`backend/scripts/preparar-base.ts`): aplica el esquema y los índices y, si la base está
vacía, carga los datos de prueba. Todo queda en el esquema propio `arbolado`: el sistema no toca
`public` ni ningún otro esquema de la base. `vercel.json` publica la app y la API (`/api`) con las
cabeceras de seguridad (RNF-21).
