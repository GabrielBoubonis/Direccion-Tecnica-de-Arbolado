# Seguridad y privacidad

> Última actualización: 21/08/2026 · Estado: **en diseño, sin aprobar**

El sistema emite documentos con validez legal y maneja datos de vecinos. Ninguna de las dos cosas admite un "después lo aseguramos".

---

## 1. Qué datos personales toca el sistema

| Dato | De quién | Por qué es sensible |
| --- | --- | --- |
| Dirección exacta del reclamo | Vecino | **Identifica un domicilio.** Es dato personal aunque no haya nombre |
| Descripción del motivo | Vecino | Texto libre: puede contener nombres, teléfonos o quejas sobre terceros |
| Foto del reclamo | Vecino | Puede mostrar el frente de una casa, un vehículo con patente, personas |
| Nombre, legajo y habilitación | Agente municipal | Identifica al profesional responsable |
| Firma | Agente municipal | Dato biométrico comportamental |
| Recorrido y horarios | Agente municipal | **Permite reconstruir dónde estuvo una persona y cuándo** |

Las dos últimas filas suelen pasarse por alto. Una ruta de inspección con horarios estimados es, técnicamente, un registro de los movimientos de un trabajador. Se trata como tal: solo lo ve el propio ingeniero y quien tiene rol de supervisión, nunca el resto del equipo.

---

## 2. Principios

**Mínimo dato.** Cada endpoint devuelve lo necesario para la tarea. El listado de reclamos no manda la descripción completa del vecino si en la tarjeta solo se muestra un resumen.

**Mínimo privilegio.** Un Lector no puede leer lo que no le corresponde ni pegándole directo a la API con su propio token. Se verifica con un escenario del driver que intenta exactamente eso.

**Defensa en profundidad.** El rol se valida en la API **y** en la base. Si un token se filtra o alguien expone la base, la segunda barrera sigue conteniendo.

**Nada público.** Ningún bucket de storage abierto, ninguna URL adivinable. Las fotos se sirven por enlace firmado de corta duración.

**Trazabilidad de lo sensible.** Firmar, cambiar un rol, cambiar un parámetro, liberar la reserva de otro, generar el entregable para concesionarias y anular un dictamen quedan registrados con quién, cuándo y qué cambió.

---

## 3. Autenticación y sesión

- Token de sesión con vencimiento; cerrar sesión lo invalida (RF-02).
- **Una sola sesión activa por usuario. La que abre manda** (RNF-14): al iniciar sesión, cualquier otra sesión de ese usuario se cierra.
- **La sesión se corta al apagarse el dispositivo.** Para continuar hay que autenticarse de nuevo.
- El login lleva el **identificador del captor**. Un dispositivo dado de baja no obtiene token (RF-35).
- Mensaje de error genérico ante credenciales incorrectas, sin revelar cuál de los dos campos falló (RF-01).
- Límite de intentos por identificador y por origen, para que probar contraseñas a repetición no sea gratis.
- El sistema **no gestiona contraseñas**: el restablecimiento es del mecanismo institucional. Desactivar un usuario revoca su acceso a la aplicación sin tocar su cuenta institucional (RF-31).

**Sobre la sesión larga en campo.** Un token corto obliga a reautenticarse, y reautenticarse sin señal es imposible: dejaría al ingeniero trabado frente al árbol. Por eso la sesión de servidor **se renueva a la fuerza al confirmar la jornada**, que es el último momento con señal garantizada, y la ventana queda corrida lo suficiente como para cubrir la **sincronización tardía**: un dictamen que sube a las once de la noche cuando el trabajador en segundo plano despierta con la aplicación cerrada. A esa hora no hay a quién pedirle una contraseña, así que el diseño tiene que haberlo previsto antes de salir.

**Pero el corte al apagar no admite excepción, y esa es la decisión del 20/08.** Si el captor se apaga a las 14:00 en la calle y sin señal, el ingeniero no puede seguir cargando esa tarde. Se evaluó lo contrario —mantener la jornada abierta en el dispositivo y renovar la sesión sola— y se descartó:

> Son documentos legales, no se puede jugar. Sin mencionar que el captor puede tener trabajo de otras personas adentro, o darse un uso erróneo, como prestárselo a otra persona. La seguridad vale.

**El trabajo ya cargado no se pierde**: la cola y los borradores sobreviven en el dispositivo. Lo que se pierde es la posibilidad de seguir cargando. La mitigación es operativa —el captor sale de la sede cargado, y conviene prever batería externa— y se declara como condición de entorno, no se disimula con una excepción en el código.

**Sesión desplazada y token vencido no se muestran igual.** Uno significa "alguien entró con tu usuario en otro lado" y el otro "pasó el tiempo". Confundirlos taparía un problema de seguridad con un cartel de red.

---

## 3 bis. Los dispositivos son parte de la superficie de seguridad

El captor es provisto por la repartición, contiene dictámenes firmados y puede contener trabajo de más de una persona. Se administra como lo que es.

| Regla | Detalle |
| --- | --- |
| Cada captor existe como fila | Con etiqueta, asignación y estado (RF-35) |
| El Administrador lo da de baja | Por robo, extravío o destrucción |
| Un captor de baja no autentica ni sincroniza | Se corta en el login, lo más temprano posible |
| Lo que traiga adentro **no se descarta** | Queda en **cuarentena** y una persona decide |
| Alta, baja y resolución de cuarentena van a auditoría | |

**Por qué cuarentena y no descarte.** Un equipo robado no debe poder escribir dictámenes; un equipo olvidado y recuperado a la semana puede traer trabajo de campo perfectamente válido. La cuarentena **separa la decisión de seguridad —inmediata y automática— de la decisión sobre el contenido**, que la toma una persona mirando. Descartar sin mirar violaría el principio que el proyecto sostiene en todos lados: no se tira trabajo de campo.

### El almacenamiento del dispositivo tiene que ser persistente

**IndexedDB es descartable por defecto**: bajo presión de almacenamiento Android puede vaciarla sin avisar, y ahí adentro viven dictámenes firmados con validez legal. Se pide `navigator.storage.persist()` al confirmar la jornada y se verifica el espacio antes de precargar.

> **Requisito de despliegue para el CIL: el captor tiene que tener la aplicación instalada como PWA, no abierta en una pestaña.** Chrome en Android concede almacenamiento persistente a las aplicaciones instaladas y se lo niega a las pestañas.

---

## 4. Integridad del dictamen

Es el requisito más duro del sistema (RNF-06):

1. **Huella del contenido** al firmar. Cualquier modificación posterior se detecta comparando.
2. **Sello de tiempo del servidor**, no del dispositivo.
3. **Legajo y rol del firmante**, validados contra el perfil del servidor y no contra lo que diga el cliente. No hay campo de matrícula: **firmar es atributo del rol** (D-50, DV-10).
4. **Inmutabilidad impuesta por la base**, no por convención del código: no hay forma de actualizar ni borrar un dictamen firmado, ni siquiera con un error de programación.
5. **Corregir es anular y reemitir**, y ambos quedan en el historial.

Sin el punto 4, la inmutabilidad es una promesa. Con el punto 4, es una propiedad.

**El trazo de la firma se guarda como vectores, no como imagen** (H-05). Son 2 a 6 KB en vez de 80, se redibuja a cualquier resolución para el PDF, y sobre todo no infla el único envío que no puede fallar. Viaja **embebido en el cuerpo del dictamen**: si fuera una operación separada podría existir, aunque sea por un rato, un dictamen firmado sin firma.

### Firma interna y certificación externa son dos cosas (D-65)

| | Qué es | ¿Puede fallar? |
| --- | --- | --- |
| **Firma interna** | Los cinco puntos de arriba | **No.** Es local y entra en la transacción |
| **Certificación externa** | `ICertificadoraFirma`, hoy sin implementar | **Sí.** Es una llamada fuera de nuestra frontera |

Si la certificación falla, el dictamen queda **firmado y válido puertas adentro**, con estado `pendiente`, y un job reintenta. La única consecuencia, y es deliberadamente acotada: **no puede salir en un entregable a concesionarias hasta estar certificado**, porque ahí es donde la validez se ejerce frente a un tercero.

Mezclarlas en un solo campo habría dejado que un timeout de red produjera un dictamen legalmente ambiguo.

---

## 5. Datos de prueba

**Solo inventados.** Ningún reclamo real, ni siquiera anonimizado: una dirección exacta identifica un domicilio, y quitarle el nombre no la vuelve anónima.

Los usuarios de prueba se identifican con el **formato real de usuario de red** de la Municipalidad (`gboubon0`), pero con **nombres inventados**: ningún agente real figura en el repositorio. El adaptador les agrega puertas adentro el dominio reservado `@arbolado.test`, que no resuelve a ninguna casilla real, así que es imposible que una prueba le mande un correo a una persona de la Municipalidad.

Imitar el formato sin usar personas reales es deliberado: la demo tiene que verse como el sistema que van a usar, y nadie tiene que quedar expuesto para lograrlo.

**Las contraseñas de prueba no van al repositorio (D-60).** El repositorio lista los usuarios de prueba con su rol y para qué sirve cada uno, **sin contraseñas**; el seed las toma de una variable de entorno que no se versiona, y el README dice dónde pedirlas: el canal del equipo. Cumple la regla del protocolo sin excepciones, y si algo se filtra **no hay nada que rotar**.

---

## 6. El entregable para concesionarias

Las contratistas **no son usuarias del sistema**. Reciben un export que genera el Administrador, con lo necesario para ejecutar: ubicación del ejemplar, acción autorizada, complejidad y vigencia del dictamen.

**No incluye** la descripción del vecino, las fotos del reclamo, ni el circuito interno. Una empresa privada no necesita saber qué escribió un vecino sobre el árbol de su vereda para ir a podarlo.

Cada generación queda registrada: quién, cuándo, con qué filtros, **a qué empresa** y qué dictámenes salieron. La empresa existe como fila —nombre y contacto— **sin cuenta, sin rol y sin acceso**: está ahí solo para poder responder qué se le informó y cuándo.

Solo salen dictámenes **firmados, vigentes y certificados**. Y si después se anula uno que ya salió, el entregable queda marcado y el sistema muestra **a qué empresa hay que notificar**: no puede des-enviar un PDF, pero no lo deja pasar en silencio, porque del otro lado hay una autorización de extracción que ya no vale.

---

## 7. Secretos

| Nunca al repositorio | Sí al repositorio |
| --- | --- |
| Clave de servicio (saltea todas las políticas) | Migraciones y políticas |
| Contraseña de la base | Seeds ficticios |
| Archivos de entorno reales | Plantilla de entorno con valores vacíos |
| Tokens de acceso | Contratos y documentación |
| Claves con facturación asociada | |

Regla: *si filtrar el archivo obliga a rotar una credencial, no se commitea.*

La clave pública del proyecto viaja al navegador y no es secreta, pero igual se lee de configuración: permite cambiar de proyecto sin tocar código.

> **Deuda heredada.** El repositorio tenía credenciales de un proyecto Firebase versionadas. El archivo ya se eliminó, pero **siguen en el historial de git**. Conviene desactivar ese proyecto o restringir la clave por dominio.

---

## 8. Retención

| Dato | Cuánto se conserva | Por qué |
| --- | --- | --- |
| Dictámenes | Indefinido | Documento con validez legal |
| Auditoría | Indefinido | Sin auditoría no hay trazabilidad |
| Fotos de dictamen | Igual que el dictamen | Son parte de la evidencia técnica |
| Horarios de parada y geometría del recorrido | **90 días** (D-56) | Registro de movimientos de un trabajador |
| Resumen de la jornada: casos, km, eficiencia | Indefinido | Justifica una decisión administrativa |
| Qué casos entraron y bajo qué directiva | Indefinido | Sin eso nadie puede explicar por qué se dictaminaron esos y no otros |
| Borradores sin actividad | **30 días** a inactivo, **nunca se borran solos** (D-57) | Pueden tener trabajo de campo real adentro |
| Claves de idempotencia | **30 días** (H-11) | Muy por encima de cualquier ventana de reintento |
| Cola local del dispositivo | Hasta sincronizar | |

**El argumento, para la defensa:** *se conserva el dato que justifica una decisión administrativa y se destruye el que solo serviría para vigilar a un empleado.* La justificación del ingeniero no se borra nunca; su rastro sí. Pasados los 90 días no se pierde ni el porqué ni el rendimiento — se pierde a qué hora estuvo en cada esquina, que es exactamente el dato que no conviene tener guardado.

**La consolidación va antes del borrado, no después.** La eficiencia se calcula a partir de los horarios de parada: borrarlos sin consolidar primero se llevaba puesta la estadística. Por eso el trabajo `purgar_rutas` deja de ser un borrado y pasa a ser una consolidación seguida de un borrado.

**Los borradores son el único lugar donde el sistema no decide.** A los 30 días sin actividad pasan a una bandeja aparte y **el ingeniero** decide si los retoma o los descarta. Era el único punto del diseño donde se perdía trabajo humano sin que nadie lo mirara.

---

## 9. Qué queda explícitamente fuera

**La certificación oficial de la firma digital.** El sistema captura la firma, la vincula al agente habilitado y a su respaldo, le pone sello de tiempo y la vuelve inmutable, pero **no la certifica ante un organismo oficial**. El puerto existe y está sin implementar, marcado como tal.

Es una limitación del alcance académico y se declara abiertamente, tanto en la documentación como en el entregable visual. Presentarla como firma digital con validez legal plena sería falso.

---

## 10. Qué falta definir

Los plazos de retención se cerraron el 20/08 y están en §8. Queda abierto y **depende de la repartición**:

- Si tiene una **política de datos personales propia** a la que haya que ajustarse, especialmente para la retención de fotos, que hoy siguen la del dictamen.
- Si el plazo de 90 días para el rastro de recorridos se corresponde con lo que la repartición ya aplica a otros registros de movimientos de personal.

Ninguna de las dos bloquea el diseño: los dos plazos son **parámetros**, no constantes en el código, y se cambian sin deploy.
