.DEFAULT_GOAL := help

PORT = 8879

# ── Help ──────────────────────────────────────────────────────────────────────
.PHONY: help
help:
	@echo ""
	@echo "  make serve    Start dev server → http://localhost:$(PORT)"
	@echo "  make kill     Kill this project's HTTP server"
	@echo "  make validate Run every validator. Required before any change lands."
	@echo ""

# ── Dev server ────────────────────────────────────────────────────────────────
# scripts/serve.py is http.server plus Cache-Control: no-cache; a plain
# http.server sends only Last-Modified, so browsers keep stale ES modules after
# edits. Falls back to plain http.server outside the monorepo.
.PHONY: serve
serve:
	@echo "Serving → http://localhost:$(PORT)"
	@if [ -f ../../scripts/serve.py ]; then python3 ../../scripts/serve.py $(PORT); else python3 -m http.server $(PORT); fi

# ── Kill ──────────────────────────────────────────────────────────────────────
.PHONY: kill
kill:
	@lsof -ti :$(PORT) | xargs kill 2>/dev/null && echo "Stopped server on port $(PORT)" || echo "No server running on port $(PORT)"

# ── Validate ──────────────────────────────────────────────────────────
# Node with no dependencies, so there is no install step and no bundler. Each
# one exits 0, or exits 1 naming the case it failed.
#
# One target per validator. To wire in another one, add a .PHONY target and a
# bare `validate: <your-target>` line of your own: make collects prerequisites
# from every rule for a target as long as only one of them carries a recipe, so
# two workstreams can each add a validator without editing the other's line.
.PHONY: validate
validate: test-scheduler
	@echo "validate: every check passed"

# FSRS-6 against the checkpoints transcribed from fsrs-rs 6.6.2. The three
# silent wrong answers live here: the pre-update difficulty ordering, the
# unclamped mean-reversion target, and the FSRS-6 lapse ceiling.
.PHONY: test-scheduler
test-scheduler:
	@node tools/test-scheduler.mjs

# The ?src= origin allowlist, with its negative cases. A deck source that gets
# through this is a deck source that runs against a visitor's own ledger.
validate: test-origin
.PHONY: test-origin
test-origin:
	@node tools/test-origin.mjs

# neo-deck/1 and neo-ledger/1 (C4 and C5). The shell imports this same module
# at load time, so there is one notion of valid rather than two.
validate: test-validate
.PHONY: test-validate
test-validate:
	@node tools/test-validate.mjs

# The personal: namespace and its version order (C12 A19). The reserve rule,
# and the comparison rule 5 uses to decide whether a re-sent deck keeps the
# learner's scheduling or restarts it.
validate: test-personal
.PHONY: test-personal
test-personal:
	@node tools/test-personal.mjs

# The romaji reader (C12 A16, A17), both halves, against the vendored wanakana.
validate: test-transforms
.PHONY: test-transforms
test-transforms:
	@node tools/test-transforms.mjs

# The budgets nothing else can see: the C8.3 card map ceiling, JS module sizes,
# app.js, and inline onclick.
validate: check-limits
.PHONY: check-limits
check-limits:
	@node tools/check-limits.mjs

# The documents themselves: every neo-deck/1 under data/decks and every fixture
# under tools/fixtures, against C4 and C5. The tests above check the validator;
# this checks what this build actually ships through it.
validate: validate-decks
.PHONY: validate-decks
validate-decks:
	@node tools/validate-deck.mjs
