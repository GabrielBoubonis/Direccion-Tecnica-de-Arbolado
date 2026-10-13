# Recursos y prerrequisitos

> Guía de referencia para trabajar con este repo. Guardala a mano — la vas a necesitar
> durante todo el cuatrimestre.

---

## Antes de empezar (prerrequisitos)

- **Cuenta de GitHub** (gratuita) — creála en [github.com](https://github.com) si no tenés.
- **Git instalado** en tu computadora — [git-scm.com](https://git-scm.com/downloads).
- **Un editor de código** — recomendado [Visual Studio Code](https://code.visualstudio.com/) (gratuito).
- **Markdown básico** — no hace falta saberlo de memoria, alcanza con tener la sintaxis a mano mientras escribís (ver recursos más abajo).
- **Para los diagramas:** no hace falta instalar nada — se pueden visualizar y editar directamente en [plantuml.com/plantuml/uml/](https://www.plantuml.com/plantuml/uml/). Si preferís trabajar en tu editor, existen extensiones de PlantUML para VS Code.

---

## Cómo arrancar

1. Un integrante del grupo entra al repo template y hace click en **"Use this template" → "Create a new repository"**. Le pone un nombre (ej: `eidas-grupo01-nombreproyecto`).
2. Agrega al resto del grupo como colaboradores: **Settings → Collaborators → Add people**.
3. **Todo el grupo agrega al profesor como colaborador con permiso de escritura** (Settings → Collaborators) — va a pedir el usuario de GitHub del profesor en clase.
4. Cada integrante clona el repo en su computadora:
   ```
   git clone <url-del-repo-del-grupo>
   ```

---

## Cheatsheet de git — lo que vas a usar en este trabajo

| Qué querés hacer | Comando |
|---|---|
| Traer el estado actual del repo (antes de empezar a trabajar) | `git pull` |
| Ver qué archivos cambiaste | `git status` |
| Agregar los cambios para el próximo commit | `git add .` |
| Guardar los cambios con un mensaje | `git commit -m "mensaje descriptivo"` |
| Subir los cambios a GitHub | `git push` |
| Ver el historial de cambios | `git log --oneline` |

**Flujo recomendado, cada vez que te pongas a trabajar:**

```
git pull                          (traer lo último que subieron tus compañeros)
... editás los archivos ...
git add .
git commit -m "Agrego requisitos del módulo de facturación"
git push
```

**Reglas para evitar líos:**

- Antes de empezar a trabajar, siempre `git pull` primero.
- Mensajes de commit descriptivos — no "cambios" o "asdf", sino qué hiciste realmente. Esto también es parte de lo que se evalúa como evidencia del proceso.
- Si dos personas editan el mismo archivo al mismo tiempo puede aparecer un **conflicto** — git lo marca en el archivo con `<<<<<<<`, `=======`, `>>>>>>>`. Hay que elegir qué versión dejar y sacar esas marcas a mano. Si se traban, mejor consultar en clase que forzar algo — **nunca uses `git push --force`**, puede borrar el trabajo de tus compañeros.

---

## Recursos en línea

- **Documentación oficial de GitHub (en español):** https://docs.github.com/es/get-started
- **Practicar git de forma interactiva y visual, en el navegador:** https://learngitbranching.js.org/
- **Guía de sintaxis de Markdown:** https://www.markdownguide.org/
- **Editor de PlantUML online, sin instalar nada:** https://www.plantuml.com/plantuml/uml/
- **PlantUML — sintaxis de diagramas de casos de uso:** https://plantuml.com/use-case-diagram
- **PlantUML — sintaxis de diagramas entidad-relación:** https://plantuml.com/ie-diagram

---

## Si se traban

No hay problema en pedir ayuda con git — es normal trabarse las primeras veces. Consultá en clase.

---

*Sistema EIDAS — Terciario Urquiza — Diseño de Sistemas Web*