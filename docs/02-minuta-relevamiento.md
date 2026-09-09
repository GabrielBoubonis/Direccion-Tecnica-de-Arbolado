# Minuta de relevamiento y pedidos del cliente

RELEVAR 
CÓMO SE FILTRA EL LISTADO DE RECLAMOS
Y CÓMO SE FILTRA EL LISTADO DE INTERVENCIONES

IDENTIFICADOR DE VENCIMIENTO.

1. Digitalización y despapelización del dictamen técnico

En la actualidad, los ingenieros agrónomos confeccionan los dictámenes técnicos en formato papel. Posteriormente, estos documentos deben ser trasladados físicamente y cargados manualmente en el sistema SUA por el área de Procesamiento de Datos. Este procedimiento provoca demoras significativas, incrementa la posibilidad de errores de carga y genera duplicación de tareas, además de limitar la trazabilidad y estandarización de la información técnica registrada.

Mejora propuesta: Implementación de aplicativo que se adapte a moviles para dictámenes técnicos

Se propone desarrollar un aplicativo complementario integrado, que permita a los ingenieros agrónomos cargar el dictamen técnico directamente desde dispositivos móviles (celulares o tablets) en el lugar de la inspección. Esta herramienta deberá incluir todos los campos actualmente presentes en el dictamen físico, y sumar nuevas validaciones automáticas para lograr mayor precisión y estandarización.

Beneficios esperados:

- Eliminación total del uso de papel (despapelización).

- Reducción del tiempo total de carga de datos.

- Eliminación de duplicación de esfuerzos entre áreas.

- Registro inmediato de la información en SUA, mejorando la trazabilidad y disponibilidad del dictamen.

- Disminución de errores mediante validaciones automáticas y campos obligatorios.

Campos adicionales propuestos para estandarización:

El módulo móvil deberá incorporar campos diseñados específicamente para generar criterios uniformes de intervención, tales como:

- Nivel de urgencia del caso: urgente, corto plazo, mediano plazo, largo plazo..

- Variables de riesgo estandarizadas: riesgo de caída, interferencia con cableado, daño a infraestructura, etc.

- Posibilidad de adjuntar fotografías tomadas en el lugar.

- Geolocalización automática del ejemplar (opcional).

Estos campos permitirán:

- Asignar prioridad objetiva a los reclamos de arbolado urbano.

- Facilitar la programación inteligente de recorridos para ingenieros y cuadrillas.

- Construir paquetes de casos similares que puedan ser derivados a empresas concesionarias, optimizando el uso de recursos técnicos y logísticos.

Incorporación de firma digital del ingeniero:

Como parte fundamental del proceso digital, el dictamen técnico emitido desde el módulo móvil deberá incluir la firma digital del Ingeniero Agrónomo responsable, garantizando:

- Autenticidad del documento.

- Integridad de la información cargada (inalterable).

- Validez legal del dictamen ante cualquier intervención sobre el ejemplar.

- Seguridad del proceso, evitando que usuarios no autorizados editen o generen dictámenes.

Una vez firmado digitalmente, el dictamen deberá pasar automáticamente a estado sólo lectura, respetando la política actual del SUA donde únicamente los ingenieros están habilitados a emitir dictámenes técnicos.

2. Estandarización del criterio de prioridad para dictaminar reclamos

Actualmente, los reclamos que ingresan por los distintos canales (oficinas presenciales, distritos, Munibot) no cuentan con un criterio uniforme de prioridad. El personal que recibe los reclamos asigna la prioridad según su propio criterio, ya que el sistema no ofrece parámetros estandarizados para determinar el nivel de urgencia.
 Esto genera desorden, inequidad en el tratamiento de los casos y demoras en reclamos que podrían representar riesgo real para los vecinos.

#### Mejora propuesta

Se propone incorporar en el sistema una matriz de priorización automática basada en criterios objetivos vinculados al riesgo sobre:

- La seguridad de las personas.

- La integridad de bienes públicos o privados.

- Infraestructura urbana (interferencia con cables, luminarias, veredas, gas, agua, etc.).

Con esta mejora, el sistema permitirá clasificar los reclamos antes de ser dictaminados, brindando a los ingenieros una herramienta que indique qué casos deben ser inspeccionados primero.

#### Propuesta de parámetros estandarizados

El sistema deberá asignar automáticamente una prioridad inicial utilizando una escala de cuatro niveles representados por colores:


| Color | Descripción | Ejemplo |
| --- | --- | --- |
| Verde | Baja prioridad | Poda de mantenimiento, poda estética, reclamos sin riesgo inmediato. |
| Amarillo | Media prioridad | Ramas bajas que dificultan el paso, interferencia leve con cableado, reclamo con molestias moderadas. |
| Naranja | Alta prioridad | Raíces que afectan vereda o instalaciones, ramas que rozan balcones o cableado crítico. |
| Rojo | Urgente | Rama colgando con riesgo de caída, árbol inclinado, riesgo directo a salud o bienes. |


#### Escalamiento automático por tiempo

Además, el sistema debe aumentar automáticamente la prioridad de un reclamo cada 2 meses si aún no fue dictaminado:

- Verde → Amarillo

- Amarillo → Naranja

- Naranja → Rojo

- Rojo → Se mantiene como urgente hasta ser dictaminado

Esto permite evitar que reclamos antiguos queden olvidados, garantizando un tratamiento más justo y ordenado.

#### Objetivo de esta mejora

- Dar a los ingenieros herramientas para planificar recorridos y dictaminaciones de forma más eficiente.

- Garantizar que los reclamos realmente urgentes se atiendan primero.

- Reducir la discrecionalidad y asegurar criterios objetivos en el tratamiento inicial de los reclamos.

- Mejorar la capacidad operativa de la Dirección Técnica de Arbolado ante grandes volúmenes de trabajo.

4. Validaciones en la base de datos para evitar inconsistencias

Actualmente, se han identificado inconsistencias dentro del sistema SUA, donde un mismo reclamo presenta intervenciones incompatibles entre sí. Por ejemplo, existen casos con dictamen técnico de extracción que simultáneamente tienen cargadas intervenciones de poda o corte de raíces, lo cual es contradictorio y genera errores en la planificación operativa, asignación de recursos y trazabilidad del historial del reclamo.

##### Mejora propuesta:

Implementar un conjunto de validaciones automáticas en el sistema SUA que impidan seleccionar intervenciones incompatibles dentro de un mismo reclamo. Estas validaciones deben aplicarse tanto al momento de cargar el dictamen como durante la programación de tareas, garantizando la coherencia y consistencia de los datos.

Las validaciones deberán incluir:

- Restricciones entre tipos de intervención:

- Si el dictamen determina extracción, el sistema debe bloquear automáticamente la selección de poda o corte de raíces.

- Si se determina poda, no debe permitir seleccionar extracción en el mismo reclamo.

- Si se determina corte de raíces, no puede coexistir con extracción o poda que no correspondan al dictamen técnico.

- Validaciones de prioridad, complejidad y urgencia:
 Para estandarizar y evitar errores, el sistema debe impedir cargar múltiples valores contradictorios del mismo campo (por ejemplo, marcar un reclamo como “urgente” y simultáneamente “a largo plazo”).
 Cada campo debe aceptar únicamente valores dentro de su categoría y bloquear combinaciones no válidas.

##### Objetivo de esta mejora:

- Evitar inconsistencias en la base de datos.

- Asegurar que las intervenciones respeten el dictamen técnico (que siempre prevalece).

- Estandarizar el proceso de carga.

- Reducir errores humanos y operativos.

- Mejorar la trazabilidad del reclamo.

- Facilitar la planificación, asignación de tareas y posterior auditoría del proceso.

5. Optimización de rutas de trabajo para ingenieros agrónomos

En la actualidad, los ingenieros agrónomos de la Dirección Técnica deben desplazarse por múltiples puntos de la ciudad para realizar dictámenes, pero el proceso carece de una planificación de recorridos eficiente. Cada ingeniero organiza sus traslados de manera individual, lo que genera pérdidas de tiempo, recorridos superpuestos, mayor desgaste del personal y un uso poco óptimo de los recursos disponibles. Esto impacta directamente en la velocidad de dictaminación, en especial cuando el volumen de reclamos supera la capacidad operativa del equipo.

Mejora propuesta:
 Se propone integrar un módulo de georreferenciación y optimización de rutas dentro del sistema, utilizando el mapa urbano de la ciudad de Rosario para planificar recorridos más eficientes. Este módulo permitirá visualizar la distribución espacial de los reclamos pendientes de dictamen, priorizarlos según urgencia y generar rutas optimizadas que reduzcan tiempos de traslado y aseguren una mayor capacidad operativa diaria.

Para esta mejora se contemplan dos alternativas organizativas que podrían coexistir o implementarse progresivamente.
 La primera consiste en reorganizar al equipo técnico creando un rol de Ingeniero en Jefe, responsable de la planificación y supervisión general, acompañado de un Ingeniero Subjefe encargado de coordinar el trabajo de campo. Bajo esta modalidad, el Ingeniero en Jefe se dedicaría a dictámenes más complejos o atípicos, mientras que el Subjefe dividiría al personal en dos equipos: uno de tres ingenieros destinado a realizar barridos diarios en zonas con alta concentración de reclamos (cubriendo alrededor de cinco manzanas por profesional), y otro equipo de dos ingenieros enfocado exclusivamente en reclamos urgentes que requieran dictaminación inmediata. Esta estructura permite atender simultáneamente situaciones críticas mientras se reduce el rezago de casos generales.

La segunda alternativa, más flexible, consiste en dotar a la Dirección Técnica de herramientas tecnológicas que permitan a los propios ingenieros planificar sus rutas mediante filtros avanzados: por prioridad, por cercanía geográfica o por antigüedad del reclamo. Con el apoyo del módulo de georreferenciación y del control automático del estado de los reclamos, los ingenieros podrían seleccionar rutas inteligentes adaptadas a su jornada, reduciendo tiempos improductivos y maximizando la cobertura territorial.

Ambas alternativas comparten el objetivo de mejorar la eficiencia operativa, reducir los desplazamientos innecesarios, disminuir los tiempos de dictaminación y optimizar el uso de los recursos humanos y materiales de la Dirección Técnica.

Hola Claude, mira necesito ayuda para mí trabajo final de práctica profesionalizante 2 de mi carrera de analista funcional en sistemas, te voy a pasar la documentacion tecnica que armamos el año pasado sobre la direccion general de parques y paseos. En este año vamos a hacer un desarrollo acompañado de documentacion tecnica orientado unicamente a una de las direcciones que integran esta direccion general  que es la direccion tecnica de arbolado, vamos a enfocarnos en resolver sus problemas.

Cabe destacar que como es una organizacion publica no tenemos los permisos para poder trabajar con sus bases de datos, su sistema principal SUA (no podemos modificarlo), asi que lo que haremos es presentar este prototipo web con bases de datos en la nube o de forma local (a determinar con mi equipo), de manera en la que si nos aprovacen el proyecto solo deberiamos de cambiar las apis para que se contacten con las bases y enpoints correctos para que esto funcione.

La idea es hacer una pagina web que sea web responsible para usar en celulares o tablets, esta pagina debe tener al inicio un pedido de verificacion del usuario y contraseña ya existente con el cual ya se logean en la organizacion, Una vez ingresado necesitaremos 3 Paginas la primera sera la REALIZACION DE DICTAMEN TECNICO, la segunda sera, RECLAMOS SIN DICTAMINAR, la tercera sera CREACION DE RUTAS EFICIENTES y en el Home habra la un grafico que muestre los reclamos pendientes por dictaminar, la cantidad de reclamos dictaminados y la cantidad total de reclamos ingresados,(Luego pensamos la logica de lo que debera de mostrar bien), necesitamos que en la pagina de realizacion de dictamen tecnico antes de llenar el formulario tenga que ingresar el ingeniero el numero de sua y el año del reclamo que esta yendo a dictaminar, estos 2 datos nos permitiran poder asignar el dictamen a ese reclamo ya existente. para poder acordarse el ingeniero el numero de sua y año la pagina de permitir que se mueva a la page de rutas eficientes para ver que numero y año tiene el reclamo que esta yendo a dictaminar a esa direccion.

ahora leyendo la documentacion podras ver que estos reclamos tendran campos para poder determinar cierta prioridad de cuales son los reclamos dictaminar primero, la pagina de reclamos sin dictaminar los debera tener en cuenta, aqui estaran todos los reclamos que centralizacion derive o asigne a la direccion tecnica de arbolado.

y por ultimo la pagina de rutas eficientes debera de poder conectarse con google maps para mostrar un mapa con la ruta que recorrera este ingeniero, la finalidad de esta pagina es que calcule unas 4 horas de trabajo de dictaminado para el dia del ingeniero, debera de ingresar la zona de la ciudad que quiere dictaminar y segun prioridad el sistema debe darle cierta cantidad de reclamos para dictaminar con una ruta muy eficiente en donde parta desde parques y paseos y vuelva a parques y paseos, estos recorridos pueden ser con auto o a pie, puede asignar casos de diferentes prioridad mientras que la ruta sea eficiente, estas cantidad de casos de diferentes prioridades debe ser equilibrada por ejemplo 5 casos de baja, prioridad 5 casos de prioridad media prioridad, 5 casos de alta prioridad y 5 casos de prioridad urgente.

entonces ahora te voy a pasar la documentacion tecnica y el dictamen tecnico y me podrias hacer un prototipo para poder mostrarle a mi profesor lo que queremos hacer

12/08

Necesitamos revisar la manera correcta de justificar el porqué un ingeniero puede abrir un nuevo reclamo.

En reclamos debe poder filtrar los reclamos por sus diferentes datos.

Los reclamos deben contar con todos los datos necesarios para que un reclamo sea real.

Hay mucha necesidad de poder filtrar por distritos los reclamos.

En el dictamen técnico tenemos que dejar todos los datos como si fuera el dictamen técnico actual, Faltan datos como trabajo en raíces, opciones como sin trabajo.

o luego de llenar los datos del ejemplar poner 3 botones extraccion, trabajo en parte aérea y trabajo en parte subterránea.

obvio poner todo con los datos del dictamen.

actualmente el mapa no tiene funcionalidad pero esta muy fachero

a su vez el mapa va a tener que quedar igual hasta que se oprima un botón de restablecer porque ese mapa va a ser el que tengan que seguir todo el día y si al cargar un dictamen se reinicia el mapa nos van a matar.

En el dashboard se debería poder ver el filtrado de casos por distrito.

Aclarar porque se puede cargar un reclamo nuevo

Poner un botón de consulta de reclamo al cual se pueda entrar con una dirección.
