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
- [ ] Run `vp run build` before `vp check` and `vp test`; consumers resolve public package exports from `dist`.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Continuing implementation

Read `docs/architecture.md`, `docs/compatibility.md`, and `docs/conformance.md` before
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
- Maintain Web Standards First purity in `@vality/tsthrift`: zero Node-specific runtime imports or globals (`Buffer`, `node:*`), relying solely on standard ECMAScript and Web standards (`Uint8Array`, `fetch`, `AbortSignal`).
- Align configurations and emitted models with modern TypeScript standards: strict ESM, `NodeNext` module resolution, and `isolatedDeclarations` compatibility for native toolchains (`tsgo`, `oxc`).

### Public contracts and release checks

- Package TypeScript configurations inherit the root strict settings and enable `isolatedDeclarations` for source declarations.
- Validate generated models and public package declarations with a strict consumer. Do not use `skipLibCheck` to suppress declaration errors in consumer acceptance checks.
- Keep README examples aligned with public exports, DI registration, metadata loader signatures, and error wrapper semantics.
- Verify external namespaces with installed packages, root/subpath imports, transitive metadata, and matching i64/method-name modes.
- `vp run ready` covers build, static checks, and unit/integration tests. Release acceptance additionally requires `vp run test:packages`, `vp run test:browser`, and both Java conformance variants on the exact candidate revision.
- Check that published archives contain README and LICENSE, and preserve third-party notices.
- If verification is intentionally deferred, report precisely what was and was not executed; earlier green runs do not verify later edits.
