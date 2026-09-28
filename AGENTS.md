<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Continuing implementation

Read `docs/architecture.md`, `docs/compatibility.md`, and `docs/release-audit.md` before
changing the generator or transport. Document technical contracts and reproducible
setup without personal preferences, conversation history, or machine-specific account paths.
Consult the source revisions in `docs/compatibility.md` when changing compatibility behavior.

### Documentation and task lifecycle

- Permanent documentation in `docs/` and package READMEs must remain concise, objective, and contract-focused.
- Ephemeral task checklists (such as `tasks.md`) are reserved solely for retaining context within a single feature branch during active development; do not commit or merge them into `main`.

### Change verification criteria

- Inspect the relevant upstream/legacy implementation when touching compatibility.
- Execute affected generated output, not just source-shape assertions.
- Check module responsibilities, imports/exports, and `git diff --check`.
- Keep technical documentation strictly neutral, objective, and reproducible.
- Distinguish verified artifacts from transport, browser, and consumer acceptance.
