# yieldOS

<img src="./project-logo.png" alt="Logo de yieldOS" width="180" />

**Contratos de seguridad ejecutables para agentes de IA que escriben código.**

[![Plugin CI](https://github.com/platanus-hack/platanus-hack-26-ar-team-10/actions/workflows/plugin.yml/badge.svg)](https://github.com/platanus-hack/platanus-hack-26-ar-team-10/actions/workflows/plugin.yml)
[![Security CI](https://github.com/platanus-hack/platanus-hack-26-ar-team-10/actions/workflows/security.yml/badge.svg)](https://github.com/platanus-hack/platanus-hack-26-ar-team-10/actions/workflows/security.yml)
[![Último release](https://img.shields.io/github/v/release/platanus-hack/platanus-hack-26-ar-team-10?label=release&filter=yieldos--*)](https://github.com/platanus-hack/platanus-hack-26-ar-team-10/releases)
[![Node 18+](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](#validación-local)
[![Licencia: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#licencia)

Los agentes de IA pueden instalar dependencias, agregar herramientas, editar archivos de instrucciones, leer secretos y commitear código más rápido de lo que cualquier revisión manual puede inspeccionar paso a paso. yieldOS es un harness de seguridad guiado por oráculos que convierte acciones riesgosas del agente en contratos de seguridad, contraejemplos y evidencia de fix. **El modelo puede proponer. El oráculo decide.**

> Construido en **Platanus Hack 26 — Buenos Aires** por team-10, track AI Security. Landing: [landing-yield.vercel.app](https://landing-yield.vercel.app/). Read it in [English](./README.md).

---

## Tabla de contenidos

- [Por qué](#por-qué)
- [Qué funciona hoy](#qué-funciona-hoy)
- [Quickstart](#quickstart)
- [Probá la demo](#probá-la-demo)
- [Instalación verificada](#instalación-verificada)
- [Comandos del plugin](#comandos-del-plugin)
- [Mapa del repositorio](#mapa-del-repositorio)
- [Validación local](#validación-local)
- [Documentación](#documentación)
- [Límites actuales](#límites-actuales)
- [Release](#release)
- [Equipo](#equipo)
- [Licencia](#licencia)

---

## Por qué

Cada `npm install`, `pip install`, registro de MCP o edición de `AGENTS.md` que ejecuta un agente de IA es una decisión de confianza que el usuario casi nunca ve. La historia de los ataques de supply-chain (`event-stream`, `node-ipc`, `ua-parser-js`, `colors`, `crossenv`) muestra el costo de equivocarse en esa decisión.

yieldOS toma esas decisiones **antes** de que el trabajo riesgoso sea aceptado, contra políticas y evidencia ejecutable que se puede chequear sin llamar al modelo. Más contexto en [`yieldOS/docs/01-philosophy.md`](./yieldOS/docs/01-philosophy.md).

---

## Qué funciona hoy

### Hooks

- Hooks del plugin de Claude Code para `SessionStart`, `UserPromptSubmit`, `PreToolUse` y `PostToolUse`.

### Gates antes de ejecutar

- Gateo previo de instalaciones de paquetes, instalación de skills, registros directos de MCP, edición de manifests, código vendoreado, instaladores remotos por shell, ediciones de archivos de instrucciones, evidencia protegida de yieldOS y lecturas de archivos de credenciales.
- Protección de credenciales: las lecturas de `.env`, `.ssh`, `.aws`, `.kube` y rutas similares requieren autorización local explícita.

### Auditoría de código y eventos a prueba de manipulación

- Auditoría del código fuente en commit/push con findings de red-team, fixes deterministas de blue-team cuando es seguro, y `security/code-audit-state.json` atado al commit.
- Eventos de auditoría locales a prueba de manipulación en `security/yieldos-events.jsonl`, con redacción de secretos, verificación de cadena de hashes y un checkpoint de cola fuera del repo para revisión.

### Oráculos y contratos de seguridad

- Contratos de seguridad guiados por contraejemplos: definir el invariante, replay del baseline inseguro, replay del runtime corregido y guardado de artefactos de prueba acotados.
- Runner de oráculos con resultados acotados `pass`, `fail` y `unknown`. Los oráculos ejecutan contratos; para acciones sensibles, `unknown` bloquea por defecto.

### Team agent packs

- Packs de agentes para equipos que validan skills, MCPs, playbooks, profiles, oráculos, archivos generados y pack locks aprobados.

### Comandos del plugin

- `/yieldos:audit`, `/yieldos:init`, `/yieldos:pack`, `/yieldos:oracle`, `/yieldos:oracle-demo`, `/yieldos:pentest` y `/yieldos:update`. Ver la [tabla de comandos](#comandos-del-plugin).

---

## Quickstart

Una vez que tengas Claude Code instalado y acceso a una terminal, instalá yieldOS con un solo curl:

```bash
curl -fsSL https://raw.githubusercontent.com/platanus-hack/platanus-hack-26-ar-team-10/main/install.sh | sh -s -- --source platanus-hack/platanus-hack-26-ar-team-10
```

El flag `--source platanus-hack/platanus-hack-26-ar-team-10` le dice al instalador dónde vive el marketplace durante el hackathon (la org `yieldos/yieldos` va a publicar el mismo plugin cuando esté lista).

Después del install, reiniciá Claude Code (o corré `/reload-plugins`) y yieldOS gateará automáticamente las llamadas a `Bash`, `Write`, `Edit` y `Read`.

Para el flujo verificado con checksums, ver [Instalación verificada](#instalación-verificada).

---

## Probá la demo

La forma más rápida de ver a yieldOS decidir en vivo, end-to-end, desde un checkout limpio:

```bash
yieldOS/plugins/yieldos/bin/yieldos-oracle-demo missing-auth
```

Lo que vas a ver, en orden:

1. Una ruta admin vulnerable devuelve `200` sin autenticación.
2. yieldOS escribe un contrato acotado: las requests no autenticadas deben recibir `401` o `403`.
3. El replay del contraejemplo prueba que el baseline viola el contrato.
4. El agente puede patchear la ruta, pero el modelo no puede declararse ganador por sí mismo.
5. El mismo replay prueba que el runtime corregido elimina el contraejemplo.
6. Los artefactos de prueba quedan como evidencia hasheable bajo `security/oracles/`.

Para correr una auditoría explícita del código modificado en la branch actual:

```text
/yieldos:audit
```

Para correr el loop adversarial local de red-team / blue-team:

```text
/yieldos:pentest --max-rounds 3 --converge 2 --dry-run
```

Para inspeccionar todos los contratos de oráculo enviados:

```text
/yieldos:oracle contracts
```

Walk-through detallado y qué significa cada línea de salida: [`yieldOS/docs/22-oracle-demo-script.md`](./yieldOS/docs/22-oracle-demo-script.md).

---

## Instalación verificada

Flujo de instalación enterprise con verificación de archivos antes de ejecutar:

```bash
curl -fsSLO https://github.com/platanus-hack/platanus-hack-26-ar-team-10/releases/download/yieldos--v0.13.0/install.sh
curl -fsSLO https://github.com/platanus-hack/platanus-hack-26-ar-team-10/releases/download/yieldos--v0.13.0/checksums.txt
shasum -a 256 -c checksums.txt --ignore-missing
sh install.sh --source platanus-hack/platanus-hack-26-ar-team-10 --dry-run
sh install.sh --source platanus-hack/platanus-hack-26-ar-team-10
```

El install público usa el paquete limpio en [`dist/yieldos-plugin/`](./dist/yieldos-plugin). Trae hooks, comandos, cache de policy, runtime del dashboard, skills y contratos de oráculo. **No** trae tests, mocks ni fixtures intencionalmente vulnerables.

La evidencia de benchmarks está resumida en [`benchmarks/README.md`](./benchmarks/README.md). El benchmark sobre repos reales muestra que los ataques de workflow probados fueron bloqueados antes del commit; no afirma que los repos objetivo estén completamente seguros. Usá `npm run evidence:verify -- <reports...>` para separar reportes de prueba pública de artefactos de revisión interna antes de hacer afirmaciones externas.

Para adapters soportados, flujos de datos y límites de afirmaciones, ver [`yieldOS/docs/enterprise-boundaries.md`](./yieldOS/docs/enterprise-boundaries.md).

---

## Comandos del plugin

| Comando | Qué hace | Detalle |
| --- | --- | --- |
| `/yieldos:audit` | Auditoría on-demand del código modificado (Deepsec en modo PR por defecto; flags `--staged`, `--working`, `--base <ref>`, `--full`). | [`docs/13-audit-command.md`](./yieldOS/docs/13-audit-command.md) |
| `/yieldos:init` | Generación preview-first de instrucciones de seguridad para `AGENTS.md` y `CLAUDE.md`. Solo escribe con `--write`. | [`docs/14-custom-instructions.md`](./yieldOS/docs/14-custom-instructions.md) |
| `/yieldos:pack` | Compila un `yield.agent-pack.yaml` revisado en guidance nativo del host (Claude Code, Codex, Cursor, Copilot, Windsurf), con pack lock y verificación. | [`docs/17-team-agent-packs.md`](./yieldOS/docs/17-team-agent-packs.md) |
| `/yieldos:oracle` | Descubre y corre checks de oráculo acotados. Devuelve `pass`, `fail` o `unknown`. | [`docs/19-oracle-driven-harness.md`](./yieldOS/docs/19-oracle-driven-harness.md) |
| `/yieldos:oracle-demo` | Flujo visible contraejemplo → fix → prueba para el contrato `missing-auth`. | [`docs/22-oracle-demo-script.md`](./yieldOS/docs/22-oracle-demo-script.md) |
| `/yieldos:pentest` | Loop adversarial local red-team / blue-team con memoria persistente y dashboard en vivo. | [`docs/15-pentest-loop.md`](./yieldOS/docs/15-pentest-loop.md) |
| `/yieldos:update` | Refresca el plugin instalado al último release. Equivalente a `claude plugins update yieldos@yieldos`. | [`yieldOS/README.md`](./yieldOS/README.md#updates-and-releases) |

---

## Mapa del repositorio

| Path | Propósito |
| --- | --- |
| [`install.sh`](./install.sh) | Instalador del plugin de Claude Code. |
| [`policy/`](./policy) | Source-of-truth de la policy en runtime: allowlist, denylist, skills, MCPs, categorías, equivalentes nativos, settings y patterns de inyección. Ver [`policy/README.md`](./policy/README.md). |
| [`yieldOS/`](./yieldOS) | Workspace del producto: código del plugin, docs, packs, playbooks, runner de benchmarks. |
| [`yieldOS/plugins/yieldos/`](./yieldOS/plugins/yieldos) | El plugin de Claude Code en sí: hooks, comandos, scripts, dashboard, cache de policy enviado y tests. |
| [`yieldOS/docs/`](./yieldOS/docs) | Docs de producto y arquitectura. El índice separa superficies enviadas de planes futuros. |
| [`yieldOS/packs/`](./yieldOS/packs) | Manifesto del team agent pack interno. |
| [`yieldOS/playbooks/`](./yieldOS/playbooks) | Playbooks revisados, compilados por `/yieldos:pack`. |
| [`dist/yieldos-plugin/`](./dist/yieldos-plugin) | Paquete instalable limpio usado por el manifest del marketplace. |
| [`examples/oracle-demo/`](./examples/oracle-demo) | Fixture ejecutable de baseline/fixed para `missing-auth`, fuera del paquete de producción. Ver [`examples/oracle-demo/README.md`](./examples/oracle-demo/README.md). |
| [`benchmarks/`](./benchmarks) | Reportes de benchmark commiteados y notas. |
| [`landing/`](./landing) | Landing page de Next.js, aislada del runtime del plugin. |
| [`scripts/`](./scripts) | Tooling a nivel repo: helper de release, packaging del plugin, policy check, secret-scan smoke, evidence verifier, runners de benchmarks. |
| [`.github/workflows/`](./.github/workflows) | CI para validación del plugin, scans de seguridad, packaging de release y la matriz de tests de yieldOS. |

---

## Validación local

El runtime del plugin soporta **Node.js 18+**. El toolchain de root y landing está fijado a **Node.js 22.x**.

Desde un clone limpio:

```bash
git clone https://github.com/platanus-hack/platanus-hack-26-ar-team-10.git
cd platanus-hack-26-ar-team-10
sh install.sh --dry-run
node scripts/plugin-check.mjs
npm run package:plugin
npm test
```

Para iterar solo en el plugin:

```bash
cd yieldOS/plugins/yieldos
node --test tests/*.test.js
```

Para iterar solo en la landing:

```bash
npm --prefix ./landing ci
npm --prefix ./landing run lint
npm --prefix ./landing run build
```

Si tenés soporte de plugins de Claude Code disponible localmente:

```bash
claude plugins validate .
claude plugins validate yieldOS/plugins/yieldos
```

---

## Documentación

| Documento | Qué cubre |
| --- | --- |
| [`yieldOS/README.md`](./yieldOS/README.md) | README de producto con el diagrama completo del decision-flow y referencia de comandos. |
| [`yieldOS/docs/README.md`](./yieldOS/docs/README.md) | Índice de todas las docs de diseño (filosofía, arquitectura, decision log, oráculos, agent packs, enterprise boundaries). |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Comandos de validación local, límites de seguridad y checklist de PR. |
| [`SECURITY.md`](./SECURITY.md) | Versiones soportadas, reporte de vulnerabilidades y expectativas de triage. |
| [`SUPPORT.md`](./SUPPORT.md) | Dónde reportar bugs, falsos positivos y preguntas sobre benchmarks. |
| [`CHANGELOG.md`](./CHANGELOG.md) | Versiones publicadas y qué fue en cada una. |
| [`benchmarks/README.md`](./benchmarks/README.md) | Metodología de benchmarks, evidencia pública vs. de revisión local. |
| [`policy/README.md`](./policy/README.md) | Schema de la policy en runtime y flujo de contribución. |
| [`landing/README.md`](./landing/README.md) | Setup de la landing y configuración de Vercel. |
| [`README.md`](./README.md) | Este README en inglés. |

---

## Límites actuales

- El enforcement fuerte en runtime es el de los hooks de Claude Code. Los outputs de Codex, Cursor, Copilot y Windsurf generados por agent packs son guidance revisable salvo que estén combinados con host policy, verificación de yieldOS o CI.
- Deepsec es tooling externo opcional para `/yieldos:audit`; yieldOS imprime instrucciones de setup si no está disponible.
- `pass` en un contrato de seguridad significa que el sujeto exacto y acotado pasó el check exacto del oráculo. No es prueba general de que el repo entero esté seguro.
- La policy en runtime se distribuye como JSON y se refresca desde `/policy`; las ediciones locales del usuario no son autoridad de policy.
- Los contratos de oráculo se publican con status. Leé `active-adapter`, `active-demo` y `contract-only` literalmente; un `contract-only` es una forma de contrato revisada, no una afirmación de cobertura ejecutable.
- El paquete de producción excluye tests, mocks y fixtures intencionalmente vulnerables. Las demos para reviewers viven bajo `examples/`.
- Los team agent packs validan referencias a la policy de MCPs y listas de tools aprobadas. Los `claude mcp add` directos están bloqueados hasta que exista validación de fuente y de superficie de tools; la activación revisada de MCPs debe pasar por verificación de pack.
- El scanner de Dockerfile y un gate de CI sobre lockfiles solos son notas de diseño, no comportamiento de runtime enviado.

---

## Release

Los maintainers publican un release del plugin desde la raíz del repo:

```bash
node scripts/release.mjs bump patch --note "Describe the change"
npm run package:plugin
node scripts/plugin-check.mjs
(cd yieldOS/plugins/yieldos && node --test tests/*.test.js)
git add .
git commit -m "Release yieldOS vX.Y.Z"
git tag yieldos--vX.Y.Z
git push origin main yieldos--vX.Y.Z
```

Claude Code usa la versión del plugin en [`yieldOS/plugins/yieldos/.claude-plugin/plugin.json`](./yieldOS/plugins/yieldos/.claude-plugin/plugin.json) más los manifestos del marketplace para decidir si hay update disponible.

---

## Equipo

team-10 — Platanus Hack 26, Buenos Aires.

- Ignacio Estevo — [@NachoEstevo](https://github.com/NachoEstevo)
- Sebastian Buffo Sempe — [@sbuffose](https://github.com/sbuffose)
- Franco Ferreira — [@frxnnk](https://github.com/frxnnk)
- Mauro Proto Cassina — [@MauroProto](https://github.com/MauroProto)

---

## Licencia

MIT. Ver la nota de licencia en [`yieldOS/README.md`](./yieldOS/README.md#license).
