# T10 — Seguridad técnica

> Diseño técnico · Última actualización: 21/08/2026 · Estado: **sin aprobar**
> Absorbe la auditoría del 20/08: sesión única, corte al apagar, baja de captor, almacenamiento persistente y separación entre firma interna y certificación externa.
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
| **Captor dado de baja** | Se rechaza **antes** de emitir token (RF-35). Es el control más temprano y el más barato |
| **Sesión previa del mismo usuario** | Se cierra: **la que abre manda** (RNF-14) |
| Contraseñas | Nunca en el repositorio, nunca en logs, nunca en la respuesta |

Un mensaje distinto para "usuario inexistente" convertiría el login en un **verificador de nombres de usuario municipales**: cualquiera podría averiguar quién trabaja en la repartición probando combinaciones del formato `[inicial][apellido][n]`, que es público y predecible.

El límite por identificador **y** por origen es deliberado: solo por identificador, un atacante prueba una contraseña contra mil usuarios sin bloquearse nunca.

### El token

| Claim | Contenido |
| --- | --- |
| `sub` | uuid del usuario |
| `identificador` | `cbenite0` |
| `rol` | `operario` |
| `captor_id` | Desde qué dispositivo se abrió la sesión |
| `exp` | Cierre de jornada **más la ventana de sincronización tardía** |
| `jti` | Identificador del token, para invalidarlo |

**El vencimiento sigue la jornada** porque el sistema es de campo: un token que vence a la madrugada obliga a reautenticar en la calle, sin señal, que es exactamente cuando no se puede.

### La ventana de sincronización tardía, que faltaba (H-07)

La versión anterior decía solo *"el vencimiento sigue la jornada"*, y eso **se contradecía con el propio diseño offline**, que acepta un dictamen que sube a las once de la noche cuando Background Sync despierta al Service Worker **con la aplicación cerrada**. A esa hora el token de la mañana ya venció, y la respuesta razonable —"pedir reautenticar"— no tiene a quién pedírsela: no hay nadie mirando la pantalla.

Se resuelve corriendo la ventana hacia adelante y renovándola en el momento en que la señal está garantizada:

| Momento | Qué pasa con la sesión |
| --- | --- |
| Al **confirmar la jornada** | Se **renueva a la fuerza**. Es la última señal garantizada del día |
| Durante la jornada, con señal | Se renueva sola |
| Después del cierre, con la app cerrada | El token **sigue vigente** hasta cubrir la sincronización tardía |
| Si aun así venció | La cola **espera**. No descarta nada, y el aviso dice *"hay que volver a iniciar sesión"* |

**El aviso no se puede confundir con "sin señal".** Son dos problemas distintos con dos soluciones distintas, y mostrarlos igual dejaría al ingeniero esperando que se resuelva solo algo que no se resuelve solo.

### Una sola sesión, y se corta al apagar (RNF-14)

| Regla | Detalle |
| --- | --- |
| Una sola sesión activa por usuario | Al iniciar sesión, cualquier otra se invalida por `jti` |
| La desplazada recibe `SESION_DESPLAZADA` | No `TOKEN_VENCIDO`: **son cosas distintas y se dicen distinto** |
| La sesión se corta al apagarse el dispositivo | Continuar exige reautenticar, y eso exige conexión |

**Consecuencia asumida, decidida por el analista funcional el 20/08.** Con la batería agotada a las 14:00 en la calle y sin señal, el ingeniero **no puede seguir cargando esa tarde**. Se planteó la alternativa —mantener la jornada abierta en el dispositivo y renovar la sesión de servidor sola— y se descartó:

> Son documentos legales, no se puede jugar. Sin mencionar que el captor puede tener trabajo de otras personas adentro, o darse un uso erróneo, como prestárselo a otra persona. La seguridad vale.

**El trabajo ya cargado no se pierde**: la cola y los borradores viven en el dispositivo y se envían cuando vuelve a autenticarse. Lo que se pierde es la posibilidad de seguir cargando. La mitigación es **operativa** —captor cargado al salir, batería externa prevista por la repartición— y se declara como condición de entorno.

### Administración de dispositivos (RF-35)

| Regla | Detalle |
| --- | --- |
| Cada captor existe como fila | Etiqueta, asignación y estado |
| El Administrador lo da de baja | Robo, extravío o destrucción |
| Un captor de baja no autentica ni sincroniza | Se corta en el login |
| Lo que traiga adentro **queda en cuarentena** | No se descarta: una persona decide |

**Por qué cuarentena y no descarte.** Un equipo robado no debe poder escribir dictámenes; un equipo olvidado y recuperado a la semana puede traer trabajo de campo perfectamente válido. La cuarentena **separa la decisión de seguridad —inmediata y automática— de la decisión sobre el contenido**, que la toma una persona mirando. Descartar sin mirar violaría el principio que el proyecto sostiene en todos lados: no se tira trabajo de campo.

### El almacenamiento del dispositivo es parte del modelo de amenaza (H-08)

**IndexedDB es descartable por defecto**: bajo presión de almacenamiento, Android puede vaciarla sin avisar. Ahí adentro viven dictámenes firmados con validez legal. No es lo mismo que "storage lleno", que el diseño ya contemplaba: *lleno* es no poder escribir; esto es que **borren lo ya escrito**.

Se pide `navigator.storage.persist()` al confirmar la jornada y se verifica el espacio con `navigator.storage.estimate()` antes de precargar.

> **Requisito de despliegue para el CIL: el captor tiene que tener la aplicación instalada como PWA, no abierta en una pestaña.** Chrome en Android concede almacenamiento persistente a las aplicaciones instaladas y se lo niega a las pestañas. Es una condición de instalación, no una recomendación.

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
| `fotos-reclamo` | Fotos de un alta en campo (RF-36) | Privado, idem |
| `entregables` | PDF por paquete de concesionaria (RF-33) | Privado, solo Administrador |

**Ningún bucket es público.** Una foto de campo puede mostrar el frente de la casa de un vecino: es dato personal y no se sirve por una URL adivinable.

Sesenta segundos alcanzan para que el navegador cargue la imagen y son pocos para que la URL circule por otro lado. Las URLs se generan **al momento de mostrar**, nunca se guardan en la base ni viajan en respuestas de listado.

**El trazo de la firma ya no ocupa un bucket** (H-05). Viaja como **vectores** dentro del propio dictamen —`firma_trazo`, tipo `jsonb`— y no como PNG en base64 en un archivo aparte. Son 2 a 6 KB en vez de 80, se redibuja a cualquier resolución para el PDF, y **no hay un archivo que pueda quedar huérfano si el envío se corta a la mitad**.

Sigue **sin devolverse nunca al front**: se recibe, se le calcula el hash, se guarda y se usa para componer el documento del lado del servidor. Un trazo de firma que circula por la red es un trazo que se puede reutilizar.

Va embebido en el cuerpo del dictamen y no como operación separada, porque si viajara suelto podría existir —aunque sea por un rato— **un dictamen firmado sin firma**. La regla es *o el dictamen existe entero y firmado, o no existe*.

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
| **Alta y baja de captor** | Deshabilita un dispositivo que puede tener trabajo adentro |
| **Liberación o descarte de cuarentena** | Alguien decidió sobre trabajo de campo ajeno |
| **Desblindaje manual de una jornada** | Le saca a un ingeniero casos que tiene en la calle |
| **Confirmación de fecha por reloj discrepante** | Fija un vencimiento legal a mano: de qué fecha a qué fecha |
| **Intento y forzado de certificación** | Cuándo, con qué certificadora y con qué resultado |
| **Sesión desplazada** | Alguien inició sesión con un usuario que ya tenía sesión abierta |

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
| **Horarios de parada y geometría** | **90 días** (D-56) | Registro de movimientos de un trabajador |
| Resumen de la jornada | Permanente | Justifica una decisión administrativa |
| Borradores sin actividad | 30 días a `inactivo`, **nunca se borran solos** (D-57) | Pueden tener trabajo de campo adentro |
| Idempotencia | 30 días, **con trabajo de purga** (H-11) | Solo protege reintentos |
| Cola offline en el dispositivo | Hasta confirmarse | No se acumula |

Las rutas se conservan menos que los dictámenes **a propósito**. **El argumento, para la defensa:** *se conserva el dato que justifica una decisión administrativa y se destruye el que solo serviría para vigilar a un empleado.* Pasados los 90 días no se pierde ni el porqué ni el rendimiento — se pierde a qué hora estuvo el ingeniero en cada esquina.

**La consolidación va antes del borrado**: la eficiencia se calcula a partir de los horarios de parada, así que borrarlos sin consolidar primero se llevaba puesta la estadística (T9 §8).

Los 90 días son un **parámetro**, no una constante: si la repartición tiene una política propia de retención de registros de personal, se ajusta sin deploy.

---

## 7. Datos de prueba

**Solo inventados.** Ningún reclamo real, ni siquiera anonimizado: una dirección exacta identifica un domicilio, y quitarle el nombre no la vuelve anónima.

Los usuarios de prueba usan el **formato real** de usuario de red municipal (`gboubon0`) con **personas inventadas**. Imitar el formato sin usar personas reales es deliberado: la demo tiene que verse como el sistema que van a usar, y nadie tiene que quedar expuesto para lograrlo.

Las contraseñas de los **cinco** usuarios de prueba **no van al repositorio** (D-60). El repositorio lista quién es cada uno y para qué sirve; el seed las toma de una **variable de entorno** que no se versiona, y el README dice dónde pedirlas: el canal del equipo.

Cumple la regla del protocolo sin excepciones, y tiene una propiedad que la alternativa no tenía: **si algo se filtra, no hay nada que rotar.**

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
| No garantiza que el navegador conserve la cola | Se pide `storage.persist()` y se exige PWA instalada; si Android igual la descarta, se pierde. **Se declara** |
| No recupera el trabajo de un captor que no vuelve | El blindaje deja la pérdida **acotada y enumerada**, pero no la evita |
| No cifra datos a nivel de campo | La base está cifrada en reposo por el proveedor; cifrar campos rompería las consultas sin agregar defensa real en este modelo de amenaza |
| No tiene segundo factor | La autenticación real es institucional; agregarle un factor al andamio sería simular un control que el sistema definitivo va a heredar de otro lado |
| No controla que el firmante tenga título habilitante | Ese control queda del lado del alta de usuarios, fuera del módulo (D-50, DV-10) |

La última fila del bloque original es la más importante y está dicha de frente en DV-10, con lo que se pierde y cómo se mitiga: la lista de roles habilitados es configurable, así que restringirla más adelante es un cambio de panel y no de código, y **toda firma queda auditada** con usuario, legajo, rol y versión de configuración.

### Firma interna y certificación externa: qué significa exactamente "no certifica"

| | Qué es | ¿Puede fallar? | ¿Está implementado? |
| --- | --- | --- | --- |
| **Firma interna** | Hash canónico + sello de tiempo del servidor + legajo + rol + versión de `config_firma` | **No.** Es local y entra en la transacción | **Sí** |
| **Certificación externa** | `ICertificadoraFirma` ante un organismo | **Sí.** Sale de nuestra frontera | No, es un placeholder declarado |

La distinción importa para la defensa, porque las dos cosas se llamaban "firmar" y se comportan al revés. **El dictamen se firma siempre y esa firma no puede fallar**; lo que puede fallar es certificarla ante un tercero, y para ese caso el diseño tiene un camino: el dictamen queda firmado y válido puertas adentro con estado `pendiente`, un trabajo reintenta, el Administrador puede forzarlo, y **lo único que ese dictamen no puede hacer es salir en un entregable a concesionarias** hasta certificarse.

Es la respuesta a la pregunta que el documento académico no contesta: qué pasa si la certificación falla. Las dos salidas obvias son malas —impedir firmar le arruina la jornada a alguien que ya hizo el trabajo; ignorarlo deja circular como plenamente válido, frente a una empresa privada, un documento que no lo es— y esta es la tercera.
