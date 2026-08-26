# Available Skills — Inventory (Phase 0)

Scanned 2026-08-26. This lists every skill available to Claude Code in this session and how it maps
to the UHC Uster ticket shop brief. Per the brief: a relevant skill must be read *before* writing the
code it covers, not checked afterwards.

## Skills the brief explicitly mandates

| Skill | Source | Status | Use in this project |
|---|---|---|---|
| `frontend-design` | plugin `frontend-design:frontend-design` | available | **Mandatory** before any UI component, page, or styling decision (Phases 2–3). Guidance for distinctive visual design, typography, avoiding templated defaults — directly relevant to the "don't look like the club website, but keep its colours" brief. |
| `pdf` | plugin `anthropic-skills:pdf` | available | **Mandatory** for the season pass PDF in Phase 6. |
| `xlsx` | plugin `anthropic-skills:xlsx` | available | **Mandatory** for the order export in Phase 5. |
| project-specific design skill | `design-system` (global, `~/.claude/skills/design-system`) | **empty file, no content** | The brief says a project-specific skill overrides the generic ones. This one exists on disk but its `SKILL.md` is 0 bytes — nothing to read, nothing to follow. Treated as absent. `frontend-design` is used instead, per the brief's fallback ("or the current design skill"). Flagged as an open question in `docs/DECISIONS.md`. |

## Other skills available, not mandated by the brief but potentially relevant later

| Skill | What it's for | Relevance here |
|---|---|---|
| `graphify` | Turns a codebase/docs into a queryable knowledge graph | Not needed for a greenfield project with no code yet; could help later once the codebase is large enough that architecture questions are hard to answer by reading. |
| `code-review` | Reviews a diff/PR for correctness and simplification | Useful ongoing hygiene once real code exists, especially before Phase 4 (order flow) and Phase 6 (payment-adjacent token logic) ship. |
| `security-review` | Security review of pending changes | Directly relevant to Phase 8 (hardening pass) and worth running earlier on Phase 1 (RLS) and Phase 4 (server-side price resolution) given the money and PII involved. |
| `simplify` | Applies reuse/simplification/efficiency cleanups | General hygiene, not phase-specific. |
| `artifact-design` / `artifact-diagramming` / `artifact-capabilities` | Guidance for building Artifacts (shareable HTML pages) | Not part of the shop itself; could be used to mock up a design direction for your sign-off before real pages exist, if useful during Phase 2. |
| `dataviz` | Chart/dashboard visual design guidance | Could apply to the Phase 7 scanner live view (redeemed/outstanding/rejected counts) if that view grows beyond simple numbers. |
| `run` | Launches and drives a project's app to visually verify a change | Useful from Phase 2 onward once there's a Next.js dev server to check `/styleguide` and later pages against. |
| `init` | Scaffolds a new `CLAUDE.md` | Worth running once the stack is scaffolded in Phase 1, so repo conventions are documented for future sessions. |
| `schedule` / `loop` | Recurring scheduled tasks / polling loops | Not applicable — this system sends no email and has no background jobs planned. |
| `pptx`, `docx` | PowerPoint / Word document handling | Not applicable to this project. |
| `claude-api` | Reference for the Claude API / Agent SDK | Not applicable — this project doesn't call the Claude API itself. |
| `keybindings-help`, `update-config`, `fewer-permission-prompts`, `statusline-setup` | Claude Code CLI/environment configuration | Session tooling, not project-relevant. |
| `cowork-plugin-management:*`, `skill-creator`, `setup-cowork`, `import-memory`, `consolidate-memory`, `explain-usage`, `morning` | Claude Code meta / plugin-authoring / personal productivity | Not applicable to this project. |
| `claude-security:*` (orchestrator + sub-agents) | Multi-agent security scan-and-patch workflow | Heavier-weight alternative/complement to `security-review` for the Phase 8 hardening pass, if a deeper automated sweep is wanted at that point. |
| `design` | Multi-artboard visual canvas (Claude Design), published as an Artifact | An alternative way to sign off on visual direction before real pages exist. `frontend-design` is used instead per the brief's explicit mandate for Phases 2–3; this stays a fallback if a canvas mockup is wanted for the Phase 0.5/2 sign-off conversation. |

## Not available / not applicable

- `grill-me` (`.claude/skills/grill-me`, symlinked from `.agents/skills/grill-me`) — installed via the
  `mattpocock/skills` marketplace (see `skills-lock.json`). Its `SKILL.md` only says to call a
  "grilling" skill that does not exist anywhere on this machine, and the skill is flagged
  `disable-model-invocation: true`, so it cannot be invoked programmatically either. Non-functional in
  this environment. By your direction, Phase 0.5 (the brief's own interrogation gate) is being run
  directly instead, without this wrapper.

## Mapping to the brief's phase table

This confirms the brief's own skill table (section 1) is achievable as written, with the one
exception noted above (no functioning project-specific design skill exists, so `frontend-design` is
the sole design authority for Phases 2–3).
