# Refactor plan — split `js/main.js` into ES modules

**Goal:** break `js/main.js` (~6,200 lines / ~188 functions) into cohesive ES modules,
following the existing `init*(ctx)` extraction pattern, **without changing any behavior**.
This is the biggest maintainability blocker in the codebase.

**Status:** planning complete, not started. Work it one checkbox at a time.

---

## Why this is risky (findings from the audit)

- **~50 mutable module-level `let`s** (`tasks`, `events`, `subjects`, `currentMonth`,
  `editingTaskId`, …) are shared across what would become separate files.
- The decoupling bridge is `ctx` (`js/context.js` = `export const ctx = {}`), and it is
  **partial and inconsistent**:
  - Only **4 of ~50** state vars are reactively bridged via
    `Object.defineProperty(ctx, 'x', {get, set})` (`editingId`, `subjects`,
    `currentView`, `ownTasks`).
  - `js/tasks.js` reads/writes `ctx.tasks`, but `main.js` keeps its **own** `let tasks`
    and `mergeTasks()` updates only the local one — there is **no `ctx.tasks` bridge** in
    `main.js`. So `ctx.tasks` (read by `daily-planner.js`) can diverge from `main.js`'s
    `tasks` today. Latent bug **and** the exact trap a naive extraction would hit.
- **The real danger is broken/stale state bindings, not moving functions.** The safe path
  makes `ctx` a *complete, single, reactive source of truth* **before** moving logic.

**Mitigating fact:** `main.js` is already cleanly sectioned (numbered 1–14) and ~7 sections
are already extracted with the `init*(ctx)` pattern. This is "continue the pattern", not
"invent one".

---

## Core principles

1. **Behavior-preserving moves only** — never refactor logic and relocate it in the same step.
2. **`ctx` is the only shared-state channel** — extracted modules read `ctx.X` (live),
   never a captured copy of a reassignable value.
3. **One cohesive cluster per commit**, leaf-first, **verified in a real browser** before
   the next.
4. **Every commit independently revertible** (no long-lived refactor branch).

## Per-module recipe (repeat for each cluster)

1. List the cluster's functions, the state it reads/writes, DOM refs, and cross-cluster
   calls (inbound + outbound).
2. **Bridge every shared mutable var it touches onto `ctx`** reactively
   (`Object.defineProperty`) if not already — as a separate, behavior-preserving commit.
3. Create `js/inline/<name>.js`: `import { ctx }`, read deps from `ctx`, define the
   functions, expose what others need back on `ctx` (or via `init<Name>()`).
4. In `main.js`: delete the moved code; add `import { init<Name> } from './inline/<name>.js'`
   and call it **at the same point in the bootstrap order**.
5. **Verify** (checklist below). Commit + push. If anything is off → `git revert` that one commit.

## Verification checklist (run after every step)

- [ ] `node --check` passes on every changed file (`.mjs` copy for ESM).
- [ ] App loads in a browser as a logged-in user (`localStorage.countdown_username`),
      **zero new console errors**.
- [ ] The moved feature still works: create/complete a task, fire a reminder, snooze,
      open calendar + daily planner, switch views.
- [ ] Reminder/snooze logic: existing mocked smoke tests still pass.

---

## Phase 0 — prep (do first; highest safety leverage)

- [ ] **0a — Verification harness:** repeatable "serve + load as test user + assert no
      console errors + exercise feature" loop (already proven during the snooze work).
- [ ] **0b — State unification:** add reactive `ctx` bridges for all shared mutable state a
      planned module touches; reconcile the `ctx.tasks` vs local `tasks` inconsistency.
      One commit, **no behavior change**. *This is the single most important step.*
- [ ] **0c — Commit discipline:** one module per commit, descriptive messages, push each.

## Extraction sequence (leaf-first; ~one commit each)

- [ ] **1 — Recurrence helpers** (`parseRecurrenceValue`, `getReminderOccurrences`,
      `getNextRecurrenceDate`) — nearly pure, minimal state. Safest warm-up.
- [ ] **2 — Reminders + snooze** (§ ~4383–4810, ~430 lines) — fairly self-contained;
      recently worked on, well understood.
- [ ] **3 — Event / countdown management** (§4, ~800 lines).
- [ ] **4 — Subjects / categories** (§11, ~150 lines) + **sidebar rendering** (~225 lines).
- [ ] **5 — Context menus** (~700 lines; partly extracted already).
- [ ] **6 — Task manager** (~2,400-line cluster) — **last**, split into 3–4 sub-commits:
  - [ ] 6a — rendering
  - [ ] 6b — CRUD / add-task
  - [ ] 6c — drag & drop
  - [ ] 6d — filters / smart views

## Rollback

Each cluster is one small commit. If verification fails, `git revert` that commit; the rest
stays intact.

## Conventions

- New modules live in `js/inline/` (matches the most recent extractions) and follow the
  `init<Name>(ctx)` + read-deps-from-`ctx` convention.
- Avoid name collisions with the existing thin `js/tasks.js` / `js/events.js` (use clear
  names like `reminders.js`, `recurrence.js`, `events-core.js`, `task-manager.js`).

## Realistic scope

~10–14 small commits. Intentionally slow and boring — that is the safety.

---

## Progress log

_(append one line per completed step: date · step · commit)_

- (not started)
