# MCP Tool Annotations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish accurate and explicit `readOnlyHint`, `destructiveHint`, and `openWorldHint` metadata for every MCP tool.

**Architecture:** Keep runtime behavior unchanged and update only the annotation type and registration objects in `src/server.ts`. Exercise the real MCP `tools/list` boundary through linked in-memory transports and compare every exposed tool with a hand-written annotation matrix.

**Tech Stack:** TypeScript, Playwright Test, MCP TypeScript SDK 1.26.0

**Spec:** `docs/superpowers/specs/2026-08-12-tool-annotations-design.md`

## Global Constraints

- This is an annotation-only change; do not change tool runtime behavior.
- Keep lazy iOS simulator agent installation in `getRobotFromDevice` unchanged.
- Every registered tool must explicitly set `openWorldHint`.
- Keep the Superpowers design and implementation-plan documents in the PR.
- Use synchronous test helpers where possible; MCP client/server calls remain asynchronous.
- Define parameter types at file scope rather than inline in function signatures.
- Do not add `exec`, `execSync`, `execFile`, or their variants.

---

### Task 1: Protect the complete annotation contract

**Files:**
- Create: `test/server-annotations.test.ts`
- Modify: `src/server.ts:67-953`

**Interfaces:**
- Consumes: `createMcpServer(): McpServer`, `Client`, and `InMemoryTransport.createLinkedPair()`
- Produces: MCP `tools/list` results with explicit, correct annotations for all 27 registered tools

- [ ] **Step 1: Write the failing annotation test**

Create a literal `Record<string, ToolAnnotations>` at file scope containing all registered tool names. Connect `createMcpServer()` and an MCP `Client` with `InMemoryTransport.createLinkedPair()`, call `client.listTools()`, convert the returned list into a name-to-annotations record, and assert exact equality with the literal matrix.

The matrix must encode these special cases:

```typescript
mobile_allocate_remote_device: { destructiveHint: false, openWorldHint: true },
mobile_release_remote_device: { destructiveHint: true, openWorldHint: true },
mobile_list_apps: { destructiveHint: false, openWorldHint: false },
mobile_get_screen_size: { destructiveHint: false, openWorldHint: false },
mobile_list_elements_on_screen: { destructiveHint: false, openWorldHint: true },
mobile_take_screenshot: { destructiveHint: false, openWorldHint: true },
mobile_get_orientation: { destructiveHint: false, openWorldHint: false },
```

The remaining matrix entries must preserve current read-only/destructive classifications and explicitly classify their interaction domain:

- Open-world: cloud login/list/allocate/release, app launch, UI gestures and typing, URL opening, screen elements and in-memory screenshot content, crash listing and retrieval.
- Closed-world: local device discovery, app inventory/install/uninstall/terminate, screen size, screenshot-file output, orientation, and screen-recording lifecycle.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx playwright test test/server-annotations.test.ts`

Expected: FAIL because `openWorldHint` is absent, allocation is destructive, and five lazily initializing tools are incorrectly read-only.

- [ ] **Step 3: Implement the minimal annotation changes**

Add the property to the file-level annotation interface:

```typescript
interface ToolAnnotations {
	readOnlyHint?: boolean;
	destructiveHint?: boolean;
	openWorldHint?: boolean;
}
```

Update all 27 registrations to match the literal matrix. For the five tools that may call `agentInstall`, replace `readOnlyHint: true` with `destructiveHint: false`. Set allocation to `destructiveHint: false`; keep release at `destructiveHint: true`. Add an explicit `openWorldHint` to every registration.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx playwright test test/server-annotations.test.ts`

Expected: PASS with one annotation-contract test and no failures.

- [ ] **Step 5: Commit the tested implementation**

```bash
git add src/server.ts test/server-annotations.test.ts docs/superpowers/plans/2026-08-12-tool-annotations.md
git commit -m "fix: correct MCP tool annotations"
```

---

### Task 2: Verify and publish the branch

**Files:**
- Verify: `src/server.ts`
- Verify: `test/server-annotations.test.ts`
- Verify: `docs/superpowers/specs/2026-08-12-tool-annotations-design.md`
- Verify: `docs/superpowers/plans/2026-08-12-tool-annotations.md`

**Interfaces:**
- Consumes: completed annotation matrix and feature-branch commits
- Produces: a pushed `fix/tool-annotations` branch and GitHub pull request against `main`

- [ ] **Step 1: Run static verification**

Run: `npm run build`

Expected: TypeScript compilation exits successfully.

Run: `npm run lint`

Expected: ESLint exits successfully without warnings or errors.

- [ ] **Step 2: Run the complete test suite**

Run: `npm test`

Expected: all tests pass. If hardware-dependent tests cannot run in the current environment, report their exact failures separately from the focused annotation test.

- [ ] **Step 3: Inspect the final change**

Run: `git diff --check origin/main...HEAD` and `git diff --stat origin/main...HEAD`.

Expected: no whitespace errors; the diff contains the annotation implementation, regression test, design, and plan only.

- [ ] **Step 4: Push and create the PR**

Push `fix/tool-annotations` to `origin`, then create a PR against `main` titled `fix: correct MCP tool annotations`. Summarize the explicit open-world matrix, corrected allocation/release semantics, corrected lazy-initialization read-only hints, and verification results.

