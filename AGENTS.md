# Codex project instructions

## Codex with ChatGPT

For substantial implementation work in this repository, use
`$codex-with-chatgpt`.

The official `codex-with-chatgpt` SKILL.md is authoritative.

Follow all of its existing rules for:

- setup and connection
- security
- browser handling
- recovery and doctor
- conversation/project reuse
- checkpoints
- INIT / PLAN / EXECUTING / EXECUTED / REVIEW / DONE / BLOCKED
- MCP access
- execution recording

Do not replace, duplicate, weaken, or bypass those rules.

The instructions below only customize how the normal C2C coding workflow
should be used for this repository.

## Delegation-first workflow

ChatGPT is the primary planning and review layer.
Codex is the execution layer, as defined by the official C2C Skill.

For bugs, features, refactors, architecture changes and substantial
pending work:

1. Use the normal `$codex-with-chatgpt` coding workflow.
2. Send the user's actual goal to ChatGPT with INIT.
3. Let ChatGPT inspect the repository directly through MCP.
4. Wait for `STATE: PLAN` before substantial implementation.
5. Execute the received PLAN locally with Codex.
6. Run the appropriate tests/checks.
7. Record the execution according to the official C2C Skill.
8. Send EXECUTED.
9. Let ChatGPT independently REVIEW the implementation through MCP.
10. Continue with another PLAN only when the review actually requires it.


## General Principles

These principles apply throughout C2C PLAN, implementation, and independent REVIEW.

- Keep things in one function unless composable or reusable
- Validate unknown values once at the boundary that owns them. Pass typed values inward instead of repeating `typeof value === "object"` and property-existence checks. Do not defensively revalidate values already guaranteed by a schema, constructor, or internal type.
- Do not extract single-use helpers preemptively. Inline the logic at the call site unless the helper is reused, hides a genuinely complex boundary, or has a clear independent name that improves the caller.
- Before adding complexity for a speculative or vanishingly unlikely race or security edge case, explain the concrete failure mode, likelihood, and complexity cost to the user and get their buy-in. Do not silently expand scope for theoretical robustness.
- Avoid try/catch where possible
- Do not add null/undefined/None guards, optional chaining, or fallback defaults for values the type, schema, or constructor already guarantees. A missing required value fails fast at the boundary that owns it with one clear error. Never chain fallback checks, and never add a guard only to make a path "safe" without a failing test or a documented boundary that requires it.


## Execution discipline

These rules keep verification proportional to the work. Checks exist to
support a decision; they are not a substitute for doing the task.

### Act first, verify at gates

- Order of work: implement → run the task's tests/checks → EXECUTED.
  Bookkeeping (Jira sync, Git publication proofs, evidence records) happens at
  the lifecycle gate that requires it, never as a precondition for starting
  implementation.
- Before running any check or read-only command, name the decision it can
  change. If no plausible result would change the next action, skip it.
- Never re-verify a fact already established in this session unless Codex's own
  action could have changed it or a command just failed.

### Preflight budget

- One batched read-only preflight per task (see `GITHUB.md`), recorded once.
- One re-check of status immediately before commit and one before push. No
  other routine repeats.
- Read `AGENTS.md`, `JIRA.md` and `GITHUB.md` once per session. Re-read a file
  only if it changed since it was last read (a cheap check such as
  `git status --porcelain -- <file>` or `git log -1 --format=%H -- <file>`),
  not on every Jira mutation or workflow transition.
- Tripwire: after 5 consecutive read-only commands with no edit, test run, or
  C2C message in between, stop inspecting. Act on what is already known, or
  return to C2C with the specific missing fact.

### Stay on the problem

- One `TASK_ID` uses one branch and one worktree. Do not switch branches or
  worktrees mid-task to investigate or to escape a failure.
- To inspect another ref, use read-only commands that do not move HEAD
  (`git show <ref>:<path>`, `git diff <ref> -- <path>`, `git log <ref>`).
- A failing test or check is a problem to diagnose and fix in place. Diagnose
  the root cause once, fix it, rerun. Do not wrap the failure in additional
  checks, new branches, or alternative verification paths.
- After 2 failed fix attempts on the same failure, stop and return the exact
  evidence to C2C (or mark BLOCKED when `JIRA.md`/C2C rules say so). Do not
  keep looping.

### Finish what you start

- Every turn ends at a named gate (PLAN received, EXECUTED sent, REVIEW
  handled, DONE, BLOCKED) or with an explicit handoff stating what is complete
  and what remains. Do not leave a batch half-applied.
- Jira synchronization is non-blocking for implementation. `JIRA_SYNC: DEGRADED`
  is reported and retried at the next lifecycle gate; it never pauses coding.

## Jira integration

For substantial C2C work in this repository, read and follow the root-level
`JIRA.md`, re-reading it before a Jira mutation only if it changed since it was
last read in this session (see Execution discipline).

`JIRA.md` defines the repository-specific Jira synchronization workflow,
including task identity, issue creation/reuse, status transitions, parent/subtask
handling, and the DONE gate.

It extends the normal `$codex-with-chatgpt` workflow. It must not replace,
duplicate, weaken, or bypass the official C2C `SKILL.md`, this `AGENTS.md`, or
the independent REVIEW requirement.

When a substantial task enters C2C, preserve its stable `TASK_ID` and follow
`JIRA.md` for Jira synchronization throughout INIT / PLAN / EXECUTING /
EXECUTED / REVIEW / BLOCKED / DONE.

Do not mark a Jira issue DONE merely because implementation exists, tests pass,
or EXECUTED was recorded. Final Jira DONE must follow the acceptance rules in
`JIRA.md`.

## Git and GitHub automation

For substantial C2C tasks that create or reuse worktrees, stage changes,
commit, integrate, or publish repository changes, read and follow root
`GITHUB.md`.

`GITHUB.md` governs Git/GitHub mechanics only. It is subordinate to the
official `$codex-with-chatgpt` skill, this `AGENTS.md`, the explicit current
task contract, accepted C2C decisions, and `JIRA.md`. Explicit task
constraints such as `NO_COMMIT` or `NO_PUSH` override its defaults.

Codex performs routine safe Git mechanics directly; do not use the user as a
routine shell relay unless a genuine human-required blocker applies.

## Local execution and resource constraints

The user's local workstation is not an AI/GPU execution environment.

### Local GPU

No supported local GPU is available for this project.

Codex must not attempt local:

- CUDA execution;
- GPU inference;
- GPU model loading;
- vLLM execution;
- Qwen inference;
- ASR/TTS/LLM GPU validation;
- NVIDIA-container execution;
- GPU benchmarks.

Absence of a local GPU is an expected environment constraint, not a blocker
that Codex should try to repair or work around.

Real GPU validation must run only on explicitly authorized remote GPU
infrastructure.

### Local Docker for AI workloads

Do not use the user's local Docker installation for AI/ML workloads unless the
user explicitly authorizes that exact local Docker operation.

Without explicit authorization, Codex must not locally:

- run `docker build` or `docker buildx build` for AI/ML images;
- build CUDA/PyTorch/vLLM/Qwen/ASR/TTS/LLM images;
- pull large AI/CUDA base images merely for validation;
- run AI containers;
- start Docker Desktop or the Docker daemon in order to perform an AI build;
- run local Docker smoke tests that require an AI runtime;
- use local Docker availability as a required acceptance gate for an AI task.

For repository delivery involving AI images, prefer the project's remote CI
pipeline, such as GitHub Actions, for image build, smoke and publication.

If a task only needs to publish source so that GitHub Actions performs the
build, Codex must stop after the verified Git publication boundary when that is
the task contract. It must not duplicate the CI build locally.

### Lightweight local containers

Lightweight infrastructure containers are allowed when directly required by
the task and known to be practical on the workstation.

Examples include:

- Redis;
- small development/test infrastructure services that do not require GPU,
  CUDA, large model weights, or substantial AI runtime resources.

Permission to run Redis or another lightweight service does NOT imply
permission to run AI/ML Docker workloads.

### Local validation fallback

When an AI-related task requires validation but local Docker/GPU execution is
not authorized or feasible, Codex should use applicable non-GPU checks instead,
such as:

- unit tests;
- static checks;
- source-contract checks;
- compile/type checks;
- deterministic CPU tests;
- repository parity checks;
- CI configuration validation.

If real image execution or GPU behavior is required for acceptance, report it
as requiring the authorized remote environment rather than attempting to make
the local workstation provide that environment.

### Override

Only an explicit user instruction for the current task may authorize a normally
prohibited local AI Docker or GPU operation.

A PLAN, Jira issue, existing Docker installation, Docker daemon availability,
or discovery that Docker/Buildx is installed does not itself grant that
authorization.


## C2C task-contract preservation

For substantial tasks, especially when the user provides a structured work
contract, preserve normative task requirements explicitly across the C2C
boundary.

When the task contains these sections:

- `GOAL`
- `MUST_PRESERVE`
- `ACCEPTANCE`
- `OUT_OF_SCOPE`
- `INSTRUCTION`

the INIT sent to ChatGPT must retain those sections as distinct fields or
clearly delimited sections.

`GOAL` may be summarized for brevity.

`MUST_PRESERVE`, `ACCEPTANCE`, and `OUT_OF_SCOPE` are normative requirements,
not optional context. Do not replace them with a general summary, omit them,
or rely on ChatGPT to reconstruct them from prior conversation context.

Preserve their full semantic requirements in INIT.  Minor wording compression is allowed only when every independently testable
requirement remains independently identifiable in INIT. Do not merge multiple
acceptance criteria into one broader statement if that makes any criterion
harder to verify during REVIEW.

`INSTRUCTION` may be normalized to the normal C2C workflow, but task-specific
execution constraints must remain explicit.

If the user's task is too large for one coherent implementation batch, split it
into independently reviewable microtasks. Each microtask must receive its own
C2C TASK_ID and its own complete:

- `GOAL`
- `MUST_PRESERVE`
- `ACCEPTANCE`
- `OUT_OF_SCOPE`

Do not start the next microtask until the current one reaches `STATE: DONE`,
unless the user explicitly requests otherwise.

A later microtask must not rely on unstated acceptance criteria from an earlier
TASK_ID. Repeat the requirements that are necessary for that microtask.

This rule customizes task packaging only. It does not replace or weaken the
official `$codex-with-chatgpt` state machine, security rules, MCP rules,
recovery rules, or review workflow.

### Scope protection for existing behavior

Normative task contracts describe what the current microtask may change.
They must not be interpreted as authorization to redesign adjacent behavior
that is outside the task's explicit scope.

When a task says to preserve historical operations, that means later
operations must not silently erase or replace prior historical records.
It does not, by itself, require terminal operation records to become immutable.

In particular, existing retry/new-run semantics are repository behavior,
not something to infer from generic words such as "preserve", "historical",
or "do not overwrite".

Do not change retry/new-run semantics unless the current microtask explicitly
includes that behavior in GOAL and ACCEPTANCE.

If a task exposes a conflict or ambiguity involving retry/new-run semantics:
- preserve the current implementation;
- report the dependency in PLAN or REVIEW;
- defer the behavioral change to a dedicated microtask.

A task-specific prompt may further restrict behavior, but it must not silently
expand the microtask beyond its stated GOAL, ACCEPTANCE, and OUT_OF_SCOPE.

### Out-of-scope behavior

`OUT_OF_SCOPE` is normative.

Codex must not modify behavior listed in `OUT_OF_SCOPE` merely because doing
so would simplify the current implementation.

If satisfying ACCEPTANCE appears to require changing out-of-scope behavior,
stop that part of the implementation and return the conflict through C2C.

Do not resolve the conflict by silently broadening the task.

## Task authorization boundary

Completion, C2C `DONE`, commit, integration, publication, or final reporting for
one `TASK_ID` does not authorize starting another `TASK_ID`. Only an explicit
user instruction authorizes beginning a subsequent task.

Jira ordering, status, or sprint placement; dependency readiness or blocking
relationships; existing branches or worktrees; task lineage, roadmap or pending
lists; surrounding project context; and a previously discussed “next task” do
not grant that authorization. C2C may recommend the next task, but a
recommendation does not authorize it.

Without explicit user authorization, do not begin the next task’s `INIT` or
`PLAN`, make a Jira transition for it, create its worktree or branch, or start
its implementation. When the user explicitly asks to continue pending work, the
existing Pending work workflow may ask C2C to identify the next coherent batch;
that identification alone does not authorize work beyond the user’s request.

## Brainstorming and Design Docs

`docs/0_Brainstorming/` is the historical research record: it answers what we investigated and how we got here. During consolidation, treat existing material there as read-only. Never clean, replace, delete, move, rename, rewrite, or reorganize historical files as a side effect of producing Design Docs. A separate task may add newly requested research, but must not erase or silently rewrite prior evidence.

`docs/1_Design_docs/` is the canonical view of current system design: it answers how the system is designed and how it should be built. It absorbs only conclusions that remain current and have adequate evidence or an explicit accepted decision; it is not a copy, summary dump, or cleanup destination for Brainstorming. Link to the smallest set of relevant source documents so the decision history remains traceable.

Keep evidence, design status, and implementation status distinct. Repetition in Brainstorming does not make a proposal selected. Do not describe a hypothesis, research-only option, or scoped task constraint as a project-wide decision. When sources conflict or proof is insufficient, preserve the conflict and label it `OPEN QUESTION`, `UNRESOLVED`, `PROVISIONAL`, or `NEEDS VALIDATION`; do not guess. Claims marked `IMPLEMENTED` must point to inspected code and must not imply tested, integrated, committed, or production-ready behavior unless separately verified.

Keep Design Docs modular and avoid duplicate definitions: give each stable concept one canonical document and link to it elsewhere. Create folders only when a real Design Doc is ready to live in them; do not create empty folders to mirror the brainstorming tree.

## Pending work

When the user asks to continue the project, continue pending work,
continue where we left off, or says "sigue con los pendientes":

Ask ChatGPT through C2C to:

1. read `PENDIENTES.md` through MCP;
2. inspect `git_status`;
3. identify the next coherent pending-work batch;
4. use `search_workspace` and `read_file` only for the files needed for
   that batch;
5. return one substantive C2C PLAN with rationale, concrete file-level
   actions, tests and success criteria.

Codex should not independently reconstruct the entire project before
requesting that PLAN.

## Pending-task bookkeeping

When a task is only partially completed, do not hide completed work inside
the description of an unchecked umbrella item.

Represent milestones as nested checkboxes:

- [ ] Umbrella task
  - [x] Completed delivery
  - [ ] Remaining delivery
  - [ ] Remaining delivery

An unchecked umbrella checkbox must not combine completed, pending, and
optional work in its own sentence. Put the deliverables in separate child
checkboxes as soon as a milestone is partly complete. Keep the parent label
short; record implementation detail under the relevant child. If a child is
completed but follow-up remains, mark that child `[x]` and leave the follow-up
as a separate `[ ]` child. Do not mark the parent complete until every
required child is complete; optional work must be labelled optional rather
than silently included in the completion condition.

When a C2C batch reaches DONE, mark its corresponding deliverable `[x]`.
Leave the umbrella `[ ]` until all required child deliverables are complete.

Do not create a new duplicate pending item when updating status; update the
existing hierarchy in place.

## New bugs and features

When the user reports a new bug or requests a new feature:

- treat the user's message as the task GOAL;
- do not require it to already exist in `PENDIENTES.md`;
- delegate repository investigation and high-level planning to ChatGPT;
- let ChatGPT inspect the relevant code through MCP;
- then execute the PLAN with Codex.

## Efficient execution

Preserve the official C2C protocol, but minimize unnecessary round trips.

Prefer, when technically reasonable:

1 PLAN
→ 1 coherent implementation batch
→ 1 test/check batch
→ 1 EXECUTED
→ 1 REVIEW

Do not return to ChatGPT after every individual file edit or routine
shell command.

Routine implementation decisions inside an accepted PLAN belong to Codex.

Only return early to ChatGPT if:

- a major assumption in the PLAN is wrong;
- a material blocker appears;
- the requested behavior needs to change substantially;
- or a user decision is required.

Never paste source files, diffs or long logs into ChatGPT when MCP can
provide them.