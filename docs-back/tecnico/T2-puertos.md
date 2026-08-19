# T2 — Los trece puertos

> Diseño técnico · Última actualización: 19/08/2026 · Estado: **sin aprobar**
> Responde: qué interfaz existe, qué método tiene, qué recibe, qué devuelve y qué adaptador la implementa.

---

## 1. Por qué trece y no dos

El documento académico previó dos interfaces —`IReclamoProvider` e `IAuthProvider`— asumiendo que Supabase se quedaba como base propia del módulo y que solo había que reemplazar los conectores externos.

La premisa real es otra: **Supabase se va entero** el día hipotético de la transferencia. Base, autenticación y storage son andamio. Con solo dos adaptadores habría que reescribir toda la capa de persistencia justo el día que RNF-08 promete que no hace falta.

Por eso **todo acceso a datos vive detrás de un puerto**. Queda registrado como desvío DV-01, y es de los que *fortalecen* el análisis: muestra que el diseño tomó en serio su propia restricción.

El decimotercero, `IGeocodificador`, apareció con el relevamiento del 18/08: el SUA guarda la dirección escrita del ejemplar y **ninguna coordenada**, porque el censo de arbolado nunca se geolocalizó (B-02, DV-12). Convertir "Mendoza 3450" en un punto es trabajo del módulo, no un dato de entrada.

## 2. Tabla de puertos

| Puerto | Responsabilidad | Adaptador activo | El día de la muni |
| --- | --- | --- | --- |
| `IReclamoProvider` | Leer reclamos del sistema de origen y actualizar su estado | `SuaSimuladoAdapter` | `SuaMunicipalAdapter` |
| `IAuthProvider` | Validar credenciales y devolver identidad | `SupabaseAuthAdapter` | `AuthInstitucionalAdapter` |
| `IPerfilRepository` | Roles, legajos, distrito asignado | `PostgresPerfilAdapter` | `DirectorioInstitucionalAdapter` |
| `IDictamenRepository` | Persistir y consultar dictámenes | `PostgresDictamenAdapter` | idem contra base muni |
| `IReservaRepository` | Tomar, consultar y liberar reservas | `PostgresReservaAdapter` | idem contra base muni |
| `IRutaRepository` | Persistir rutas, paradas y jornadas | `PostgresRutaAdapter` | idem contra base muni |
| `IGeoRepository` | Puntos geográficos de los reclamos | `PostgresGeoAdapter` | idem contra base muni |
| `IArchivoStorage` | Fotos de campo y trazos de firma | `SupabaseStorageAdapter` | `FileServerMuniAdapter` |
| `IRuteoProvider` | Matriz de tiempos, orden óptimo, geometría | `OsrmAdapter` | `GoogleRoutesAdapter` |
| `IGeocodificador` | Dirección escrita → punto del mapa | `NominatimAdapter` | `GeocodificadorMuniAdapter` |
| `IParametroRepository` | Parámetros de negocio y reglas configurables | `PostgresParametroAdapter` | idem contra base muni |
| `IAuditoriaRepository` | Registro de acciones sensibles | `PostgresAuditoriaAdapter` | idem contra base muni |
| `IRelojProvider` | Fecha y hora actual | `RelojSistema` | idem |
| `ICertificadoraFirma` | Certificación oficial de la firma | **sin implementar** (placeholder) | organismo certificador |

> Son catorce filas para trece puertos más el placeholder: `ICertificadoraFirma` se cuenta aparte porque **no tiene implementación y se declara así de frente**. El sistema captura la firma, la vincula al agente, le pone sello de tiempo y la vuelve inmutable, pero **no la certifica ante ningún organismo oficial**. Presentarla como firma con validez legal plena sería falso.

---

## 3. Tipos compartidos

```ts
// core/dominio/tipos.ts
export type ClaveReclamo = { nroSua: string; anio: number };

export type Prioridad  = 'verde' | 'amarillo' | 'naranja' | 'rojo';
export type Rol        = 'lector' | 'operario' | 'jefe' | 'administrador';
export type Distrito   = 'Centro' | 'Norte' | 'Noroeste' | 'Oeste' | 'Sudoeste' | 'Sur';
export type EstadoModulo = 'sin_dictaminar' | 'reservado' | 'dictaminado' | 'vencido_redictaminar';
export type Categoria  = 'riesgo_estructural' | 'cableado' | 'infraestructura'
                       | 'obstruccion' | 'poda_estetica';
export type ModoTraslado = 'auto' | 'pie' | 'bicicleta';
export type Punto = { lat: number; lng: number };
export type PrecisionPunto = 'exacta' | 'aproximada' | 'solo_calle' | 'fallida';
```

---

## 4. Los puertos, uno por uno

### 4.1 `IReclamoProvider`

Es la frontera con el mundo externo. **Hoy escribe en el esquema `sua_sim`; mañana llama al SUA real.**

```ts
export interface FiltroReclamos {
  estados?: EstadoModulo[];
  distritos?: Distrito[];
  prioridades?: Prioridad[];
  categorias?: Categoria[];
  soloTormenta?: boolean;
  antiguedadMinimaMeses?: number;
  calle?: string; altura?: number;      // consulta por dirección (pedido de la minuta)
  limite: number; desplazamiento: number;
}

export interface IReclamoProvider {
  buscarPorClave(clave: ClaveReclamo): Promise<ReclamoOrigen | null>;
  listar(filtro: FiltroReclamos): Promise<{ items: ReclamoOrigen[]; total: number }>;
  marcarDictaminado(clave: ClaveReclamo, ref: RefDictamen): Promise<void>;
  crear(alta: AltaReclamo): Promise<ClaveReclamo>;
}
```

**`crear` existe por una razón funcional, no técnica.** El ingeniero puede abrir un reclamo en tres situaciones —de oficio, a pedido de un vecino que lo aborda en la calle, y durante el protocolo de tormenta (D-18)— y ese reclamo **se crea a través de este puerto** para que entre al circuito formal del SUA. Sin esto, el ingeniero dictaminaría un árbol cuyo expediente no existe y ninguna cuadrilla podría intervenirlo legalmente.

**`marcarDictaminado` es el que sostiene el argumento del proyecto.** Es la escritura que elimina la transcripción manual del papel al SUA (RF-20). El CIL confirmó que el SUA acepta que un sistema externo cambie el estado de una solicitud cuando sus administradores ceden los permisos (B-01, D-45).

`ReclamoOrigen` **no tiene coordenadas**: el SUA no las da (B-02). Trae `direccionExacta`, `calle`, `altura`, `distrito`, `barrio` y `descripcionMotivo` en texto libre.

### 4.2 `IAuthProvider`

```ts
export interface IAuthProvider {
  autenticar(identificador: string, password: string): Promise<Identidad | null>;
  validarToken(token: string): Promise<Identidad | null>;
  invalidarToken(token: string): Promise<void>;
}
export type Identidad = { usuarioId: string; identificador: string };
```

**Recibe un `identificador` opaco, no un "email"** (D-09). Fue la decisión que mejor envejeció del proyecto: el supuesto era "correo institucional" y la respuesta del CIL fue "usuario de red con la forma `gboubon0`" (B-04). No hubo que rehacer nada.

El `SupabaseAuthAdapter` necesita internamente un correo, así que **le agrega el dominio reservado `@arbolado.test`**. Ese armado vive dentro del adaptador: ni el núcleo ni el front lo conocen, y se va con Supabase el día de la transferencia.

El puerto devuelve **identidad, no rol**. El rol vive en `IPerfilRepository`, del lado del módulo, porque el directorio institucional no sabe nada de roles de arbolado.

### 4.3 `IPerfilRepository`

```ts
export interface IPerfilRepository {
  porUsuarioId(usuarioId: string): Promise<Perfil | null>;
  listar(filtro?: { rol?: Rol; activo?: boolean }): Promise<Perfil[]>;
  guardar(perfil: Perfil): Promise<void>;
  desactivar(usuarioId: string): Promise<void>;
}
export type Perfil = {
  usuarioId: string; identificador: string; legajo: string;
  nombreApellido: string; rol: Rol;
  distritoAsignado: Distrito | null;   // precarga filtros, no restringe
  activo: boolean;
};
```

**No hay campo de matrícula ni de habilitación individual.** Firmar es atributo del rol: firman Operario y Jefe (D-50). Es el desvío más fuerte del proyecto y está documentado en DV-10 con lo que se pierde.

### 4.4 `IDictamenRepository`

```ts
export interface IDictamenRepository {
  porId(id: string): Promise<Dictamen | null>;
  vigentePorReclamo(clave: ClaveReclamo): Promise<Dictamen | null>;
  historialPorReclamo(clave: ClaveReclamo): Promise<Dictamen[]>;
  guardarFirmado(d: Dictamen): Promise<void>;
  anular(id: string, motivo: string, porUsuario: string): Promise<void>;
  proximosAVencer(dias: number): Promise<Dictamen[]>;
  vencidosAlDia(hoy: Date): Promise<Dictamen[]>;
  guardarBorrador(b: DictamenBorrador): Promise<void>;
}
```

**No existe `actualizar`.** Un dictamen firmado no se modifica: lo impide una regla en la base, no una convención del código (RF-19, RNF-06). Corregir implica anular y emitir uno nuevo, y ambos quedan en el historial. Que el puerto **no tenga** el método es la primera barrera; el trigger de la base es la última.

### 4.5 `IReservaRepository`

```ts
export interface IReservaRepository {
  tomar(claves: ClaveReclamo[], usuarioId: string, venceEn: Date, rutaId?: string)
    : Promise<{ tomadas: ClaveReclamo[]; ocupadas: ReservaAjena[] }>;
  activaDe(clave: ClaveReclamo): Promise<Reserva | null>;
  activasDe(usuarioId: string): Promise<Reserva[]>;
  todasActivas(): Promise<Reserva[]>;              // el Jefe ve el reparto del día
  liberar(id: string, motivo: MotivoLiberacion): Promise<void>;
  liberarVencidas(hasta: Date): Promise<number>;
}
export type MotivoLiberacion = 'dictaminado' | 'vencida' | 'manual' | 'liberada_por_admin';
```

**`tomar` recibe varias claves y devuelve dos listas.** Si se piden diez reclamos y dos ya están tomados, **se reservan los ocho disponibles y se informa cuáles no**; no se cae la operación entera por uno. En la calle, una jornada que falla completa porque un caso estaba ocupado es una jornada perdida.

`ReservaAjena` incluye **quién la tiene y desde cuándo**, porque la reserva es visible para todo el equipo (D-15) y el front tiene que poder mostrarlo sin otra consulta.

### 4.6 `IRutaRepository`

```ts
export interface IRutaRepository {
  crearJornada(j: Jornada): Promise<string>;
  jornada(id: string): Promise<Jornada | null>;
  actualizarJornada(j: Jornada): Promise<void>;
  confirmar(id: string, ruta: RutaCalculada): Promise<void>;
  rutaDe(id: string): Promise<Ruta | null>;
  rutasDe(usuarioId: string, desde: Date, hasta: Date): Promise<Ruta[]>;
  marcarVisitado(rutaId: string, clave: ClaveReclamo, cuando: Date): Promise<void>;
  purgarAnterioresA(fecha: Date): Promise<number>;   // retención (T10)
}
```

La ruta guarda **la geometría calculada, no la receta para recalcularla**. Es un pedido explícito de la minuta: *"el mapa va a tener que quedar igual hasta que se oprima un botón de restablecer, porque ese mapa es el que tienen que seguir todo el día"*. Si el front recalculara en cada render, el mapa cambiaría solo. Persistirla lo vuelve imposible por diseño.

### 4.7 `IGeoRepository`

```ts
export interface IGeoRepository {
  punto(clave: ClaveReclamo): Promise<PuntoReclamo | null>;
  puntos(claves: ClaveReclamo[]): Promise<Map<string, PuntoReclamo>>;
  guardar(p: PuntoReclamo): Promise<void>;
  corregir(clave: ClaveReclamo, punto: Punto, porUsuario: string): Promise<void>;
  sinPunto(limite: number): Promise<ClaveReclamo[]>;
  cercanos(punto: Punto, metros: number): Promise<ClaveReclamo[]>;
}
export type PuntoReclamo = {
  clave: ClaveReclamo; punto: Punto;
  precision: PrecisionPunto;
  origen: 'geocodificado' | 'corregido_por_usuario';
  direccionNormalizada: string; proveedor: string; geocodificadoEn: Date;
  corregidoPor?: string; corregidoEn?: Date;
};
```

**`corregir` nunca la pisa una geocodificación posterior.** El ingeniero está parado frente al árbol: es la única persona con el dato bueno. La corrección ocurre en la pantalla de pre-confirmación de la jornada (D-53), que es el último momento con señal y con el mapa a la vista.

### 4.8 `IArchivoStorage`

```ts
export interface IArchivoStorage {
  subir(bucket: Bucket, ruta: string, contenido: Uint8Array, tipoMime: string): Promise<string>;
  urlFirmada(bucket: Bucket, ruta: string, segundos: number): Promise<string>;
  borrar(bucket: Bucket, ruta: string): Promise<void>;
}
export type Bucket = 'fotos-dictamen' | 'firmas' | 'entregables';
```

**Ningún bucket es público.** Una foto de campo puede mostrar el frente de la casa de un vecino: es dato personal y no se sirve por URL adivinable. Las URLs se firman con vencimiento corto (T10).

### 4.9 `IRuteoProvider`

```ts
export interface IRuteoProvider {
  matrizTiempos(puntos: Punto[], modo: ModoTraslado): Promise<number[][]>;  // segundos
  geometria(ordenados: Punto[], modo: ModoTraslado): Promise<string>;       // polilínea
  nombre(): 'osrm' | 'google';
}
```

**Dos implementaciones reales, y ahí está RF-32.** `GoogleRoutesAdapter` queda escrito y seleccionable por configuración, pero sin credenciales: es lo que la Municipalidad contrataría. `OsrmAdapter` queda activo para la demo. Cambiar de uno a otro es cambiar un parámetro en el panel de administración, sin desplegar, y es demostrable en vivo frente al profesor.

El puerto devuelve **matriz y geometría por separado** a propósito: el orden de visita lo decide el núcleo (T7), no el proveedor. Si el orden lo resolviera el proveedor, el balanceador y las directivas de jornada quedarían fuera del dominio y dentro de una caja negra de un tercero.

### 4.10 `IGeocodificador`

```ts
export interface IGeocodificador {
  geocodificar(d: DireccionRosario): Promise<ResultadoGeocodificacion>;
  nombre(): string;
}
export type DireccionRosario = {
  calle: string; altura?: number;
  entreCalle1?: string; entreCalle2?: string; distrito?: Distrito;
};
export type ResultadoGeocodificacion =
  | { ok: true;  punto: Punto; precision: Exclude<PrecisionPunto,'fallida'>; normalizada: string }
  | { ok: false; precision: 'fallida'; motivo: string };
```

**Devuelve la precisión, no solo el punto.** Un reclamo con precisión `solo_calle` se dibuja distinto en el mapa y el ingeniero sabe que tiene que buscar el ejemplar en la cuadra. Un punto falsamente exacto es peor que un punto declarado dudoso.

### 4.11 `IParametroRepository`

```ts
export interface IParametroRepository {
  todos(): Promise<Map<string, string>>;
  numero(clave: string, porDefecto: number): Promise<number>;
  texto(clave: string, porDefecto: string): Promise<string>;
  booleano(clave: string, porDefecto: boolean): Promise<boolean>;
  guardar(clave: string, valor: string, porUsuario: string): Promise<void>;
  reglasPrioridad(): Promise<ReglaPrioridad[]>;
  reglasComplejidad(): Promise<ReglaComplejidad[]>;
  configFirma(): Promise<ConfigFirma>;
}
```

Es RNF-09 y RF-32 hechos interfaz: cambiar el negocio sin tocar código. Las reglas de prioridad y los cortes de complejidad viven en tabla, no en constantes, y **se ajustan sin desplegar**.

### 4.12 `IAuditoriaRepository`

```ts
export interface IAuditoriaRepository {
  registrar(e: EventoAuditoria): Promise<void>;
  consultar(f: FiltroAuditoria): Promise<EventoAuditoria[]>;
}
export type AccionAuditada =
  | 'firma_dictamen' | 'anulacion_dictamen' | 'cambio_rol' | 'cambio_parametro'
  | 'cambio_config_firma' | 'reserva_tomada' | 'reserva_liberada'
  | 'alta_reclamo' | 'correccion_punto' | 'correccion_categoria'
  | 'generacion_entregable' | 'login_fallido';
```

No hay método de borrado ni de actualización. **Nadie escribe la auditoría directo**: se escribe desde el caso de uso y se lee desde el panel del Administrador.

No es burocracia: es un sistema que emite documentos con validez legal. Si alguien pregunta quién autorizó extraer un árbol de treinta años, tiene que haber respuesta.

### 4.13 `IRelojProvider`

```ts
export interface IRelojProvider { ahora(): Date; hoy(): string; }  // hoy: 'AAAA-MM-DD'
```

Parece exagerado para dos líneas, pero **sin él RF-11 y RF-19 no son verificables**. El driver necesita poder decir "hacé de cuenta que pasaron catorce meses" para comprobar la secuencia completa de saltos de prioridad y el vencimiento del dictamen. Con `new Date()` incrustado en el núcleo, esas dos reglas solo se podrían probar esperando catorce meses.

`RelojFijo` es el adaptador que usa el driver. Es la única razón de existir del puerto, y alcanza.

### 4.14 `ICertificadoraFirma` — el placeholder declarado

```ts
export interface ICertificadoraFirma {
  certificar(hash: string, firmante: DatosFirmante): Promise<Certificacion>;
  disponible(): boolean;   // hoy: siempre false
}
```

Existe **sin implementación**, y eso es una decisión, no un olvido. El apartado de configuración de firma digital (D-51) tiene un campo `exige_certificacion` que hoy está en falso; el día que la repartición contrate un certificador, se escribe el adaptador, se lo elige en el panel y se enciende el campo. Ese es todo el cambio.

---

## 5. Composición: el único archivo que sabe de proveedores

```ts
// composicion/contenedor.ts
export async function armarContenedor(env: Env): Promise<Contenedor> {
  const parametros = new PostgresParametroAdapter(env);
  const cfg = await parametros.todos();

  return {
    reclamos:   new SuaSimuladoAdapter(env),
    auth:       new SupabaseAuthAdapter(env),
    ruteo:      cfg.get('adaptador_ruteo') === 'google'
                  ? new GoogleRoutesAdapter(env) : new OsrmAdapter(env),
    geo:        cfg.get('adaptador_geocodificacion') === 'muni'
                  ? new GeocodificadorMuniAdapter(env) : new NominatimAdapter(env),
    reloj:      new RelojSistema(),
    /* … el resto de los adaptadores … */
  };
}
```

Ochenta líneas, un solo archivo, y es **el mapa completo de qué tecnología usa el sistema**. Para saber de qué depende el proyecto no hace falta leer el código: se lee este archivo.

El día de la transferencia se reescribe este archivo y los adaptadores nuevos. El núcleo, los casos de uso y las reglas quedan intactos. Eso **es** RNF-08, y es verificable: si algún día hace falta tocar `core/` para cambiar de proveedor, el diseño falló.
