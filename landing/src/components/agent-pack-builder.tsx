"use client";

import { useMemo, useState } from "react";

type ToggleOption = {
  key: string;
  label: string;
  description: string;
  defaultSelected?: boolean;
};

type AgentPackPreset = {
  key: string;
  label: string;
  description: string;
  agents: string[];
  profiles: string[];
  skills: string[];
  mcps: string[];
  oracles: string[];
};

const agents: ToggleOption[] = [
  {
    key: "claude-code",
    label: "Claude Code",
    description: "CLAUDE.md, repo-local skills, and enforcement through installed yieldOS hooks.",
  },
  {
    key: "codex",
    label: "Codex",
    description: "AGENTS.md plus progressive-disclosure skills in .agents/skills.",
  },
  {
    key: "cursor",
    label: "Cursor",
    description: "Project rules guidance; deterministic enforcement stays in yieldOS verification.",
  },
  {
    key: "github-copilot",
    label: "GitHub Copilot",
    description: "Repository instructions, path instructions, and review prompts.",
  },
  {
    key: "windsurf",
    label: "Windsurf",
    description: "Workspace rules plus skills with progressive disclosure.",
  },
];

const profiles: ToggleOption[] = [
  {
    key: "non-technical-safe",
    label: "non-technical-safe",
    description: "Plain-language stops before secrets, auth, paid services, deploys, and destructive changes.",
    defaultSelected: true,
  },
  {
    key: "read-only",
    label: "read-only",
    description: "Keep the agent in analysis and review mode until editing is requested.",
  },
  {
    key: "secrets-safe",
    label: "secrets-safe",
    description: "Block credential reads and secret-handling regressions.",
    defaultSelected: true,
  },
  {
    key: "dependency-safe",
    label: "dependency-safe",
    description: "Gate package installs, native equivalents, and lockfile risk.",
    defaultSelected: true,
  },
  {
    key: "code-audit",
    label: "code-audit",
    description: "Require security review state for sensitive changes.",
    defaultSelected: true,
  },
  {
    key: "network-safe",
    label: "network-safe",
    description: "Block remote bootstrap, vendored code, and private data egress.",
    defaultSelected: true,
  },
  {
    key: "db-safe",
    label: "db-safe",
    description: "Default database work to read-only and require approval for writes.",
  },
  {
    key: "production-safe",
    label: "production-safe",
    description: "Require explicit approval before deploys or live infrastructure changes.",
  },
  {
    key: "git-safe",
    label: "git-safe",
    description: "Protect push, commit, and instruction-file workflows.",
    defaultSelected: true,
  },
  {
    key: "testing-discipline",
    label: "testing-discipline",
    description: "Require fresh, scoped verification before claiming work is complete.",
    defaultSelected: true,
  },
  {
    key: "cost-aware",
    label: "cost-aware",
    description: "Prefer scoped scans and warn before costly agent work.",
  },
];

const skills: ToggleOption[] = [
  {
    key: "skill:init",
    label: "skill:init",
    description: "Official setup skill for creating baseline agent instructions.",
    defaultSelected: true,
  },
  {
    key: "skill:review",
    label: "skill:review",
    description: "Official code-review workflow for pull requests and diffs.",
    defaultSelected: true,
  },
  {
    key: "skill:dependency-gate",
    label: "skill:dependency-gate",
    description: "Approved workflow for dependency review and replacement.",
    defaultSelected: true,
  },
  {
    key: "skill:security-review",
    label: "skill:security-review",
    description: "Approved security review skill from the policy catalog.",
    defaultSelected: true,
  },
  {
    key: "skill:think",
    label: "skill:think",
    description: "Reviewed strategy skill for clarifying high-risk plans before implementation.",
  },
  {
    key: "skill:feature",
    label: "skill:feature",
    description: "Reviewed implementation sprint skill; enable only for trusted teams.",
  },
  {
    key: "skill:conductor",
    label: "skill:conductor",
    description: "Reviewed parallel-agent orchestration skill; useful for larger engineering teams.",
  },
  {
    key: "skill:compound",
    label: "skill:compound",
    description: "Reviewed post-work learning capture skill for maintaining team memory.",
  },
];

const mcps: ToggleOption[] = [
  {
    key: "mcp:filesystem",
    label: "mcp:filesystem",
    description: "Read, list, and search files only.",
  },
];

const oracles: ToggleOption[] = [
  {
    key: "code-audit-state",
    label: "code-audit-state",
    description: "Verifies committed audit state against the current diff.",
  },
  {
    key: "agent-pack-lock",
    label: "agent-pack-lock",
    description: "Checks generated guidance files against the pack lock.",
  },
  {
    key: "instruction-policy",
    label: "instruction-policy",
    description: "Blocks unsafe agent instruction edits with policy evidence.",
  },
  {
    key: "project-tests",
    label: "project-tests",
    description: "Runs detected project checks in commit or manual oracle contexts.",
  },
  {
    key: "cdsc-proof",
    label: "cdsc-proof",
    description: "Requires baseline fail plus fixed pass for supported contracts.",
  },
];

const defaultAgents = agents.map((agent) => agent.key);
const defaultProfiles = profiles
  .filter((profile) => profile.defaultSelected)
  .map((profile) => profile.key);
const defaultSkills = skills
  .filter((skill) => skill.defaultSelected)
  .map((skill) => skill.key);
const defaultMcps = mcps.map((mcp) => mcp.key);
const defaultOracles = ["code-audit-state", "agent-pack-lock", "instruction-policy", "project-tests"];

const presets: AgentPackPreset[] = [
  {
    key: "non-tech-safe",
    label: "Non-technical safe",
    description: "Strict default for teams where the user may not evaluate security tradeoffs.",
    agents: defaultAgents,
    profiles: defaultProfiles,
    skills: defaultSkills,
    mcps: defaultMcps,
    oracles: defaultOracles,
  },
  {
    key: "engineering-team",
    label: "Engineering team",
    description: "Balanced defaults for product teams already using coding agents daily.",
    agents: defaultAgents,
    profiles: ["secrets-safe", "dependency-safe", "code-audit", "network-safe", "git-safe", "testing-discipline"],
    skills: defaultSkills,
    mcps: defaultMcps,
    oracles: defaultOracles,
  },
  {
    key: "security-review",
    label: "Security review",
    description: "Read-heavy profile for risky diffs, auth changes, and pre-merge evidence.",
    agents: ["claude-code", "codex", "github-copilot"],
    profiles: ["read-only", "secrets-safe", "code-audit", "network-safe", "db-safe", "production-safe", "git-safe", "testing-discipline", "cost-aware"],
    skills: ["skill:review", "skill:security-review", "skill:dependency-gate", "skill:think"],
    mcps: defaultMcps,
    oracles: ["code-audit-state", "agent-pack-lock", "instruction-policy", "project-tests", "cdsc-proof"],
  },
];

function toggleValue(values: string[], key: string) {
  return values.includes(key)
    ? values.filter((value) => value !== key)
    : [...values, key];
}

function toggleRequiredValue(values: string[], key: string) {
  if (values.includes(key) && values.length === 1) return values;
  return toggleValue(values, key);
}

function renderAgentConfig(selectedAgents: string[]) {
  return agents
    .filter((agent) => selectedAgents.includes(agent.key))
    .map((agent) => `  ${agent.key}:\n    enabled: true`)
    .join("\n");
}

function renderList(values: string[], indent = "  ") {
  if (values.length === 0) return `${indent}[]`;
  return values.map((value) => `${indent}- ${value}`).join("\n");
}

function renderSkillAllow(selectedSkills: string[]) {
  if (selectedSkills.length === 0) return "  allow: []";
  return [
    "  allow:",
    ...selectedSkills.map((skill) => `    - key: ${skill}`),
  ].join("\n");
}

function renderMcpAllow(selectedMcps: string[]) {
  if (selectedMcps.length === 0) return "  allow: []";
  return [
    "  allow:",
    ...selectedMcps.map((mcp) =>
      [
        `    - key: ${mcp}`,
        "      approved_tools:",
        "        - read_file",
        "        - list_directory",
        "        - search_files",
      ].join("\n"),
    ),
  ].join("\n");
}

function buildManifest({
  selectedAgents,
  selectedProfiles,
  selectedSkills,
  selectedMcps,
  selectedOracles,
}: {
  selectedAgents: string[];
  selectedProfiles: string[];
  selectedSkills: string[];
  selectedMcps: string[];
  selectedOracles: string[];
}) {
  return [
    "version: 0.1",
    "kind: yield.agent-pack",
    "name: team-security-pack",
    "profiles:",
    renderList(selectedProfiles),
    "agents:",
    renderAgentConfig(selectedAgents),
    "skills:",
    renderSkillAllow(selectedSkills),
    "mcps:",
    renderMcpAllow(selectedMcps),
    "playbooks:",
    "  include:",
    "    - agent-pack-review",
    "oracles:",
    selectedOracles.length === 0 ? "  include: []" : "  include:",
    ...selectedOracles.map((oracle) => `    - ${oracle}`),
    "evidence:",
    "  pack_lock: yield.agent-pack.lock.json",
    "",
  ].join("\n");
}

function ToggleGrid({
  title,
  options,
  values,
  onToggle,
}: {
  title: string;
  options: ToggleOption[];
  values: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 sm:p-5">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
        {title}
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-2">
        {options.map((option) => {
          const checked = values.includes(option.key);

          return (
            <label
              key={option.key}
              className={`grid cursor-pointer grid-cols-[auto_1fr] gap-3 rounded-md border p-3 transition ${
                checked
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-zinc-200 bg-[#fafafa] text-zinc-950 hover:border-zinc-400"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(option.key)}
                className="mt-1 h-4 w-4 accent-[#e8ff00]"
              />
              <span>
                <span className="block text-sm font-medium">
                  {option.label}
                </span>
                <span
                  className={`mt-1 block text-sm leading-5 ${
                    checked ? "text-zinc-300" : "text-zinc-600"
                  }`}
                >
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

export function AgentPackBuilder() {
  const [activePreset, setActivePreset] = useState(presets[0].key);
  const [selectedAgents, setSelectedAgents] = useState(() => presets[0].agents);
  const [selectedProfiles, setSelectedProfiles] = useState(() => presets[0].profiles);
  const [selectedSkills, setSelectedSkills] = useState(() => presets[0].skills);
  const [selectedMcps, setSelectedMcps] = useState(() => presets[0].mcps);
  const [selectedOracles, setSelectedOracles] = useState(() => presets[0].oracles);
  const manifest = useMemo(
    () =>
      buildManifest({
        selectedAgents,
        selectedProfiles,
        selectedSkills,
        selectedMcps,
        selectedOracles,
      }),
    [selectedAgents, selectedProfiles, selectedSkills, selectedMcps, selectedOracles],
  );

  function downloadManifest() {
    const blob = new Blob([manifest], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "yield.agent-pack.yaml";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function markCustom() {
    setActivePreset("custom");
  }

  function applyPreset(preset: AgentPackPreset) {
    setActivePreset(preset.key);
    setSelectedAgents(preset.agents);
    setSelectedProfiles(preset.profiles);
    setSelectedSkills(preset.skills);
    setSelectedMcps(preset.mcps);
    setSelectedOracles(preset.oracles);
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
      <div className="grid grid-cols-1 gap-3">
        <section className="rounded-lg border border-zinc-200 bg-white p-4 sm:p-5">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
            Safety presets
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-2">
            {presets.map((preset) => {
              const selected = activePreset === preset.key;

              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={`rounded-md border p-3 text-left transition ${
                    selected
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-zinc-200 bg-[#fafafa] text-zinc-950 hover:border-zinc-400"
                  }`}
                >
                  <span className="block text-sm font-medium">{preset.label}</span>
                  <span className={`mt-1 block text-sm leading-5 ${selected ? "text-zinc-300" : "text-zinc-600"}`}>
                    {preset.description}
                  </span>
                </button>
              );
            })}
          </div>
          {activePreset === "custom" ? (
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              Custom selection. The CLI still validates every selected profile,
              skill, MCP, playbook, and oracle before writing repo files.
            </p>
          ) : null}
        </section>
        <ToggleGrid
          title="Target agents"
          options={agents}
          values={selectedAgents}
          onToggle={(key) =>
            setSelectedAgents((values) => {
              markCustom();
              return toggleRequiredValue(values, key);
            })
          }
        />
        <ToggleGrid
          title="Safety profiles"
          options={profiles}
          values={selectedProfiles}
          onToggle={(key) =>
            setSelectedProfiles((values) => {
              markCustom();
              return toggleRequiredValue(values, key);
            })
          }
        />
        <ToggleGrid
          title="Approved skills"
          options={skills}
          values={selectedSkills}
          onToggle={(key) =>
            setSelectedSkills((values) => {
              markCustom();
              return toggleValue(values, key);
            })
          }
        />
        <section className="rounded-lg border border-zinc-200 bg-white p-4 sm:p-5">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
            Custom skills
          </h2>
          <div className="mt-4 rounded-md border border-dashed border-zinc-300 bg-[#fafafa] p-3">
            <p className="text-sm font-medium text-zinc-950">
              Custom skills require policy review.
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Teams should submit a source URL, content hash, bundled script
              list, permission scope, and owner rationale before a skill appears
              in this builder. Browser upload is intentionally disabled until
              yieldOS can verify the artifact against policy.
            </p>
          </div>
        </section>
        <ToggleGrid
          title="Approved MCPs"
          options={mcps}
          values={selectedMcps}
          onToggle={(key) =>
            setSelectedMcps((values) => {
              markCustom();
              return toggleValue(values, key);
            })
          }
        />
        <ToggleGrid
          title="Approved oracles"
          options={oracles}
          values={selectedOracles}
          onToggle={(key) =>
            setSelectedOracles((values) => {
              markCustom();
              return toggleRequiredValue(values, key);
            })
          }
        />
      </div>

      <section className="sticky top-20 rounded-lg border border-zinc-800 bg-[#0e0e10] p-4 text-white sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              Generated source
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              yield.agent-pack.yaml
            </h2>
          </div>
          <button
            type="button"
            onClick={downloadManifest}
            className="inline-flex h-11 items-center justify-center rounded-md border border-[rgba(232,255,0,0.34)] bg-[rgba(232,255,0,0.08)] px-4 text-sm font-medium text-[#e8ff00] transition hover:bg-[rgba(232,255,0,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8ff00]/60 active:translate-y-px"
          >
            Download yield.agent-pack.yaml
          </button>
        </div>
        <pre className="mt-5 max-h-[680px] overflow-auto rounded-md border border-white/10 bg-black/35 p-4 text-xs leading-5 text-zinc-300">
          <code>{manifest}</code>
        </pre>
        <div className="mt-4 grid gap-2 text-sm leading-6 text-zinc-400">
          <p>
            Put this file at the repo root, then run{" "}
            <code className="font-mono text-zinc-200">
              yieldos-pack verify --pack yield.agent-pack.yaml
            </code>
            .
          </p>
          <p>
            A passing verify means every selected skill and MCP matched the
            local policy cache before generated files are written. Approved
            oracles are declared in the pack; run{" "}
            <code className="font-mono text-zinc-200">yieldos-oracle</code> or
            CI to execute them.
          </p>
        </div>
      </section>
    </div>
  );
}
