# VantaHome continuity

Start with [docs/WORKING_CONTEXT.md](docs/WORKING_CONTEXT.md) when resuming this
project. It records current decisions, verification evidence, cache locations,
and remaining work. Read the relevant detailed document only when needed.

Update that handoff after meaningful milestones. Keep it concise and factual;
never store passwords, tokens, private keys, recovery links, or email codes.
Treat cached logs as evidence of past runs, not proof of current external state.

Maintain [docs/IMPLEMENTATION_BACKLOG.md](docs/IMPLEMENTATION_BACKLOG.md) as the
prioritized list of unfinished work, accepted deferrals, and useful opportunities.
For meaningful feature work, inspect adjacent authorization, lifecycle, recovery,
accessibility, and performance paths. Record concrete discoveries with evidence,
priority, and a next action. Distinguish verified defects from ideas and untested
risks; do not repeatedly rediscover resolved findings or imply exhaustive security.

Use typed, focused, documented code and the existing styling system; no inline
styles. Preserve touch momentum, reduced overscroll, and reduced-motion behavior.
Run relevant checks, review the final diff, and commit and push completed work to
the current branch. Do not mix unrelated changes into a commit.
