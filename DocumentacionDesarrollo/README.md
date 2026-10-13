# Sistema de Dictaminación — Grupo N°1

> Materia: Diseño de Sistemas Web — Analista Funcional de Sistemas
> Institución: Terciario Urquiza — Rosario
> Docente: Pedernera Pablo
> Cuatrimestre: 2.° 2026

## Integrantes

Ver [integrantes.md](integrantes.md)

## Descripción del proyecto

El sistema resuelve la etapa de dictaminación técnica de reclamos de arbolado público, una
vez que estos ya fueron derivados a la Dirección Técnica de Arbolado dentro del SUA (Sistema
Único de Atención). Permite a los ingenieros agrónomos consultar las solicitudes asignadas,
armar una ruta de trabajo diaria, completar y firmar digitalmente el dictamen técnico
correspondiente, y sincronizar el resultado con el SUA. También genera un dashboard de
seguimiento para la Dirección. Opera como una aplicación web progresiva (PWA) instalable en
los dispositivos móviles (captores) que la organización provee a los ingenieros, para poder
trabajar sin conexión en el campo.

## Caso de estudio

**Organismo comitente:** Dirección General de Parques y Paseos — Municipalidad de Rosario.

El proyecto surge de un relevamiento realizado durante 2025 (materia Práctica Profesionalizante
I), en el cual se identificaron problemáticas y oportunidades de mejora en los procesos de la
repartición. A partir de ese relevamiento, y con autorización de los directivos, se decidió
desarrollar una herramienta complementaria — no una solución integral — orientada a atacar
tres cuellos de botella concretos: los tiempos de campo de los ingenieros agrónomos, la carga
manual "papel a digital" que realiza el Área de Procesamiento de Datos, y la despapelización
institucional.

El sistema no reemplaza al SUA (plataforma transversal a toda la Municipalidad); se integra
con él como capa complementaria, filtrando únicamente los reclamos con el subtipo "Problema
con el arbolado público", y queda desacoplado de los sistemas de autenticación institucional
y de la base de reclamos del SUA mediante adaptadores, dado que en esta etapa de prototipo no
se cuenta con acceso a los endpoints de producción.

## Entregas

| Entrega | Descripción | Fecha | Estado |
|---------|-------------|-------|--------|
| EP-01 | Presentación preliminar | | |
| EP-02 | | | |
| Final | Versión definitiva | | |

## Estructura del repositorio

```
/
├── README.md
├── integrantes.md
├── RECURSOS.md                    ← leer antes de empezar: prerrequisitos, cheatsheet de git, recursos
├── docs/
│   ├── stakeholders.md
│   ├── requisitos.md
│   ├── alcance.md
│   ├── historias-de-usuario.md
│   ├── casos_de_uso.md
│   ├── DoR.md
│   ├── Slicing.md
│   ├── er-modelo.md
│   ├── diseno_ui.md
│   ├── dictamen-tecnico-campos.md  ← detalle de campos del formulario físico (respaldo de diseno_ui.md)
│   └── arquitectura_tecnica.md     ← decisiones técnicas de implementación (stack, API, seguridad); no forma parte de las plantillas de la cátedra
├── diagramas/
│   ├── casos-de-uso.puml
│   ├── er.puml
│   ├── estados-solicitud.puml      ← estados de la Solicitud y del Dictamen
│   ├── actividad-dictamen.puml     ← flujo de emitir dictamen, con modo offline y sincronización
│   ├── secuencia-login-firma.puml  ← login y firma con segundo factor
│   └── wireframes/
└── cuestionario/
```

## Uso de inteligencia artificial

El grupo usó Claude (Anthropic) como herramienta de apoyo en la redacción y estructuración
de la documentación (`docs/`), en la generación de los wireframes de `diagramas/`,
y en la propuesta inicial del stack técnico de `arquitectura_tecnica.md`.
Las decisiones de fondo — alcance, reglas de negocio, modelo de datos, elección final de
tecnologías — fueron tomadas por el grupo; la IA se usó para redactar, ordenar y mantener la
trazabilidad entre documentos una vez tomadas esas decisiones. Todo el contenido generado fue
revisado, corregido y validado por el equipo antes de subirse al repositorio, y sigue
corrigiéndose en cada ronda de devolución de la cátedra.

## Instrucciones operativas

- Un integrante del grupo es responsable de subir los cambios al repositorio.
- Completar `integrantes.md` antes de la primera entrega.
- Mantener los archivos en la carpeta correspondiente según la estructura indicada.
- Los diagramas deben entregarse en formato PlantUML (`.puml`). Se pueden visualizar en
  [plantuml.com](https://www.plantuml.com/plantuml/uml/).
