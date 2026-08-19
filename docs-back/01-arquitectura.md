# Arquitectura del backend

> Última actualización: 19/08/2026 · Estado: **en diseño, sin aprobar**

## 1. La premisa que ordena todo

La conexión real a la infraestructura municipal **no se va a realizar**. Supabase no es "la base del sistema": es un andamio que simula al SUA, a la autenticación institucional, al file server y a la base propia del módulo, todo junto. El día hipotético de la transferencia, Supabase **se va entero**.

Eso descarta la arquitectura del documento original, que preveía solo dos adaptadores (`IReclamoProvider` y `IAuthProvider`) y daba por sentado que dictámenes y rutas se quedaban en Supabase. Si Supabase se va completo, esa premisa se cae: **todo acceso a datos va detrás de un puerto**.

> Este es un desvío consciente respecto del documento académico. Queda registrado en `99-desvios.md`.

## 2. Arquitectura hexagonal (puertos y adaptadores)

```
                    ┌─────────────────────────────────────┐
   index.html  ───► │  ENTRYPOINT HTTP (cáscara fina)     │
   login.html       │  parsea · autentica · serializa     │
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────▼──────────────────┐
                    │  CASOS DE USO                       │
                    │  EmitirDictamen · PlanificarRuta    │
                    │  ConsultarReclamos · TomarTrabajo   │
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────▼──────────────────┐
                    │  NÚCLEO DE DOMINIO                  │
                    │  reglas puras, sin infraestructura  │
                    │  escalamiento · exclusiones ·       │
                    │  vencimiento · balanceador          │
                    └──────────────────┬──────────────────┘
                                       │  depende solo de interfaces
                    ┌──────────────────▼──────────────────┐
                    │  PUERTOS (interfaces)               │
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────▼──────────────────┐
                    │  ADAPTADORES                        │
                    │  único lugar con nombre de proveedor│
                    └─────────────────────────────────────┘
```

La dependencia apunta **siempre hacia adentro**. El núcleo no sabe que existe Postgres, ni HTTP, ni Deno.

### Puertos definidos

| Puerto | Responsabilidad | Adaptador activo | Adaptador de producción |
| --- | --- | --- | --- |
| `IReclamoProvider` | Leer reclamos y actualizar su estado en el sistema de origen | `SuaSimuladoAdapter` | `SuaMunicipalAdapter` |
| `IAuthProvider` | Validar credenciales y devolver identidad | `SupabaseAuthAdapter` | `AuthInstitucionalAdapter` |
| `IDictamenRepository` | Persistir y consultar dictámenes | `PostgresDictamenAdapter` | idem contra base muni |
| `IRutaRepository` | Persistir rutas y su detalle | `PostgresRutaAdapter` | idem contra base muni |
| `IReservaRepository` | Tomar, consultar y liberar reservas de trabajo | `PostgresReservaAdapter` | idem contra base muni |
| `IPerfilRepository` | Roles, legajos y habilitación para firmar | `PostgresPerfilAdapter` | `DirectorioInstitucionalAdapter` |
| `IArchivoStorage` | Fotos de campo y firmas | `SupabaseStorageAdapter` | `FileServerMuniAdapter` |
| `IRuteoProvider` | Matriz de tiempos, orden óptimo y geometría | `OsrmAdapter` (activo) | `GoogleRoutesAdapter` (escrito, sin conectar) |
| `IParametroRepository` | Parámetros de negocio configurables | `PostgresParametroAdapter` | idem contra base muni |
| `IAuditoriaRepository` | Registro de acciones sensibles | `PostgresAuditoriaAdapter` | idem contra base muni |
| `IRelojProvider` | Fecha y hora actual | `RelojSistema` | idem |
| `ICertificadoraFirma` | Certificación oficial de la firma | **sin implementar (placeholder)** | organismo certificador |
| `IGeocodificador` | Convertir una dirección escrita en un punto del mapa | `NominatimAdapter` | `GeocodificadorMuniAdapter` |

Tres detalles deliberados:

- **`IRuteoProvider` con dos implementaciones reales.** `GoogleRoutesAdapter` queda escrito y seleccionable por configuración, pero sin credenciales: es lo que la muni contrataría. `OsrmAdapter` queda activo para demostrar el funcionamiento. Cambiar de uno a otro es un parámetro, no un deploy. Esto **es** RF-32, demostrable en vivo.
- **`IRelojProvider`.** Parece exagerado, pero sin él no se pueden testear el escalamiento cada 2 meses ni el vencimiento a 18 meses: el driver necesita poder decir "hacé de cuenta que pasaron 14 meses". Sin esto, RF-11 y RF-19 no son verificables.
- **`IGeocodificador`, que no estaba previsto.** El SUA guarda la dirección escrita del ejemplar y ninguna coordenada, porque el censo de arbolado nunca se geolocalizó (B-02). Convertir "Mendoza 3450" en un punto es entonces trabajo del módulo, no un dato de entrada. Va detrás de un puerto por la misma razón que todo lo demás: en la demo resuelve un proveedor abierto, y el día de la transferencia la Municipalidad tiene su propio geocodificador, que conoce la nomenclatura catastral de Rosario mucho mejor. El detalle de cómo se guarda y se corrige el punto está en `02-modelo-de-datos.md` §4.

### La regla que se verifica sola

`core/` no puede importar infraestructura. El driver incluye un escenario estructural que recorre los archivos y falla si encuentra un import prohibido fuera de `adapters/`. Una regla que no se verifica se rompe sola en dos semanas.

## 3. Por qué el runtime también es reemplazable

La API va a correr como Supabase Edge Functions (Deno). Si Supabase se va, el runtime también se va — es una limitación honesta de la decisión.

Se resuelve manteniendo el entrypoint como **cáscara fina**: parsea la request, valida el token, llama al caso de uso, serializa la respuesta. Cero lógica. Mudar el sistema a Node, a un servidor municipal o a cualquier serverless es reescribir esa cáscara, que son unas pocas decenas de líneas, y dejar intactos núcleo y casos de uso.

## 4. Principio de campo: se toma con señal, se ejecuta sin señal

Este principio surgió de una observación del análisis funcional y reemplaza a la resolución de conflictos por fusión, que era el enfoque inicial.

**Un reclamo apunta a un único árbol.** Dos ingenieros dictaminando el mismo ejemplar no es un conflicto de datos a resolver: es trabajo desperdiciado que hay que **evitar antes de que ocurra**. Y evitarlo es posible porque pedir trabajo es, por naturaleza, una acción conectada: el ingeniero le pide al sistema qué hacer.

De ahí la regla:

| Acción | ¿Necesita señal? | Por qué |
| --- | --- | --- |
| Tomar trabajo (planificar ruta, tomar un reclamo suelto) | **Sí** | Es pedirle al sistema una asignación exclusiva |
| Consultar los reclamos ya tomados | No | Viajan cacheados en el dispositivo |
| Cargar y firmar el dictamen de un reclamo tomado | **No** | Nadie más puede tenerlo |
| Dar de alta un reclamo de oficio | No | Es nuevo, nadie más puede tenerlo |
| Enviar lo cargado | No (se encola) | Se sincroniza solo cuando vuelve la conexión |

**Consecuencias de diseño:**

1. No se puede dictaminar un reclamo que no esté reservado a nombre del ingeniero. La reserva es requisito previo, no una comodidad.
2. El choque deja de ser el caso normal y pasa a ser una excepción rara: reserva vencida durante la jornada, liberación manual por un administrador, o dos altas de oficio sobre el mismo árbol. Igual se maneja, pero como excepción.
3. **Manejo de la excepción:** el sistema rechaza el segundo dictamen, informa quién y cuándo dictaminó primero, y **conserva la carga como borrador** para que el ingeniero no pierda el trabajo hecho frente al árbol y pueda consultarlo o reasignarlo.
4. Las reservas **vencen solas** al cierre de la jornada (configurable, RNF-09). Nada queda bloqueado para siempre si alguien se enferma o pierde el teléfono.
5. Mientras está reservado, el resto del equipo **lo ve tomado**, con quién lo tiene y desde cuándo. El jefe ve el reparto del día de un vistazo.

## 5. Separación de esquemas: la frontera se ve en la base

La base se divide en dos esquemas, y esa división es la frontera con el mundo externo hecha visible:

| Esquema | Contiene | El día de la muni |
| --- | --- | --- |
| `sua_sim` | Reclamos simulados: lo que el SUA nos daría | **Se borra entero.** Lo reemplaza el adaptador contra los endpoints reales |
| `arbolado` | Datos propios del módulo: dictámenes, rutas, reservas, perfiles, parámetros, auditoría | Migra a la base municipal |

Ningún caso de uso consulta `sua_sim` directamente: solo lo hace `SuaSimuladoAdapter`. Se puede demostrar en la defensa borrando el esquema `sua_sim` y mostrando que lo único que se rompe es un adaptador.

**Corolario importante:** la prioridad por colores y su escalamiento **son lógica nuestra, no del SUA**. El SUA real no tiene matriz de priorización — es justamente una de las mejoras propuestas en el relevamiento. Por eso la prioridad vigente de cada reclamo vive en `arbolado`, no en `sua_sim`. Así el sistema sigue funcionando igual cuando lo conecten a un SUA que no sabe nada de colores.

## 6. Flujo de una request

```
navegador  ──►  Edge Function  ──►  caso de uso  ──►  puerto  ──►  adaptador  ──►  Postgres / OSRM
              │                                                                          │
              │  1. valida JWT y extrae rol                                              │
              │  2. valida forma de la entrada                                           │
              │  3. verifica idempotencia                                                │
              │  4. llama al caso de uso  ─────────────────────────────────────────────► │
              │  5. registra auditoría si la acción es sensible                          │
              └──────────────────────────────────────────────────────────────────────────┘
```

**Defensa en profundidad:** el rol se valida en la Edge Function *y* las políticas RLS de Postgres lo vuelven a validar. Si un día alguien expone la base directamente o se filtra un token, RLS sigue conteniendo. Ninguna tabla queda sin política.

## 7. Qué se migra del front al backend

El front conserva su aspecto y su comportamiento visible. Lo que se muda es la lógica que hoy vive suelta en el JavaScript de `index.html`:

| Hoy en `index.html` | Se muda a | Por qué |
| --- | --- | --- |
| `recalcularPrioridadesPorTiempo()` | job diario en el backend | Debe correr aunque nadie abra la página (RF-11) |
| `actualizarBalanceador()` | caso de uso `PlanificarRuta` | Es regla de negocio y debe ser testeable (RF-23) |
| `calcularRutaOptima()` | caso de uso + `IRuteoProvider` | El % de eficiencia tiene que ser auditable (RF-26) |
| `validarReclamoSua()` | caso de uso `ValidarReclamo` | Requiere consultar el origen de verdad (RF-12) |
| `sugerirEpoca()` | núcleo de dominio | Regla forestal, no presentación (RF-16) |
| `renderCheckboxesExcluyentes()` | **se queda, y se duplica en el backend** | La UX inmediata es del front; la garantía es del backend (RF-14) |
| objeto `DB` simulado | desaparece | Lo reemplaza el SDK contra la API |

La última fila es una regla general: **toda validación que el front hace por comodidad, el backend la repite por obligación.** El front valida para que el usuario no se equivoque; el backend valida porque no puede confiar en el cliente.

## 8. Lo que todavía no está decidido

- Contrato exacto de los endpoints → `03-contrato-api.md`
- Estructura y política de reintentos de la cola offline → `04-offline-y-sincronizacion.md`
- Formato y alcance del registro de auditoría → `07-seguridad-y-privacidad.md`
- Cómo se genera la geolocalización de los reclamos inventados → `05-datos-semilla.md`
