# Jira integration contract

## Purpose

Jira is the project-management projection of the repository's C2C lifecycle.

The objective is to keep Jira synchronized with real C2C work and prevent
status drift between planning, implementation, review, Git evidence and Jira.

Jira tracks workflow state.

Jira does not prove technical completion.

Technical completion remains grounded in the current task contract, repository
evidence, required tests/checks, Git evidence and independent C2C review.


## Authority

The authority order is:

1. Official `$codex-with-chatgpt` `SKILL.md`
2. Repository `AGENTS.md`
3. Current C2C task contract
4. Repository, Git, test and execution evidence
5. Jira

`JIRA.md` extends the repository workflow only.

It must not replace, weaken, duplicate or bypass the official C2C state machine
or the independent REVIEW requirement.


## Scope

This contract applies to substantial work that enters the C2C workflow,
including:

- bugs;
- features;
- runtime implementation;
- refactors;
- architecture changes;
- Design Docs;
- research tasks with explicit deliverables;
- infrastructure work;
- substantial QA/audit work;
- independently reviewable microtasks.

Trivial work that does not enter C2C does not require a Jira issue.


## Jira access

Use the connected Atlassian/Jira MCP integration for Jira reads and writes.

Do not add Jira credentials, tokens or passwords to the repository.

Do not build a parallel Jira REST client when the connected MCP integration
already provides the required operation.

Repository runtime code must not depend on Jira.

## Synchronization ownership

Jira reads and writes are performed by the ChatGPT/C2C planning and review
layer through the connected Atlassian/Jira MCP integration.

Codex must not implement its own Jira client or assume direct Jira access.

Codex is responsible for emitting the normal C2C lifecycle events and preserving
`TASK_ID` / `JIRA_KEY` metadata when available.

The ChatGPT/C2C layer projects those events into Jira.

For this repository, the default Jira project is:

- Project key: `SCRUM`

Do not create task issues in another Jira project unless the current task
explicitly requires it.

When resolving an existing issue by `TASK_ID`, verify the issue belongs to the
configured project and contains the exact task identity, such as:

`Task ID: <TASK_ID>`

Do not reuse an issue based only on a partial text match.

## Stable task identity

Every substantial C2C task must have one stable `TASK_ID`.

`TASK_ID` is the idempotency key for Jira synchronization.

Before creating a Jira issue:

1. Search Jira for the `TASK_ID`.
2. If exactly one matching issue exists, reuse it.
3. If no matching issue exists, create one.
4. If multiple matching issues exist, do not guess; report the conflict.

Never create another Jira issue merely because:

- the C2C iteration changed;
- Codex restarted;
- ChatGPT restarted;
- review requested corrections;
- tests were rerun;
- a worktree was recreated;
- implementation was retried.

One C2C task must normally map to one Jira issue:

`TASK_ID ↔ JIRA_KEY`

Once known, preserve the same `TASK_ID` and `JIRA_KEY` throughout the task.

## Instruction freshness

`JIRA.md` is a live repository contract.

Do not rely only on the copy or interpretation loaded when the C2C task began.

Before a Jira mutation or workflow transition, check whether the root-level
`JIRA.md` changed since it was last read in this session (for example with
`git status --porcelain -- JIRA.md` and `git log -1 --format=%H -- JIRA.md`).
Re-read it only if it changed; otherwise reuse the loaded copy. Apply its
latest committed or working-tree rules.

This includes, at minimum:

- creating or reusing an issue;
- moving an issue to `IN_PROGRESS`;
- moving an issue to `REVIEW`;
- handling a correction cycle;
- moving an issue to `BLOCKED`;
- moving an issue to `DONE`;
- assigning an issue to a sprint;
- synchronizing lifecycle metadata.

If `JIRA.md` changed after the task started, the latest applicable rules govern
the next Jira synchronization point unless the current C2C task contract
explicitly states otherwise.

Do not intentionally revert already-correct historical Jira state merely because
the synchronization contract changed mid-task.

## Planning-only backlog authoring

Jira may be used to prepare future work before execution is authorized.

Creating, enriching, decomposing, linking, prioritizing or otherwise planning a
Jira issue does not authorize Codex or C2C to execute that task.

A Jira issue may therefore exist before any C2C `INIT` has occurred.

This mode is called planning-only backlog authoring.

Planning-only work may:

- create a new issue for a future stable `TASK_ID`;
- reuse and enrich an existing future issue;
- define or refine its goal;
- record `MUST_PRESERVE` constraints;
- record acceptance criteria;
- record `OUT_OF_SCOPE` boundaries;
- establish parent/child relationships;
- establish dependencies and Blocks relationships;
- record authoritative Design Docs or repository references;
- identify expected technical maturity;
- classify the task as planning `DRAFT` or planning `READY`;
- rank or organize future backlog work.

Planning-only work must not:

- send a C2C `INIT`;
- begin a C2C `PLAN`;
- create or resume an implementation worktree;
- create an implementation branch;
- choose or freeze an execution baseline;
- modify runtime/source code for the planned task;
- transition the issue to `IN_PROGRESS`;
- move the issue into the active sprint merely because planning completed;
- infer execution authorization from Jira rank, dependencies, readiness or issue
  existence;
- automatically start the next task when another task completes.

A planned issue remains semantically `TO_DO`.

Unless the user explicitly requests otherwise, future planned work remains in
the backlog rather than the active sprint.

### Planning state

When useful, a future issue may record a planning state distinct from Jira
workflow state:

- `DRAFT` — the task is known but still has unresolved scope, dependencies,
  acceptance criteria or architectural decisions.
- `READY` — the planning contract is sufficiently specified that execution may
  begin once the user explicitly authorizes that `TASK_ID`.

`READY` does not mean:

- `INIT`;
- `IN_PROGRESS`;
- execution authorized;
- implementation started;
- technically implemented;
- C2C accepted.

Planning readiness and execution authorization are separate facts.

### Execution authorization metadata

`Execution authorization` is synchronization metadata, not an independent
source of authority.

While a task is planning-only, record:

`Execution authorization: NOT_GRANTED`

When the user explicitly authorizes that exact `TASK_ID` to start or resume,
the Jira synchronization may record:

`Execution authorization: GRANTED`

This value records that an explicit authorization occurred; it must not itself
be used to authorize a later task start, restart or resume.

A stale or pre-existing `GRANTED` value in Jira is never sufficient evidence to
begin execution without the applicable explicit user instruction.

Once actual execution begins, normal C2C/Jira lifecycle state becomes the
execution-state authority for that run.

Do not leave `Execution authorization: NOT_GRANTED` synchronized alongside an
actually executing task.

A recommended synchronization section for future work may contain:

- `Task ID`
- `Planning state`
- `Execution authorization`
- `Goal`
- `Must preserve`
- `Acceptance criteria`
- `Out of scope`
- `Dependencies`
- `Blocks`
- `Authoritative references`
- `Expected maturity`

For planning-only issues, use:

`Execution authorization: NOT_GRANTED`

Do not require worktree, branch, baseline, commit, test evidence or C2C
iteration metadata before execution actually begins.

### Explicit execution authorization

Execution of a planned task requires an explicit user instruction identifying
the task to start or resume.

Examples of valid authorization include:

`Start A6.4`

`Resume TASK_ID A6_4_RESULT_PATH_FENCING`

A task must not be considered authorized merely because:

- it is the highest-ranked backlog item;
- all of its dependencies are DONE;
- it is marked planning `READY`;
- it is the obvious next task;
- its predecessor was just completed;
- it has an existing Jira issue;
- it has an existing branch or worktree;
- it is linked by a Blocks relationship;
- prior conversation context suggests that it should be next.

Codex and C2C may recommend the next task but must stop before starting it.

After explicit user authorization:

1. read `AGENTS.md`, `JIRA.md` and `GITHUB.md` once per session, re-reading
   only those that changed since they were last read;
2. resolve the exact stable `TASK_ID` and reuse its Jira issue;
3. re-read the planned Jira contract;
4. inspect current repository and Design Doc authority for drift;
5. resolve the current execution baseline, branch and worktree at execution
   time rather than trusting stale planning metadata;
6. if the task has never entered C2C, send the normal C2C `INIT`; if the same
   `TASK_ID` already has an established C2C lifecycle, resume that lifecycle
   from its authoritative current state instead of creating a second INIT or
   task identity;
7. keep Jira `TO_DO` during planning;
8. transition to `IN_PROGRESS` and assign to the active sprint only when actual
   execution begins.

If the repository or authoritative design changed after backlog planning,
execution-time C2C must reconcile the planned contract with the current higher
authority before implementation.

Do not silently discard independently testable requirements already recorded in
the planned Jira issue.


## Sprint placement

Jira workflow status and sprint placement are separate concerns.

Planning `READY` does not qualify a task for the active sprint.
Only actual authorized execution does.

When a C2C task begins actual execution:

- preserve its Jira workflow transition to `IN_PROGRESS`;
- ensure the issue is assigned to the current active sprint when the project
  uses an active Scrum sprint.

Tasks that have not started may remain in the backlog.

Do not move all planned future subtasks into the active sprint merely because
they exist.

For sequential microtasks, add the current executable task to the active sprint
when its EXECUTING phase begins.

Completing a task does not automatically pull the next dependency into the
active sprint unless that next task actually begins execution.



## Technical maturity

Workflow state and technical maturity are separate facts.

Use these technical maturity labels when relevant:

- DESIGNED — normative contract/design exists and is accepted.
- IMPLEMENTED — source implementation exists for the scoped contract.
- WIRED — the implementation is actually connected to its intended runtime path.
- TESTED — required automated/scoped tests have passed against the implementation.
- E2E_VALIDATED — the real end-to-end behavior has been demonstrated in the target environment.

Never infer one level from another.

In particular:

DESIGNED != IMPLEMENTED
IMPLEMENTED != WIRED
WIRED != TESTED
TESTED != E2E_VALIDATED

A Jira issue may be DONE for a documentation-only task at DESIGNED maturity if that is the task contract.

A runtime feature must not be described as operational merely because its Design Doc is DONE.

Record the highest proven maturity and the evidence supporting it.

## C2C metadata

When practical, C2C task messages should preserve:

- `TASK_ID`
- `JIRA_KEY`
- `JIRA_STATE`
- `JIRA_SYNC`

Valid synchronization reporting is:

- `JIRA_SYNC: OK`
- `JIRA_SYNC: DEGRADED`

Do not claim `JIRA_SYNC: OK` unless the required Jira operation actually
succeeded.


## Creating a Jira issue from INIT

This section applies when execution is entering C2C through an `INIT`.

It does not prohibit planning-only Jira issue creation described in
`## Planning-only backlog authoring`.

When a substantial new INIT enters C2C:

1. Read the task contract.
2. Resolve its stable `TASK_ID`.
3. Search Jira for that `TASK_ID`.
4. Reuse the existing issue when found.
5. Otherwise create the appropriate issue.
6. Resolve its `JIRA_KEY`.
7. Keep it in the semantic `TO_DO` state while planning.
8. Preserve the same issue throughout all later iterations.

When a structured task contract contains:

- `GOAL`
- `MUST_PRESERVE`
- `ACCEPTANCE`
- `OUT_OF_SCOPE`

preserve those requirements in Jira.

`GOAL` may be summarized.

`MUST_PRESERVE`, `ACCEPTANCE` and `OUT_OF_SCOPE` must not lose independently
testable requirements.


## Issue hierarchy

Use the existing Jira hierarchy when it is known.

Typical mapping:

- major lane or initiative → Epic
- independent implementation task → Task
- microtask belonging to an existing umbrella → Subtask

Do not invent a parent when the repository or Jira does not establish one.

A retry or review correction of an existing task reuses the same issue.


## Jira status model

Use these semantic Jira states:

- `TO_DO`
- `IN_PROGRESS`
- `REVIEW`
- `BLOCKED`
- `DONE`

Resolve them to the actual statuses already configured in the Jira project.

Do not create, rename, delete or reconfigure Jira statuses or board columns as
part of normal task synchronization.


## C2C → Jira lifecycle

The normal mapping is:

| C2C state/event | Jira state |
| --- | --- |
| INIT / issue ensured | `TO_DO` |
| PLAN returned, execution not started | `TO_DO` |
| EXECUTING begins | `IN_PROGRESS` |
| EXECUTED recorded | `REVIEW` |
| independent REVIEW in progress | `REVIEW` |
| review returns correction PLAN | `REVIEW` |
| correction EXECUTING begins | `IN_PROGRESS` |
| correction EXECUTED | `REVIEW` |
| STATE: BLOCKED | `BLOCKED` |
| blocker resolved and execution resumes | `IN_PROGRESS` |
| independent C2C STATE: DONE | `DONE` |

Jira reflects C2C.

Jira must not independently determine the C2C state.


## Lifecycle metadata synchronization

Every successful Jira lifecycle transition must synchronize the issue's managed
C2C metadata to the same lifecycle point.

For example, when EXECUTED moves an issue to `REVIEW`, update at minimum:

- C2C state: EXECUTED
- C2C iteration
- Worktree
- Branch
- Baseline
- implementation status
- concise test/check summary
- available execution/evidence reference

The Jira workflow state and the managed C2C metadata must not intentionally
describe different lifecycle states.

If the workflow transition succeeds but metadata synchronization fails, or vice
versa, report:

`JIRA_SYNC: DEGRADED`

Do not claim `JIRA_SYNC: OK` until both are consistent.


## DONE gate

This is a hard invariant.

None of the following individually means DONE:

- source files exist;
- implementation exists in a worktree;
- tests pass;
- EXECUTED was recorded;
- a commit exists;
- Jira already says Done.

For normal implementation work, Jira may transition to `DONE` only after:

1. implementation is complete for the current contract;
2. required tests/checks have passed;
3. EXECUTED has been recorded;
4. ChatGPT/C2C independently reviews the implementation;
5. that independent review returns `STATE: DONE`.

Codex must not self-certify its own implementation as Jira DONE merely because
its execution or tests succeeded.


## Review corrections

When independent review requires corrections:

- keep the same `TASK_ID`;
- keep the same `JIRA_KEY`;
- keep Jira in `REVIEW` until correction execution begins;
- move to `IN_PROGRESS` when correction EXECUTING begins;
- return to `REVIEW` when the corrected EXECUTED record is produced.

Do not create a new Jira issue for another iteration of the same task.


## BLOCKED tasks

Move a task to `BLOCKED` only when a material dependency, missing decision or
external condition prevents satisfying the current task contract.

Record the blocker concisely.

Do not mark work BLOCKED merely because unrelated future work exists.


## Research and documentation tasks

Not every task requires runtime implementation.

Evaluate each task against its actual contract.

A research-only task may reach DONE through accepted research evidence.

A documentation-only task may reach DONE through accepted documentation work.

A runtime implementation task cannot reach DONE through documentation alone.

Do not convert research completion into an implementation claim.


## Worktree, commit and main are different facts

Keep these states distinct:

- implementation exists in a task worktree;
- commit exists on the task branch;
- commit exists in the repository;
- commit is reachable from `main`;
- commit is pushed to `origin/main`;
- task passed independent C2C review.

Do not report `MERGED_MAIN` merely because files exist in a worktree.

Do not report `COMMITTED` merely because tests passed.


## Tests and runtime evidence

Jira may contain a concise test summary, but Jira is not the primary test
evidence store.

A claimed test result must have inspectable execution evidence when required by
the task contract.

GPU validation must never be inferred from:

- CPU tests;
- unit tests;
- fake/mock workers;
- source inspection;
- imports;
- documentation.

If a task requires real GPU validation, explicit GPU evidence is required
before that gate may be considered satisfied.


## Jira issue updates

When updating an existing issue, preserve human-written project context.

Do not replace the entire description merely to synchronize C2C state.

Prefer maintaining a compact C2C synchronization section containing relevant
facts such as:

- Task ID
- current C2C state
- C2C iteration
- worktree
- branch
- baseline
- final commit
- test summary
- evidence
- implementation status

Do not paste long logs into Jira when they can be inspected through C2C or the
repository.


## Umbrella tasks

An umbrella task must remain open while any required child remains open.

For example, if A6 requires A6.0 through A6.7, completing A6.1 does not complete
A6.

The parent becomes eligible for final completion only when:

1. all required children are DONE;
2. optional work is explicitly identified as optional;
3. any parent-level acceptance criteria are satisfied.

Do not silently hide unfinished child work in a parent description.


## Historical DONE tasks

Do not casually reopen an accepted historical task.

If later testing discovers a new bug, missing requirement or newly discovered
scope, normally create a new dedicated `TASK_ID`.

Reopen the old task only when the current task explicitly establishes that its
original acceptance was invalid and reopening is the intended project decision.


## Dependencies

Represent dependencies or Blocks relationships only when supported by the task
contract or existing project evidence.

Do not invent dependencies from task names alone.

Do not delete historical dependency relationships merely because the dependency
has become DONE.


## Jira synchronization failures

Jira synchronization is a projection of lifecycle gates, not a precondition for
work. Do not query or mutate Jira before implementation beyond what the
C2C → Jira lifecycle table requires, and a `JIRA_SYNC: DEGRADED` condition
never pauses implementation. Report it and retry at the next lifecycle gate.

A Jira failure must not corrupt or fabricate C2C state.

If a required Jira operation fails:

1. preserve the real technical C2C state;
2. report `JIRA_SYNC: DEGRADED`;
3. do not claim the Jira update succeeded;
4. retry when appropriate.

A technically accepted task can remain technically DONE while Jira
synchronization is temporarily degraded.

The mismatch must remain visible until reconciled.


## Mutation boundaries

During normal Jira synchronization it is allowed to:

- search for the current task;
- read its issue;
- create it when absent;
- update its C2C synchronization metadata;
- transition its workflow state;
- record its final evidence metadata;
- inspect directly relevant parent/dependency issues.

Do not, unless separately authorized:

- delete Jira issues;
- bulk-edit unrelated issues;
- reconfigure the Jira project;
- reconfigure the Jira board;
- create or rename statuses;
- change unrelated priorities;
- change unrelated assignees;
- rewrite unrelated human notes;
- invent dependencies;
- mark adjacent tasks DONE.


## Status drift

Synchronization and future auditors should make contradictions visible.

Examples include:

- Jira says DONE without accepted C2C DONE;
- C2C says DONE while Jira remains open;
- implementation exists while Jira remains TO_DO;
- EXECUTED exists while Jira never reached REVIEW;
- a task claims merged-main evidence that is not in main;
- a task claims GPU validation without GPU evidence;
- an umbrella parent is DONE while required children remain open;
- multiple Jira issues exist for the same `TASK_ID`.

Do not silently normalize broad historical drift during an unrelated task.

Historical reconciliation should be handled by a dedicated audit or
reconciliation task.


## Core invariant

The intended relationship is:

`C2C decides → repository proves → Jira reflects → auditor verifies`

Jira is automated bookkeeping around C2C.

It is not a replacement for C2C.