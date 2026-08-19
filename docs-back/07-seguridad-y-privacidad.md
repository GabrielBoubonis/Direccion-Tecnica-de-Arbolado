# Seguridad y privacidad

> Última actualización: 18/08/2026 · Estado: **en diseño, sin aprobar**

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
- Mensaje de error genérico ante credenciales incorrectas, sin revelar cuál de los dos campos falló (RF-01).
- Límite de intentos por identificador y por origen, para que probar contraseñas a repetición no sea gratis.
- El sistema **no gestiona contraseñas**: el restablecimiento es del mecanismo institucional. Desactivar un usuario revoca su acceso a la aplicación sin tocar su cuenta institucional (RF-31).

**Sobre la sesión larga en campo.** Un token corto obliga a reautenticarse, y reautenticarse sin señal es imposible: dejaría al ingeniero trabado frente al árbol. Se resuelve con una sesión que se renueva sola mientras haya conexión, y que permite seguir cargando en la cola local aunque haya vencido — porque **la validación real ocurre al sincronizar**, contra el servidor, no contra el token del dispositivo.

---

## 4. Integridad del dictamen

Es el requisito más duro del sistema (RNF-06):

1. **Huella del contenido** al firmar. Cualquier modificación posterior se detecta comparando.
2. **Sello de tiempo del servidor**, no del dispositivo.
3. **Matrícula del firmante**, validada contra el perfil y no contra lo que diga el cliente.
4. **Inmutabilidad impuesta por la base**, no por convención del código: no hay forma de actualizar ni borrar un dictamen firmado, ni siquiera con un error de programación.
5. **Corregir es anular y reemitir**, y ambos quedan en el historial.

Sin el punto 4, la inmutabilidad es una promesa. Con el punto 4, es una propiedad.

---

## 5. Datos de prueba

**Solo inventados.** Ningún reclamo real, ni siquiera anonimizado: una dirección exacta identifica un domicilio, y quitarle el nombre no la vuelve anónima.

Los usuarios de prueba se identifican con el **formato real de usuario de red** de la Municipalidad (`gboubon0`), pero con **nombres inventados**: ningún agente real figura en el repositorio. El adaptador les agrega puertas adentro el dominio reservado `@arbolado.test`, que no resuelve a ninguna casilla real, así que es imposible que una prueba le mande un correo a una persona de la Municipalidad.

Imitar el formato sin usar personas reales es deliberado: la demo tiene que verse como el sistema que van a usar, y nadie tiene que quedar expuesto para lograrlo.

---

## 6. El entregable para concesionarias

Las contratistas **no son usuarias del sistema**. Reciben un export que genera el Administrador, con lo necesario para ejecutar: ubicación del ejemplar, acción autorizada, complejidad y vigencia del dictamen.

**No incluye** la descripción del vecino, las fotos del reclamo, ni el circuito interno. Una empresa privada no necesita saber qué escribió un vecino sobre el árbol de su vereda para ir a podarlo.

Cada generación queda registrada: quién, cuándo, con qué filtros y qué dictámenes salieron.

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
| Rutas y horarios | **Acotado** | Registro de movimientos de un trabajador |
| Borradores sin actividad | Acotado | Datos a medio cargar sin valor probatorio |
| Cola local del dispositivo | Hasta sincronizar | |

Las rutas se conservan menos que los dictámenes a propósito: pasado el valor estadístico, un historial de recorridos con horarios es más riesgo que utilidad. El plazo exacto queda por definir con la repartición.

---

## 9. Qué queda explícitamente fuera

**La certificación oficial de la firma digital.** El sistema captura la firma, la vincula al agente habilitado y a su respaldo, le pone sello de tiempo y la vuelve inmutable, pero **no la certifica ante un organismo oficial**. El puerto existe y está sin implementar, marcado como tal.

Es una limitación del alcance académico y se declara abiertamente, tanto en la documentación como en el entregable visual. Presentarla como firma digital con validez legal plena sería falso.

---

## 10. Qué falta definir

- Plazo concreto de retención de rutas y borradores.
- Si la repartición tiene una política de datos personales propia a la que haya que ajustarse.
