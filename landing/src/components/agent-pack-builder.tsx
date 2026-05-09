"use client";

import { useMemo, useState } from "react";

type ToggleOption = {
  key: string;
  label: string;
  description: string;
};

const agents: ToggleOption[] = [
  {
    key: "claude-code",
    label: "Claude Code",
    description: "CLAUDE.md, hooks guidance, and repo-local skills.",
  },
  {
    key: "codex",
    label: "Codex",
    description: "AGENTS.md plus repo-local skills in .agents/skills.",
  },
  {
    key: "cursor",
    label: "Cursor",
    description: "Native .cursor/rules plus skill folders.",
  },
  {
    key: "github-copilot",
    label: "GitHub Copilot",
    description: "Repository instructions, path instructions, and prompts.",
  },
  {
    key: "windsurf",
    label: "Windsurf",
    description: "Workspace rules and skill folders.",
  },
];

const profiles: ToggleOption[] = [
  {
    key: "read-only",
    label: "read-only",
    description: "Keep the agent in analysis and review mode until editing is requested.",
  },
  {
    key: "secrets-safe",
    label: "secrets-safe",
    description: "Block credential reads and secret-handling regressions.",
  },
  {
    key: "dependency-safe",
    label: "dependency-safe",
    description: "Gate package installs, native equivalents, and lockfile risk.",
  },
  {
    key: "code-audit",
    label: "code-audit",
    description: "Require security review state for sensitive changes.",
  },
  {
    key: "network-safe",
    label: "network-safe",
    description: "Block remote bootstrap, vendored code, and private data egress.",
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
  },
  {
    key: "testing-discipline",
    label: "testing-discipline",
    description: "Require fresh, scoped verification before claiming work is complete.",
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
  },
  {
    key: "skill:review",
    label: "skill:review",
    description: "Official code-review workflow for pull requests and diffs.",
  },
  {
    key: "skill:dependency-gate",
    label: "skill:dependency-gate",
    description: "Approved workflow for dependency review and replacement.",
  },
  {
    key: "skill:security-review",
    label: "skill:security-review",
    description: "Approved security review skill from the policy catalog.",
  },
];

const mcps: ToggleOption[] = [
  {
    key: "mcp:filesystem",
    label: "mcp:filesystem",
    description: "Read, list, and search files only.",
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
}: {
  selectedAgents: string[];
  selectedProfiles: string[];
  selectedSkills: string[];
  selectedMcps: string[];
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
  const [selectedAgents, setSelectedAgents] = useState(() =>
    agents.map((agent) => agent.key),
  );
  const [selectedProfiles, setSelectedProfiles] = useState(() =>
    [
      "secrets-safe",
      "dependency-safe",
      "code-audit",
      "network-safe",
      "git-safe",
      "testing-discipline",
    ],
  );
  const [selectedSkills, setSelectedSkills] = useState(() =>
    skills.map((skill) => skill.key),
  );
  const [selectedMcps, setSelectedMcps] = useState(() =>
    mcps.map((mcp) => mcp.key),
  );
  const manifest = useMemo(
    () =>
      buildManifest({
        selectedAgents,
        selectedProfiles,
        selectedSkills,
        selectedMcps,
      }),
    [selectedAgents, selectedProfiles, selectedSkills, selectedMcps],
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

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
      <div className="grid grid-cols-1 gap-3">
        <ToggleGrid
          title="Target agents"
          options={agents}
          values={selectedAgents}
          onToggle={(key) =>
            setSelectedAgents((values) => toggleRequiredValue(values, key))
          }
        />
        <ToggleGrid
          title="Safety profiles"
          options={profiles}
          values={selectedProfiles}
          onToggle={(key) =>
            setSelectedProfiles((values) => toggleRequiredValue(values, key))
          }
        />
        <ToggleGrid
          title="Approved skills"
          options={skills}
          values={selectedSkills}
          onToggle={(key) => setSelectedSkills((values) => toggleValue(values, key))}
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
          onToggle={(key) => setSelectedMcps((values) => toggleValue(values, key))}
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
            local policy cache before generated files are written.
          </p>
        </div>
      </section>
    </div>
  );
}
