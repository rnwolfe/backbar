# backbar — agent operating manual

This project was bootstrapped from an operator-supplied spec via Factory's
spec-import path. Triage / scoring was skipped — the operator already knew
what they wanted.

## Read this first

- **docs/internal/SPEC.md** — the operator's spec, verbatim. This is your source of
  truth. Where the spec is silent, prefer conservative defaults and
  surface the gap as a `factory-decision` block (see the decision
  protocol footer in your run prompt).
- **`.factory/work/`** — task files. Each carries acceptance criteria
  drawn from the spec.

## First-task orientation

Start by reading §0 (locked decisions), §1 (domain model), §7 (repo layout), and the Agent execution notes — packages/core must be pure/IO-free and its Zod schemas are the contract every other package builds on.

## Doctrine

- Match work to ceremony. The spec named one — don't escalate or
  de-escalate it.
- The operator is not at the keyboard during runs. Use the
  factory-status / factory-decision protocols (taught in the run
  prompt's footer) to communicate — never block on stdin.
