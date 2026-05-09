# Agent Packs: resumen para revisar antes del PR

Estado: listo para abrir PR, con limites explicitados
Fecha: 2026-05-09

## Resumen ejecutivo

Este cambio agrega una capa nueva a yieldOS: **Team Agent Packs**.

La idea es que un equipo pueda definir una vez sus reglas de trabajo con agentes: perfiles de seguridad, skills aprobadas, MCPs aprobados, playbooks y agentes objetivo. Esa configuracion vive en un archivo revisable, `yield.agent-pack.yaml`. Luego yieldOS valida ese pack contra policy y genera archivos nativos para Claude Code, Codex, Cursor, GitHub Copilot y Windsurf.

Esto no reemplaza el gate runtime de yieldOS. Lo complementa.

El objetivo estrategico es alinearse con la nueva tesis del producto:

> No queremos ganar solo gastando mas tokens para que el modelo razone mejor. Queremos que el agente trabaje dentro de reglas, playbooks, policies y evidencia que reducen ambiguedad, riesgo y prompt drift.

Para usuarios no tecnicos, el valor es mas directo:

> Pueden usar agentes de codigo con reglas de empresa y defaults seguros sin tener que entender cada decision de seguridad.

## Que problema resuelve

Hoy cada herramienta de AI coding tiene su propio sistema de instrucciones:

- Claude Code usa `CLAUDE.md`, hooks y skills.
- Codex usa `AGENTS.md` y skills.
- Cursor usa `.cursor/rules`.
- GitHub Copilot usa `.github/copilot-instructions.md`, `.github/instructions` y prompts.
- Windsurf usa reglas y skills.

Sin una capa de packaging, cada persona termina con una configuracion distinta. Un dev tiene una skill de seguridad, otro tiene un MCP con mas permisos, otro tiene reglas viejas, y un usuario no tecnico no puede saber si su setup es seguro.

Agent Packs convierte eso en un flujo controlado:

```text
reglas de equipo + skills aprobadas + MCPs aprobados + playbooks + perfiles
        |
        v
yield.agent-pack.yaml
        |
        v
yieldos-pack verify / preview / write
        |
        v
AGENTS.md / CLAUDE.md / Cursor / Copilot / Windsurf / skills / lock / report
```

## Que cambio en el repo

### 1. Nuevo comando `yieldos-pack`

Se agrego un compilador de packs:

```bash
yieldos-pack verify --pack yield.agent-pack.yaml
yieldos-pack preview --pack yield.agent-pack.yaml
yieldos-pack write --pack yield.agent-pack.yaml
```

Modos:

- `verify`: valida el pack contra policy sin escribir archivos.
- `preview`: muestra todos los archivos que se generarian.
- `write`: escribe archivos, pero no pisa archivos existentes salvo que se use `--force`.

### 2. Validacion deterministica de skills y MCPs

El pack no puede activar cualquier cosa. Antes de generar archivos:

- cada skill debe existir en `policy/skills.json`
- cada MCP debe existir en `policy/mcps.json`
- cada tool pedida por un MCP debe estar en `approved_tools`
- tools extra, como `write_file` en `mcp:filesystem`, bloquean el pack

Ejemplo:

```yaml
mcps:
  allow:
    - key: mcp:filesystem
      approved_tools:
        - read_file
        - list_directory
        - search_files
```

Si alguien intenta agregar `write_file`, `yieldos-pack verify` falla.

### 3. Archivos generados por agente

El pack puede generar:

- `AGENTS.md`
- `CLAUDE.md`
- `.claude/skills/**/SKILL.md`
- `.agents/skills/**/SKILL.md`
- `.cursor/rules/yieldos-security.mdc`
- `.cursor/skills/**/SKILL.md`
- `.github/copilot-instructions.md`
- `.github/instructions/yieldos-security.instructions.md`
- `.github/prompts/yieldos-security-audit.prompt.md`
- `.windsurf/rules/yieldos-security.md`
- `.windsurf/skills/**/SKILL.md`
- `.yield/pack-report.md`
- `yield.agent-pack.lock.json`

Esto nos permite decir: un pack es una fuente de verdad que se adapta al formato real de cada agente.

### 4. Web builder en `/agent-packs`

Se agrego una ruta nueva en la landing:

```text
/agent-packs
```

Desde ahi el usuario puede elegir:

- agentes objetivo
- perfiles de seguridad
- skills aprobadas
- MCPs aprobados

Y descargar:

```text
yield.agent-pack.yaml
```

Importante: la web no instala nada. Solo genera el manifest. La validacion real ocurre despues con `yieldos-pack verify`.

La lista de perfiles debe ser amplia porque son reglas internas de yieldOS ya revisadas: secretos, dependencias, auditoria de codigo, red, base de datos, produccion, git, testing, costo y modo read-only. La lista de skills, en cambio, debe ser curada: solo aparecen skills que ya existen en `policy/skills.json`.

No agregamos upload libre de skills. Es relevante permitir skills propias de empresa en el futuro, pero solo con review: source URL, content hash, scripts incluidos, permisos requeridos y justificacion del owner. El browser no puede validar eso por si solo.

### 5. Pack interno para dogfooding

Se agrego un pack interno:

```text
yieldOS/packs/yieldos-internal-security/yield.agent-pack.yaml
```

Sirve para que yieldOS use sus propios playbooks y reglas antes de venderle esta capa a otros equipos.

### 6. Contrato de seguridad para usuarios no tecnicos

Durante la review detectamos que generar archivos no era suficiente. Los outputs tenian que repetir claramente el contrato de seguridad.

Ahora los archivos generados incluyen:

```text
Non-technical user safety contract
```

Ese contrato dice, en esencia:

- usar policy deterministica de yieldOS antes que juicio del modelo
- `allowed` significa que pasaron checks configurados, no que algo esta probado como seguro
- no instalar o habilitar skills, MCPs, dependencias, scripts remotos o binarios no aprobados
- frenar y explicar en lenguaje simple antes de tocar secretos, auth, datos, costos, deploys o produccion
- preferir cambios chicos, reversibles y con evidencia fresca

Esto es clave para la vision de "code without fear" para talento no tecnico.

## Por que esto importa para la vision de producto

La vision vieja podia sonar como:

> Le tiramos mas tokens al codigo hasta que el modelo encuentre y arregle cosas.

Este cambio empuja otra direccion:

> Reducimos lo que el modelo tiene que inventar desde cero dandole policy, reglas, playbooks, skills y evidencia.

Mecanismos concretos:

- Policy bloquea decisiones obvias sin gastar tokens.
- Skills/playbooks convierten seguridad en workflows reutilizables.
- Los adapters evitan que cada herramienta tenga reglas distintas.
- El lockfile registra que reglas estuvieron activas.
- El agente recibe contexto mas chico y mas relevante.

Esto hace que yieldOS sea mas que un scanner. Lo acerca a un **security harness para agentes de codigo**.

## Que queda honestamente fuera de alcance

Este PR no deberia prometer mas de lo que hace.

No hace todavia:

- instalacion global real en `~/.agents/skills`
- instalacion automatica de MCP servers externos
- enforcement duro igual en Cursor, Copilot o Windsurf
- zip export con todos los archivos generados desde la web
- upload libre de skills custom desde la web
- panel SaaS, RBAC, excepciones, auditoria por organizacion o SIEM
- vector DB
- prueba matematica de que el codigo generado es seguro

La frase correcta:

> One source of truth, native outputs for each agent, strongest enforcement where the host exposes hooks or policy controls.

No deberiamos decir:

> Works equally across every coding agent.

## Review del cambio

### Hallazgos que se corrigieron antes de abrir PR

1. **La web builder emitia una skill no aprobada**

El builder ofrecía `skill:security-audit`, pero `policy/skills.json` no la aprobaba. Eso significaba que un usuario podia descargar un pack que despues fallaba en `yieldos-pack verify`.

Se corrigio usando `skill:security-review`, que si esta en policy.

2. **`pack_lock` podia apuntar fuera del proyecto**

El campo `evidence.pack_lock` venia del manifest. Si alguien ponia una ruta tipo `../...`, el comando podia escribir fuera del repo.

Se agrego validacion para que `pack_lock` siempre quede dentro del proyecto.

3. **Claude-only packs no recibian el contrato de seguridad**

Si el pack solo apuntaba a Claude Code, se generaba `CLAUDE.md` sin el bloque de seguridad del pack.

Se corrigio para que el contrato se escriba tambien cuando no hay `AGENTS.md`.

4. **El lockfile llamaba `content_sha256` a algo que no era contenido real**

El lock registraba un hash de metadata de policy como `content_sha256`. Eso era confuso.

Ahora registra `policy_entry_sha256` para la entrada de policy y reserva `content_sha256` para cuando policy tenga un hash real de contenido.

## Riesgos residuales

Estos no bloquean el PR, pero hay que tenerlos claros:

- Cursor, Copilot y Windsurf son guidance/adapters, no gates duros como Claude Code con hooks.
- `policy/skills.json` todavia permite algunas skills third-party por nombre y no por hash. Para una version mas fuerte, deberiamos exigir hash para third-party.
- El builder web usa una lista curada estatica. No lee policy en vivo.
- Las skills custom todavia deben entrar por review manual de policy, no por upload directo.
- El parser YAML es intencionalmente chico y soporta el subset que generamos. No es un parser YAML completo.
- El flujo web descarga solo `yield.agent-pack.yaml`; no descarga todavia un zip con todos los outputs generados.

## Como probarlo

Desde la landing:

```bash
cd landing
npm run dev
```

Abrir:

```text
http://localhost:3000/agent-packs
```

Descargar `yield.agent-pack.yaml`, copiarlo a la raiz de un repo y correr:

```bash
yieldos-pack verify --pack yield.agent-pack.yaml
yieldos-pack preview --pack yield.agent-pack.yaml
yieldos-pack write --pack yield.agent-pack.yaml
```

Para probar el pack interno:

```bash
yieldos-pack preview --pack yieldOS/packs/yieldos-internal-security/yield.agent-pack.yaml
```

## Verificacion corrida

Se corrio:

```bash
git diff --check
(cd yieldOS/plugins/yieldos && node --test tests/*.test.js)
(cd landing && npm test)
(cd landing && npm run lint)
(cd landing && npm run build)
```

Tambien se hizo una prueba real:

- se genero un proyecto temporal limpio
- se escribio un `yield.agent-pack.yaml`
- se corrio `yieldos-pack verify`
- se corrio `yieldos-pack write`
- se verifico que se escribieran adapters y skills reales
- se verifico que el manifest descargado desde `/agent-packs` pase `yieldos-pack verify`

## Recomendacion

Si el PR se presenta como:

> Team Agent Packs: policy-validated source of truth for agent rules, skills, MCPs and playbooks.

Entonces esta listo para abrir PR.

Si se presenta como:

> Full cross-agent security enforcement.

Entonces no esta listo, porque eso seria overclaiming.

La version correcta del mensaje:

> yieldOS ahora puede empaquetar reglas de equipo y perfiles de seguridad en archivos nativos para los agentes que usamos. Claude Code tiene el camino de enforcement mas fuerte por hooks; los demas agentes reciben guidance nativo y evidencia revisable. Esto nos acerca a la promesa de safe coding para talento no tecnico porque reduce decisiones invisibles y fuerza un contrato de seguridad antes de que el agente actue.
