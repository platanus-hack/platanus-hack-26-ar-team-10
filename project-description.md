# yieldOS

**Security suite con oráculos para agentes de IA. El modelo propone. La evidencia decide.**

<img src="./project-logo.png" alt="yieldOS" width="180" />

---

## El problema

Los agentes de IA (Claude Code, Codex, Cursor) escriben, instalan y commitean código más rápido de lo que cualquier humano puede revisar. Cada `npm install`, cada nuevo MCP, cada edición a `CLAUDE.md`, cada lectura de `.env` y cada commit es una decisión de seguridad que hoy nadie revisa. La historia está llena de incidentes — `event-stream`, `node-ipc`, `ua-parser-js`, `colors.js`, `crossenv`, log4shell — y con agentes esto se acelera.

## Qué hace yieldOS

yieldOS se mete entre el agente y tu proyecto, y trabaja en **dos capas a la vez**:

### Defensa externa — lo que entra al repo

Plugin de Claude Code que corre en vivo. Cada vez que el agente intenta:

- instalar un paquete (`npm`, `pnpm`, `yarn`, `bun`, `pip`, `poetry`, `uv`, `cargo`, `go`)
- ejecutar un comando shell sospechoso
- agregar un MCP o activar un skill no aprobado
- editar archivos de instrucciones (`CLAUDE.md`, `AGENTS.md`)
- leer credenciales (`.env`, `.ssh`, `.aws`, `.kube`)
- vendorizar código o bajar binarios remotos

…yieldOS intercepta la acción **antes** de que toque tu repo y la decide: bloquear, permitir, o reescribir. Las decisiones son determinísticas, basadas en una policy curada centralmente, no en la opinión del LLM.

### Defensa interna — lo que sale del repo

Antes de cada commit y push, un **oráculo** corre checks determinísticos sobre el código cambiado: rutas administrativas sin autenticación, secretos filtrados, ediciones inseguras a archivos de configuración, patrones SQL/SSRF conocidos. Si algún check falla, el commit queda bloqueado con evidencia hashable de qué se rompió. El agente puede patchear, pero **no puede declarar la victoria** — el oráculo re-corre la misma evidencia y solo si pasa, el commit avanza.

Cada oráculo devuelve `pass`, `fail` o `unknown`. Para acciones sensibles, `unknown` bloquea por defecto.

## Por qué importa: agente vs oráculo

Pedirle al agente que se revise a sí mismo es caro y no determinista. Medimos:

| Métrica | Claude Opus 4.7 (self-review) | Oráculo de yieldOS |
|---|---|---|
| Tiempo por chequeo | ≈ 12 s | 150 ms |
| Costo por chequeo riesgoso | $0.60 | $0 |
| Determinismo | No | Sí |
| Mismo input → mismo output | No | Sí |

Sobre un set de calibración de 12 casos, dejar al agente revisar costó **$5.40** vs **$0.72** con yieldOS — **−87%** en gasto de modelo, sin perder cobertura sobre los casos cubiertos.

## Demo en vivo

```bash
yieldOS/plugins/yieldos/bin/yieldos-oracle-demo missing-auth
```

Lo que pasa:

1. El agente crea una ruta `/admin/users` sin autenticación. Devuelve `200`.
2. yieldOS escribe un contrato: requests no autenticados deben recibir `401` o `403`.
3. El replay del baseline contra el runtime vulnerable muestra que la regla se rompe.
4. El agente parchea — pero el modelo no decide que está OK.
5. El mismo replay corre contra el runtime parcheado y devuelve `401`.
6. El proof manifest queda guardado: baseline-fail + fixed-pass, scoped a esa ruta y ese replay.

## Lo que ya funciona hoy

- Hooks de Claude Code: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`.
- Pre-action gating sobre 12+ vectores (paquetes, skills, MCPs, manifests, vendoring, binarios remotos, instrucciones, credenciales, evidencia protegida).
- Code-audit en `git commit` y `git push` con loop red-team / blue-team determinístico.
- Eventos auditables en `security/yieldos-events.jsonl` con redacción de secretos, hash-chain y tail checkpoint fuera del repo para revisión.
- Counterexample-driven security contracts: definir el invariante, replay del baseline inseguro, replay del runtime parcheado, evidencia hashable.
- Team agent packs que validan skills, MCPs, playbooks, profiles, oráculos y locks aprobados.
- Comandos de plugin: `/yieldos:audit`, `/yieldos:init`, `/yieldos:pack`, `/yieldos:oracle`, `/yieldos:pentest`, `/yieldos:update`.

## Cómo se instala

Una sola línea:

```bash
curl -fsSL https://raw.githubusercontent.com/platanus-hack/platanus-hack-26-ar-team-10/main/install.sh | sh -s -- --source platanus-hack/platanus-hack-26-ar-team-10
```

O con verificación de checksums antes de ejecutar:

```bash
curl -fsSLO https://github.com/platanus-hack/platanus-hack-26-ar-team-10/releases/download/yieldos--v0.13.0/install.sh
curl -fsSLO https://github.com/platanus-hack/platanus-hack-26-ar-team-10/releases/download/yieldos--v0.13.0/checksums.txt
shasum -a 256 -c checksums.txt --ignore-missing
sh install.sh --source platanus-hack/platanus-hack-26-ar-team-10
```

`--dry-run` permite revisar el flujo antes de aplicarlo.

## Stack

- **Plugin:** Node.js 18+, sin dependencias externas (usa `node:test`). Detectores y analizadores propios, policy ship as JSON.
- **Landing:** Next.js 16 + React 19 + Tailwind v4, deployada en Vercel.
- **CI:** GitHub Actions, suite de tests, benchmarks reproducibles.

## Límites del prototipo (honestos)

- El refuerzo runtime fuerte vive en los hooks de Claude Code. Para Codex, Cursor, Copilot y Windsurf, los agent packs generan guidance reviewable; el enforcement determinístico requiere yieldOS hooks o CI.
- `pass` de un contrato significa que el subject exacto pasó el oráculo configurado. **No** es prueba de que todo el repo es seguro.
- Cobertura actual de oráculos: missing-auth está totalmente implementado y demo-able. Otros contratos (SSRF, SQL, secretos) están documentados como contract-only o en desarrollo.

## Equipo

- Ignacio Estevo — [@NachoEstevo](https://github.com/NachoEstevo)
- Sebastian Buffo Sempe — [@sbuffose](https://github.com/sbuffose)
- Franco Ferreira — [@frxnnk](https://github.com/frxnnk)
- Mauro Proto Cassina — [@MauroProto](https://github.com/MauroProto)

---

**Landing:** [landing-yield.vercel.app](https://landing-yield.vercel.app/)
**Repo:** [github.com/platanus-hack/platanus-hack-26-ar-team-10](https://github.com/platanus-hack/platanus-hack-26-ar-team-10)
