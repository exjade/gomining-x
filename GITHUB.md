# Git and GitHub automation contract

This document defines repository-specific Git and GitHub execution mechanics
for substantial C2C tasks. It extends the normal project workflow; it is not a
second C2C skill or a substitute for the authorities listed below.

## Authority and overrides

Follow, in order of authority:

1. The official `$codex-with-chatgpt` skill.
2. Repository `AGENTS.md`.
3. The explicit current task contract, including its worktree, commit, push,
   deployment, and scope restrictions.
4. Accepted C2C PLAN and REVIEW decisions, within the task contract.
5. This document's Git/GitHub defaults.

`JIRA.md` remains authoritative for Jira identity, workflow, and synchronization.
This file must not duplicate or override it. Explicit constraints such as
`NO_COMMIT`, `NO_PUSH`, or a narrower authorized worktree take precedence over
the defaults here.

## Roles

### Codex

Codex owns routine safe repository operations: inspecting state, fetching,
creating and verifying task worktrees, staging reviewed paths, committing at
the allowed gate, constructing isolated integration worktrees, running checks,
publishing when the task authorizes publication, and verifying remote refs.
Batch routine commands into coherent safe operations instead of asking the user
to relay ordinary shell output.

### C2C

C2C owns independent planning, implementation review, safety decisions for
semantic conflicts, and the acceptance gate. It should inspect meaningful
repository checkpoints and evidence through MCP; it need not approve each
routine shell command individually. Any publication audit explicitly required
by the task remains a gate.

### User

The user is not a routine shell-command relay. Escalate only when a genuine
human decision or authorization is needed, such as an unresolved product or
architecture choice, unavailable credentials, destructive action, ambiguous
repository identity, branch protection requiring human action, task-owned work
overlapping user changes that cannot be isolated, an explicit task approval
gate, or a semantic conflict C2C cannot resolve from repository authority.

## Repository identity and pre-existing state

Before task work, run one batched read-only preflight and record its output
once. It must cover the repository root and remote identity, current branch and
HEAD, upstream and local remote-tracking ref, worktree list, and staged,
unstaged, and untracked paths relevant to the task, so the pre-existing dirty
state cannot be confused with task changes. Do not print credentials embedded
in remote configuration. Do not repeat the preflight unless Codex's own action
could have changed the state; the only routine re-checks are the status check
before commit and before push.

```sh
git rev-parse --show-toplevel
git remote -v | sed -E 's#(://)[^@/]+@#\1#'
git status -sb --untracked-files=normal
git rev-parse HEAD
git worktree list
```

Pre-existing user changes are protected. Do not stage, commit, revert, delete,
clean, stash, reset, move, or rewrite changes outside the authorized task scope.
A dirty `main` worktree is not by itself a blocker and need not be cleaned to
complete or publish an isolated task. Treat nested repositories such as
`ASR/MyBrainAssistant` as separate authorities unless explicitly included in
the task.

If the authorized task worktree itself contains unexplained pre-existing
changes, preserve them and establish ownership before editing or staging.

## Task branches and worktrees

For substantial tasks, follow an explicitly supplied worktree when the task
provides one. Otherwise:

1. Inspect local and remote refs, worktrees, and collisions.
2. Fetch the relevant remote when appropriate, without pruning or destructive
   cleanup.
3. Determine and record the accepted baseline; do not silently substitute a
   different ref.
4. Reuse a worktree only when it is clearly associated with the same
   `TASK_ID`, its branch is appropriate, and its state is safe to continue.
5. Otherwise create a task-specific branch and worktree autonomously, for
   example `task/<task-id>` under `_worktrees/<task-id>/`.
6. Verify the path, branch, HEAD, and initial status before editing.

Never silently repurpose a worktree belonging to another task. Keep task edits
inside the authorized task worktree; do not switch branches in or edit the
user's dirty main checkout to avoid creating a worktree.

### Branch discipline

One `TASK_ID` uses one task branch and one task worktree. Do not switch
branches or worktrees mid-task to investigate, to avoid a failing check, or to
retry. To inspect another ref, use read-only commands that do not move HEAD
(`git show <ref>:<path>`, `git diff <ref> -- <path>`, `git log <ref>`). The only
additional worktree a task may create is the isolated integration worktree
described below, and only after C2C `DONE`.

## C2C acceptance and task commit

The default lifecycle for substantial work is:

```text
C2C PLAN → implementation and checks → EXECUTED → independent REVIEW
→ C2C DONE → task commit
```

Do not commit merely because implementation or tests pass, or while C2C still
requires corrections. A task-specific contract may define a different gate;
honor it. C2C acceptance, task commit, integration, and publication are separate
facts.

## Exact staging and task commit

Before a task commit:

- inspect status and the exact reviewed changed-file inventory;
- stage only explicit task paths;
- do not use `git add -A` as the default in a repository with unrelated state;
- verify staged paths and inspect the staged diff;
- run `git diff --cached --check`;
- prove that no unrelated or pre-existing user change entered the index.

Commit only after the applicable acceptance gate. Use a concise message matching
the change. Do not amend unrelated commits, rewrite user history, or rebase just
for convenience.

## Isolated integration worktree

The user's checked-out `main` is not the integration surface and does not need
to be clean or synchronized. After an accepted task commit, when integration is
within the task's authorized delivery:

1. Fetch the intended remote and record the current `origin/main` commit.
2. Inspect drift from the task's original baseline.
3. Create a temporary integration branch and worktree from that fetched
   `origin/main`, for example `integrate/<task-id>` under
   `_worktrees/_integration/<task-id>/`.
4. Cherry-pick the accepted task commit when that is the repository's smallest
   safe integration method.
5. Verify the resulting commit, status, and changed paths before publication.

Check for path/branch collisions first. Never reuse an integration worktree
unless it is clean and clearly belongs to the same `TASK_ID`.

## Baseline drift and conflicts

If `origin/main` has not changed, integrate the accepted task commit normally.
If it advanced in unrelated areas, integrate on top of the latest fetched
`origin/main` and rerun checks affected by that drift. Do not overwrite or
discard upstream work.

Diagnose textual conflicts without choosing a semantic resolution by default. A
mechanically obvious resolution may preserve both accepted task intent and
upstream changes, followed by diff and test verification. If the conflict
touches overlapping behavior, governance, or normative policy—or its safe
resolution is uncertain—stop and return the exact evidence to C2C. Never choose
between conflicting authorities unilaterally.

## Post-integration verification

Before publishing, verify that:

- the integration worktree is in the expected state and the intended
  integration commit is present;
- the integration candidate is based on the recorded fetched `origin/main`;
- the accepted task change is present with its reviewed scope intact;
- the diff from the pre-integration remote contains the accepted task scope and
  no unrelated replacement or deletion;
- prove accepted-change delivery according to the integration method:
  - for identity-preserving integration, verify the accepted task commit is
    reachable from the candidate;
  - for cherry-pick integration, verify the accepted change is equivalent
    between the task branch and integration candidate; do not require the
    original task commit to be an ancestor of the cherry-picked commit;
- required diff and whitespace checks pass;
- task-specific tests are rerun when the new base could affect their result;
- protected worktrees and user-owned paths remain untouched.

Local AI Docker builds and AI-container smoke tests are governed by the local
resource constraints in `AGENTS.md`; Git/GitHub publication tasks must not add
them as implicit pre-push gates.

For cherry-pick equivalence, compare the accepted task change from its original
baseline with the integration change from the recorded pre-integration remote.
Proof may use stable patch identity, exact accepted-scope diff equivalence, or
accepted-path blob/tree identity. Run one such proof. Once it passes, do not
run alternative proofs for the same fact; run another only if the first is
inconclusive. Whole-tree equality is useful only when both
bases are identical and no unrelated upstream drift exists. Do not require one
brittle Git command when another deterministic proof establishes the same
accepted change.

Do not assume checks on an older task baseline validate a materially different
integration candidate.

## Push and remote verification

When the requested task outcome is repository delivery, Codex completes the
normal commit, isolated integration, and publication path autonomously after
C2C `DONE` and all post-integration gates pass, unless the current task contract
or user explicitly limits the work to local-only or prohibits publication.
An explicit `NO_PUSH` always prevents publication. If the requested outcome,
target repository, or authorization is genuinely ambiguous, resolve that before
pushing; do not ask the user to run routine push commands. Push explicitly to
the intended remote and ref. Never use force push or
force-with-lease, delete a remote branch, or rewrite `origin/main` as a routine
operation. If a normal push is rejected because the remote advanced, fetch,
rebuild the integration candidate, rerun required checks, and retry a normal
push. Rebuild from the newly fetched remote tip in a verified clean task-specific
integration worktree; do not hard-reset or force-update the old candidate.
Preserve any prior candidate whose ownership or cleanliness is uncertain. Do
not bypass branch protection or repository policy.

A successful local push is not publication proof. Fetch or inspect the remote
ref after pushing and verify that it resolves to the expected integration
commit. Then prove accepted-task delivery according to the integration method:
for identity-preserving integration, verify the accepted task commit is
reachable from the published commit; for cherry-pick integration, verify the
published integration commit contains the previously verified accepted-change
equivalent. Do not falsely report original task-commit reachability after a
cherry-pick. Report `PUBLISHED` only after both remote-ref and accepted-delivery
verification pass. If credentials or authorization are unavailable, report
the exact external blocker rather than asking the user to run routine commands.

Publication evidence must use full 40-character hexadecimal Git-derived object IDs,
never abbreviated UI or display hashes. After the post-push fetch, obtain
`EXPECTED_INTEGRATION_COMMIT`
from `git rev-parse` of the integration tip, `ORIGIN_MAIN_AFTER` from
`git rev-parse origin/main`, and `REMOTE_MAIN_VERIFIED` as the full SHA returned
by direct verification of `refs/heads/main`. Require exact equality:
`EXPECTED_INTEGRATION_COMMIT == ORIGIN_MAIN_AFTER == REMOTE_MAIN_VERIFIED`.
The final report must include full values for `INTEGRATION_COMMIT`,
`ORIGIN_MAIN_AFTER`, and `REMOTE_REFS_HEADS_MAIN`, and state that they agree.
If any value differs, report `PUBLICATION=INCOMPLETE`; do not claim
`PUBLISHED`, `PUBLICATION=VERIFIED`, or completion of the publication gate until
the discrepancy is reconciled. This supplements the accepted-delivery proof above.

Once remote publication for the current `TASK_ID` has been independently verified
and its final report produced, that `TASK_ID`’s Git lifecycle is complete. This
does not authorize starting or preparing another task. Follow the task
authorization boundary in `AGENTS.md`: dependency order or project context does
not authorize another worktree, branch, Jira transition, `PLAN`, or implementation;
explicit user authorization is required.

## Jira and Git state separation

Read and follow `JIRA.md`; do not duplicate its workflow here. Keep these facts
distinct: Jira `DONE`, C2C `DONE`, task commit, integration, and remote
publication. Jira status is not evidence of Git publication, and a pushed commit
does not independently authorize Jira `DONE`.

## Cleanup

Use conservative cleanup. Preserve accepted task branches and worktrees. A
temporary integration worktree may be removed only when Codex created it for
the same `TASK_ID`, it is clean, its publication is remotely verified, and its
integration commit is reachable from `origin/main`. Do not prune or delete
unknown worktrees, branches, or untracked files.

## Prohibited routine operations

Do not use these as ordinary recovery or cleanup:

- `git reset --hard`;
- `git clean -fd` or `git clean -fdx`;
- checkout/restore of unrelated user files;
- stashing unrelated user state;
- force push or force-with-lease;
- history rewriting;
- deleting unknown branches, worktrees, or untracked files.

A destructive exception requires explicit human authorization for the exact
affected paths or refs. Do not make destructive cleanup part of the default
automation.

## C2C evidence and final report

At meaningful checkpoints, make the exact task worktree, diff, status, and
execution evidence available to C2C through the connected workspace. A
publication evidence record should include:

- `TASK_ID`, original baseline, task worktree/branch, and task commit;
- `origin/main` before integration;
- integration worktree/branch, integration method, and integration commit;
- accepted-delivery proof result (`TASK_COMMIT_REACHABLE=YES` for
  identity-preserving integration, or `ACCEPTED_CHANGE_EQUIVALENT=YES` for a
  cherry-pick);
- accepted scope and status verification;
- post-integration checks and test evidence;
- intended push refspec and confirmation that no force operation is used;
- `origin/main` after publication and remote verification result;
- Jira key/state where applicable, technical maturity, publication state, and
  remaining boundaries.

For final user reports, summarize those outcomes compactly. Do not dump routine
command transcripts unless a failure needs diagnosis. A failed routine Git or
test command is not automatically a user blocker: diagnose it, correct ordinary
failures, and return to C2C when independent review is needed.