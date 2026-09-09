# Diagramas del sistema (fuente PlantUML)

Render online: <https://www.plantuml.com/plantuml/uml/>

Los SVG ya renderizados viven en la raíz del proyecto.

## Diagrama de casos de uso

```plantuml
@startuml
left to right direction
skinparam packageStyle rectangle
actor Lector
actor Operario
actor Administrador
actor "SUA\n(sistema externo)" as SUA
actor "Autenticación\nInstitucional" as AuthInst
rectangle "Sistema de Dictaminado y Rutas Eficientes" {
usecase "CU-01 Iniciar sesión" as CU01
usecase "CU-02 Consultar dashboard\ny métricas" as CU02
usecase "CU-03 Consultar y filtrar\nreclamos sin dictaminar" as CU03
usecase "CU-04 Emitir dictamen técnico" as CU04
usecase "Firmar dictamen\ndigitalmente" as CU04b
usecase "CU-05 Planificar\nruta eficiente" as CU05
usecase "CU-06 Configurar\nbalanceador de carga" as CU06
usecase "CU-07 Gestionar urgencia\npor tormenta" as CU07
usecase "CU-08 Gestionar\nusuarios y roles" as CU08
usecase "CU-09 Configurar parámetros\ny conectores" as CU09
}
Lector --> CU01
Lector --> CU02
Operario --> CU01
Operario --> CU02
Operario --> CU03
Operario --> CU04
Operario --> CU05
Operario --> CU06
Operario --> CU07
Administrador --> CU01
Administrador --> CU08
Administrador --> CU09
CU04 ..> CU04b : <<extend>>\n(requiere matrícula)
CU03 ..> CU01 : <<include>>
CU04 ..> CU01 : <<include>>
CU05 ..> CU01 : <<include>>
CU06 ..> CU05 : <<extend>>
CU03 --> SUA : consulta reclamos
CU04 --> SUA : actualiza estado
CU01 --> AuthInst : valida credenciales
@enduml
```

## Modelo Entidad-Relación

SVG renderizado: `../Diagrama Entidad-Relacion.svg`

```plantuml
@startuml
title
Modelo Entidad-Relación
Sistema de Dictaminado y Rutas Eficientes — Parques y Paseos
end title
skinparam monochrome true
skinparam shadowing false
entity RECLAMO {
* nro_reclamo_sua : varchar <<PK>>
--
fecha_ingreso : datetime
origen_ingreso : varchar
direccion_exacta : varchar
distrito : varchar
descripcion_motivo : text
foto_adjunta : varchar
estado_sua : varchar
}
entity DICTAMEN_TECNICO {
* id_dictamen : integer <<PK>>
--
fecha_dictamen : datetime
especie : varchar
altura_aproximada : varchar
estado_copa : varchar
estado_tronco : varchar
estado_raices : varchar
inclinacion_ejemplar : varchar
accion_requerida : varchar
observaciones_tecnicas : text
firma_digital : varchar
nro_reclamo_sua : varchar <<FK>>
usuario_agente : varchar <<FK>>
}
entity USUARIO_AGENTE {
* usuario_agente : varchar <<PK>>
--
legajo : varchar
nombre_apellido : varchar
rol_institucional : varchar
}
entity RUTA_INSPECCION {
* id_ruta : integer <<PK>>
--
fecha_planificacion : date
estado_ruta : varchar
usuario_agente : varchar <<FK>>
}
entity DETALLE_RUTA {
* id_detalle : integer <<PK>>
--
orden_visita : integer
visitado : boolean
id_ruta : integer <<FK>>
nro_reclamo_sua : varchar <<FK>>
}
entity ASIGNACION_INTERNA {
* id_asignacion : integer <<PK>>
--
area_origen : varchar
area_destino : varchar
fecha_pase : datetime
nro_reclamo_sua : varchar <<FK>>
}
' --- RELACIONES CON SINTAXIS IE (PATITAS DE GALLO) ---
RECLAMO ||--o| DICTAMEN_TECNICO : "posee"
USUARIO_AGENTE ||--o{ DICTAMEN_TECNICO : "genera"
USUARIO_AGENTE ||--o{ RUTA_INSPECCION : "tiene"
RUTA_INSPECCION ||--|{ DETALLE_RUTA : "contiene"
RECLAMO ||--o{ DETALLE_RUTA : "se asigna a"
RECLAMO ||--o{ ASIGNACION_INTERNA : "registra"
@enduml
```

## Secuencia — Login

SVG renderizado: `../Login.svg`

```plantuml
@startuml
actor Usuario
participant "Frontend (Web/App)" as FE
participant "Backend API" as BE
participant "AuthAdapter\n(implementa IAuthProvider)" as AuthAdapter
participant "Supabase Auth\n(implementación de prototipo)" as SupaAuth
database "Supabase (perfiles/roles)" as DB
Usuario -> FE: Ingresa usuario y contraseña
FE -> BE: POST /login {usuario, password}
BE -> AuthAdapter: validarCredenciales()
AuthAdapter -> SupaAuth: sign in (usuario, password)
SupaAuth --> AuthAdapter: OK / inválidas
alt credenciales válidas
AuthAdapter --> BE: usuario validado
BE -> DB: buscar perfil y rol vinculado
DB --> BE: perfil {rol: Lector/Operario/Administrador}
BE -> BE: generar token JWT
BE --> FE: 200 OK {token, rol}
FE --> Usuario: redirige al Home según rol
else credenciales inválidas
AuthAdapter --> BE: error
BE --> FE: 401 mensaje genérico
FE --> Usuario: muestra error
end
note over AuthAdapter, SupaAuth
En producción, este mismo flujo se resuelve con
un adaptador que implemente IAuthProvider contra
el sistema de autenticación institucional (RF-32).
El resto del diagrama no cambia.
end note
@enduml
```

## Secuencia — Emitir dictamen técnico

SVG renderizado: `../Emitir dictamen tecnico.svg`

```plantuml
@startuml
actor Operario
participant "Frontend" as FE
participant "Backend API" as BE
participant "SUAAdapter\n(implementa IReclamoProvider)" as SUAAdapter
database "Supabase\n(reclamos simulados, hacen de SUA)" as SupaSUA
database "Supabase (dictámenes propios)" as DB
Operario -> FE: Ingresa N° SUA + año
FE -> BE: POST /dictamen/validar {nro_sua, anio}
BE -> SUAAdapter: consultarReclamo(nro_sua, anio)
SUAAdapter -> SupaSUA: query reclamo simulado
SupaSUA --> SUAAdapter: datos del reclamo
SUAAdapter --> BE: reclamo (estado: sin dictaminar)
alt reclamo válido y sin dictaminar
BE --> FE: datos precargados
Operario -> FE: completa ejemplar, intervención, fotos, urgencia
Operario -> FE: firma digital (matrícula)
FE -> BE: POST /dictamen {datos, firma}
BE -> BE: validar matrícula registrada
BE -> DB: guardar dictamen (hash, timestamp, inmutable)
DB --> BE: OK
BE -> SUAAdapter: actualizarEstado(nro_sua, "dictaminado")
SUAAdapter -> SupaSUA: update estado (simulado)
BE --> FE: 200 OK dictamen guardado
else reclamo inexistente o ya dictaminado
BE --> FE: 400 motivo del rechazo
end
note over SUAAdapter, SupaSUA
En producción, SUAAdapter se reemplaza por una
implementación que consulte los endpoints reales
del SUA municipal. El resto del flujo no cambia.
end note
@enduml
```

## Secuencia — Planificar ruta eficiente

SVG renderizado: `../Planificar ruta eficiente.svg`

```plantuml
@startuml
actor Operario
participant "Frontend" as FE
participant "Backend API" as BE
participant "Motor de Ruteo" as Ruteo
database "Supabase (DB propia)" as DB
Operario -> FE: Selecciona zona, horas/casos, modo de traslado
FE -> BE: POST /rutas/planificar {zona, criterios, modo}
BE -> DB: obtener reclamos pendientes de la zona + balanceador vigente
DB --> BE: lista de reclamos con prioridad
BE -> Ruteo: calcularRutaOptima(reclamos, modo, balanceador)
Ruteo --> BE: orden de visita + tiempos estimados
BE -> DB: guardar RUTA_INSPECCION + DETALLE_RUTA
DB --> BE: OK
BE --> FE: mapa, cronograma, % de eficiencia
FE --> Operario: muestra ruta planificada
@enduml
```

## Diagrama de clases

SVG renderizado: `../Diagrama de clase.svg`

```plantuml
@startuml
class Usuario {
-usuarioAgente: String
-legajo: String
-nombreApellido: String
-rol: RolEnum
-matricula: String
+iniciarSesion()
+cerrarSesion()
}
enum RolEnum {
LECTOR
OPERARIO
ADMINISTRADOR
}
class Reclamo {
-nroReclamoSua: String
-fechaIngreso: DateTime
-direccionExacta: String
-distrito: String
-descripcionMotivo: String
-fotoAdjunta: String
-estadoSua: String
+actualizarEstado()
}
class DictamenTecnico {
-idDictamen: int
-fechaDictamen: DateTime
-nroExpediente: String
-nroNota: String
-especie: String
-perimetroTronco: String
-alturaAproximada: String
-estadoCopa: String
-estadoTronco: String
-estadoRaices: String
-inclinacionEjemplar: String
-direccionEjemplarConfirmada: String
-calleEsquina: String
-distanciaMedianeraRef: String
-cantidadFrente: int
-categoriaIntervencion: CategoriaIntervencionEnum
-codigoMotivo: String
-accionRequerida: String
-complejidad: ComplejidadEnum
-urgente: boolean
-frenteGarage: boolean
-mediaTension: boolean
-deOficio: boolean
-observacionesTecnicas: String
-firmaDigital: String
-hash: String
-fechaVencimiento: DateTime
+firmar(matricula: String)
+esValido(): boolean
}
enum CategoriaIntervencionEnum {
DANIO_VEREDA
EXTRACCION
TRABAJO_SUBTERRANEO
TRABAJO_AEREO
SIN_TRABAJO
}
enum ComplejidadEnum {
BAJA
MEDIA
ALTA
MAXIMA
}
class RutaInspeccion {
-idRuta: int
-fechaPlanificacion: Date
-estadoRuta: String
+calcularEficiencia(): double
}
class DetalleRuta {
-idDetalle: int
-ordenVisita: int
-visitado: boolean
}
class AsignacionInterna {
-idAsignacion: int
-areaOrigen: String
-areaDestino: String
-fechaPase: DateTime
}
interface IReclamoProvider {
+obtenerReclamo(nroSua, anio)
+actualizarEstado(nroSua, estado)
}
interface IAuthProvider {
+validarCredenciales(usuario, password)
}
class SupabaseReclamoAdapter implements IReclamoProvider {
.. Implementación de prototipo (demo) ..
Consulta reclamos simulados en Supabase
}
class SUAAdapter implements IReclamoProvider {
.. Implementación de producción (a integrar) ..
Consulta los endpoints reales del SUA municipal
}
class SupabaseAuthAdapter implements IAuthProvider {
.. Implementación de prototipo (demo) ..
Autentica contra Supabase Auth
}
class AuthInstitucionalAdapter implements IAuthProvider {
.. Implementación de producción (a integrar) ..
Autentica contra el sistema institucional municipal
}
note right of IReclamoProvider
Patrón Adaptador (RNF-08): el núcleo de la
aplicación depende solo de la interfaz. Cambiar
de demo a producción es reemplazar la clase
concreta, sin tocar el resto del sistema.
end note
Usuario "1" -- "0..*" DictamenTecnico : genera
Usuario "1" -- "0..*" RutaInspeccion : tiene
Reclamo "1" -- "0..1" DictamenTecnico : posee
RutaInspeccion "1" -- "1..*" DetalleRuta : contiene
Reclamo "1" -- "0..*" DetalleRuta : se asigna a
Reclamo "1" -- "0..*" AsignacionInterna : registra
Reclamo ..> IReclamoProvider : usa
Usuario ..> IAuthProvider : usa
@enduml
```

## Diagrama de despliegue

SVG renderizado: `../Diagrama de despliegue.svg`

```plantuml
@startuml
node "Dispositivo de campo\n(celular / tablet / PC)" as Device {
component "PWA / Web App\n(HTML + CSS + JS)" as FrontendApp
}
node "Vercel" as Vercel {
component "Frontend estático\n(build de producción)" as FrontendHosting
component "API / Backend\n(Serverless Functions - JS)" as BackendAPI
}
node "Supabase" as SupabaseCloud {
database "PostgreSQL\n(reclamos simulados,\ndictámenes, rutas, usuarios)" as DB
component "Auth\n(implementa IAuthProvider\nen el prototipo)" as SupabaseAuth
component "Storage\n(fotos, evidencias)" as Storage
}
cloud "Infraestructura Municipal\n(reemplaza a Supabase en producción)" as Muni {
component "SUA\n(implementará IReclamoProvider)" as SUA
component "Autenticación Institucional\n(implementará IAuthProvider)" as AuthMuni
}
Device --> FrontendHosting : HTTPS
FrontendApp --> BackendAPI : HTTPS / REST API
BackendAPI --> DB : SQL (cifrado en tránsito)
BackendAPI --> Storage
BackendAPI ..> SUA : futuro reemplazo del adaptador\nde reclamos (RF-32)
BackendAPI ..> AuthMuni : futuro reemplazo del adaptador\nde autenticación (RF-32)
BackendAPI --> SupabaseAuth : autenticación vigente en el prototipo
@enduml
```

## Diagrama de flujo de datos — Nivel 1

SVG renderizado: `../Diagrama de flujo de datos - Nivel 1.svg`

```plantuml
@startuml
left to right direction
actor Operario as OP
actor Administrador as AD
rectangle "1. Autenticar Usuario" as P1
rectangle "2. Consultar Reclamos" as P2
rectangle "3. Emitir Dictamen" as P3
rectangle "4. Planificar Rutas" as P4
rectangle "5. Administrar Sistema" as P5
database "Usuarios y Roles" as D4
database "Reclamos\n(vía adaptador de reclamos;\nSupabase en el prototipo)" as D1
database "Dictámenes" as D2
database "Rutas" as D3
OP --> P1
P1 --> D4 : consulta credenciales/rol
P1 --> OP : token de sesión
OP --> P2
P2 --> D1 : lee reclamos filtrados
D1 --> P2
OP --> P3
P3 --> D1 : lee reclamo puntual
P3 --> D2 : guarda dictamen firmado
P3 --> D1 : actualiza estado del reclamo
OP --> P4
P4 --> D1 : lee reclamos pendientes
P4 --> D3 : guarda ruta planificada
AD --> P5
P5 --> D4 : vincula cuenta institucional a un rol\n(demo: crea cuenta de prueba en Supabase)
P5 --> D1 : configura adaptador de reclamos
P5 --> D4 : configura adaptador de autenticación
@enduml
```
