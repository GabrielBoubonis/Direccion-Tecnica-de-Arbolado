# T10 — Seguridad técnica

> Diseño técnico · Última actualización: 19/08/2026 · Estado: **sin aprobar**
> Responde: cómo se autentica, qué lleva el token, cómo contiene la base, cómo se sirven los archivos y qué se audita.

---

## 1. Qué datos personales toca el sistema

Antes de decidir cómo proteger, hay que decir qué hay que proteger.

| Dato | De quién | Por qué es sensible |
| --- | --- | --- |
| Dirección exacta del ejemplar | Identifica un **domicilio** | Una dirección exacta identifica a una familia |
| Texto del reclamo | Vecino | Suele incluir referencias personales, quejas, horarios |
| Foto del frente | Vecino | Muestra la casa, el auto, a veces personas |
| Nombre, legajo y rol | Agente municipal | Identifica al profesional responsable |
| **Recorrido y horarios** | Agente municipal | **Permite reconstruir dónde estuvo una persona y cuándo** |

**Las dos últimas filas suelen pasarse por alto.** Una ruta de inspección con horarios estimados es, técnicamente, un registro de los movimientos de un trabajador. Se trata como tal: solo la ve el propio ingeniero y quien tiene rol de supervisión, nunca el resto del equipo, y tiene retención acotada (T9 §8).

---

## 2. Autenticación

> RF-01, RF-31 · Decisiones D-09, D-48

### El identificador es un usuario de red

Los agentes municipales entran a los sistemas internos con **usuario y contraseña**, donde el usuario es la primera letra del nombre, hasta seis del apellido y un número correlativo: `gboubon0` (B-04).

El puerto `IAuthProvider` recibe un **`identificador` opaco**, no un "email" (D-09). Fue la decisión que mejor envejeció del proyecto: el supuesto era "correo institucional", la respuesta fue "usuario de red", y **no hubo que rehacer nada**.

El `SupabaseAuthAdapter` necesita internamente un correo, así que le agrega el dominio reservado **`@arbolado.test`**, que no resuelve a ninguna casilla real. Es imposible que una prueba le mande un correo a una persona de la Municipalidad. Ese armado vive **dentro del adaptador** y se va con Supabase.

### Reglas del login

| Regla | Detalle |
| --- | --- |
| Mensaje de error | **Siempre el mismo**, sin revelar cuál campo falló (RF-01) |
| Límite de intentos | Por identificador **y** por origen |
| Bloqueo | Progresivo: 5 fallos → 1 min; 10 → 15 min |
| Usuario desactivado | Se rechaza **antes** de emitir token (RF-31) |
| Contraseñas | Nunca en el repositorio, nunca en logs, nunca en la respuesta |

Un mensaje distinto para "usuario inexistente" convertiría el login en un **verificador de nombres de usuario municipales**: cualquiera podría averiguar quién trabaja en la repartición probando combinaciones del formato `[inicial][apellido][n]`, que es público y predecible.

El límite por identificador **y** por origen es deliberado: solo por identificador, un atacante prueba una contraseña contra mil usuarios sin bloquearse nunca.

### El token

| Claim | Contenido |
| --- | --- |
| `sub` | uuid del usuario |
| `identificador` | `cbenite0` |
| `rol` | `operario` |
| `exp` | Cierre de jornada, no 24 horas fijas |
| `jti` | Identificador del token, para invalidarlo |

**El vencimiento sigue la jornada** porque el sistema es de campo: un token que vence a la madrugada obliga a reautenticar en la calle, sin señal, que es exactamente cuando no se puede.

**El rol viaja en el token pero no se confía en él para decidir.** Cada operación sensible vuelve a leer el perfil de la base. Un token es un dato que el cliente sostiene; el perfil es la fuente de verdad. Si un Administrador degrada a alguien a Lector, ese cambio tiene efecto en la siguiente operación y no cuando venza el token.

---

## 3. Autorización en dos capas

| Capa | Dónde | Qué hace |
| --- | --- | --- |
| **Aplicación** | Middleware de la Edge Function | Rechaza temprano, con mensaje claro en castellano |
| **Base de datos** | Políticas RLS | Contiene aunque la capa de arriba falle |

**Es redundante a propósito.** Si un token se filtra, si un endpoint nuevo se olvida de chequear el rol, o si alguien expone la base por accidente, **RLS sigue conteniendo**. La política más importante del sistema:

```sql
create policy dictamen_insert_solo_roles_de_campo on arbolado.dictamen
  for insert to authenticated
  with check (
    arbolado.rol_actual() = any (
      select unnest(roles_habilitados) from arbolado.config_firma
      order by version desc limit 1)
    and usuario_id = auth.uid()
    and exists (select 1 from arbolado.reserva r
                where r.nro_reclamo_sua = nro_reclamo_sua and r.anio = anio
                  and r.usuario_id = auth.uid() and r.liberada_en is null)
  );
```

Esa política sola dice tres cosas del negocio: **firma quien el panel habilita**, **nadie firma a nombre de otro**, y **no se dictamina lo que no está reservado a nombre propio**.

### Quién firma, y por qué el Administrador no

> Decisión D-50 · Desvío DV-10

Firman **Operario y Jefe**: los dos roles que van a la calle.

El **Administrador no firma**, y el motivo está en el propio documento académico: la sección 3 lo define como *personal del CIL, el Centro de Informática*. No es ingeniero agrónomo. Un dictamen técnico autoriza intervenir un árbol bajo la Ordenanza 5.118 y la Ley 13.836. Que lo pueda firmar alguien de sistemas sería un problema real, no una formalidad.

**Administra la firma, no la ejerce.** Configura el apartado de firma digital —roles habilitados, certificadora, algoritmo, leyenda del pie— y esa separación es justamente lo que hay que poder demostrar: el escenario del driver `firma-por-rol` intenta firmar con el usuario administrador y verifica que **el servidor lo rechaza** (T11).

---

## 4. Almacenamiento de archivos

| Bucket | Contenido | Acceso |
| --- | --- | --- |
| `fotos-dictamen` | Fotos de campo (RF-17) | Privado, URL firmada de 60 segundos |
| `firmas` | Trazo de la firma (RF-18) | Privado, **nunca expuesto al front** |
| `entregables` | Exports para concesionarias (D-26) | Privado, solo Administrador |

**Ningún bucket es público.** Una foto de campo puede mostrar el frente de la casa de un vecino: es dato personal y no se sirve por una URL adivinable.

Sesenta segundos alcanzan para que el navegador cargue la imagen y son pocos para que la URL circule por otro lado. Las URLs se generan **al momento de mostrar**, nunca se guardan en la base ni viajan en respuestas de listado.

El trazo de la firma **no se devuelve nunca al front**. Se sube, se le calcula el hash, se guarda y se usa para componer el documento del lado del servidor. Un trazo de firma que circula por la red es un trazo que se puede reutilizar.

---

## 5. Qué se audita

> Puerto `IAuditoriaRepository`

| Acción | Por qué |
| --- | --- |
| Firma de dictamen | Emite un documento con validez legal |
| Anulación de dictamen | Deshace un documento con validez legal |
| Cambio de rol | Cambia quién puede firmar |
| Cambio de configuración de firma | Cambia **cómo** firma el sistema |
| Cambio de parámetro | Cambia el comportamiento del negocio |
| Reserva y liberación | Explica quién tenía qué y cuándo |
| Alta de reclamo | Un expediente nuevo en el circuito formal |
| Corrección de punto y de categoría | Datos derivados que alguien sobreescribió |
| Generación de entregable | Qué se le informó a una contratista y cuándo |
| Login fallido | Detección de intentos de acceso |

Guarda **quién, cuándo, qué cambió (antes y después) y desde dónde**.

No es burocracia: es un sistema que emite documentos con validez legal. Si alguien pregunta quién autorizó extraer un árbol de treinta años, tiene que haber respuesta. **Nadie escribe la auditoría directo** ni la puede modificar: se escribe desde el caso de uso y se lee desde el panel del Administrador.

---

## 6. Retención

| Dato | Retención | Fundamento |
| --- | --- | --- |
| Dictámenes | **Permanente** | Documento con validez legal |
| Fotos de dictamen | Igual que el dictamen | Son parte del documento |
| Reclamos y estados | Permanente | Expediente municipal |
| Auditoría | Largo plazo | Es el registro de responsabilidad |
| **Rutas y horarios** | **Acotada** | Registro de movimientos de un trabajador |
| Idempotencia | 30 días | Solo protege reintentos |
| Cola offline en el dispositivo | Hasta confirmarse | No se acumula |

Las rutas se conservan menos que los dictámenes **a propósito**. Pasado su valor estadístico, un historial de recorridos con horarios es más riesgo que utilidad. El plazo exacto queda por definir con la repartición (C-02) y es un parámetro, no una constante.

---

## 7. Datos de prueba

**Solo inventados.** Ningún reclamo real, ni siquiera anonimizado: una dirección exacta identifica un domicilio, y quitarle el nombre no la vuelve anónima.

Los usuarios de prueba usan el **formato real** de usuario de red municipal (`gboubon0`) con **personas inventadas**. Imitar el formato sin usar personas reales es deliberado: la demo tiene que verse como el sistema que van a usar, y nadie tiene que quedar expuesto para lograrlo.

Las contraseñas de los cuatro usuarios de prueba **no van al repositorio** (C-03, pendiente de definir dónde).

---

## 8. Secretos

| Nunca al repositorio | Sí al repositorio |
| --- | --- |
| `service_role` de Supabase | Migraciones y políticas RLS |
| Contraseña de la base | Seeds ficticios |
| `.env` reales | `.env.example` con nombres y valores falsos |
| Tokens de acceso | Contratos y documentación |
| **Cualquier clave con facturación** | Adaptadores sin credenciales |

Regla simple: **si filtrar el archivo obliga a rotar una credencial, no se commitea.**

`GoogleRoutesAdapter` queda escrito **sin credenciales** por esta regla, no por falta de tiempo: una clave de Google con facturación asociada en un repositorio académico es una factura esperando a pasar.

> **Deuda heredada.** `services/firebase.ts` tenía credenciales de un proyecto Firebase versionadas. El archivo ya no está —la app Expo se eliminó de la rama (D-33)— pero **siguen en el historial de git**. Aunque una clave web de Firebase no es secreta por diseño, conviene desactivar ese proyecto o restringir la clave por dominio, ya que no se va a usar más.

---

## 9. Lo que el sistema NO hace, declarado

| Exclusión | Por qué se declara |
| --- | --- |
| **No certifica la firma ante un organismo oficial** | El puerto `ICertificadoraFirma` existe sin implementación. Presentarla como firma con validez legal plena sería falso |
| No cifra datos a nivel de campo | La base está cifrada en reposo por el proveedor; cifrar campos rompería las consultas sin agregar defensa real en este modelo de amenaza |
| No tiene segundo factor | La autenticación real es institucional; agregarle un factor al andamio sería simular un control que el sistema definitivo va a heredar de otro lado |
| No controla que el firmante tenga título habilitante | Ese control queda del lado del alta de usuarios, fuera del módulo (D-50, DV-10) |

La última es la más importante y está dicha de frente en DV-10, con lo que se pierde y cómo se mitiga: la lista de roles habilitados es configurable, así que restringirla más adelante es un cambio de panel y no de código, y **toda firma queda auditada** con usuario, legajo, rol y versión de configuración.
