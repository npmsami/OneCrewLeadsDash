"""Smoke test for the Hunter daily-cap plumbing (store + config + budget math).

Exercises the real Supabase `usage` table — no Hunter/LLM calls. Resets today's
counter at the end so it leaves no budget consumed.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agent.config import get_config
from agent import store

cfg = get_config()
client = store.get_client(cfg)
today = store._utc_today()

# Start clean.
client.table("usage").delete().eq("day", today).execute()

cap = cfg.hunter_daily_cap
print(f"hunter_daily_cap = {cap}")
assert cap == 15, "expected default cap 15"

spent = store.get_hunter_calls_today(cfg)
print(f"spent today (fresh) = {spent}")
assert spent == 0

t = store.incr_hunter_calls(cfg, 3)
print(f"after incr(3) -> {t}")
assert t == 3

t = store.incr_hunter_calls(cfg, 1)
print(f"after incr(1) -> {t}")
assert t == 4

spent = store.get_hunter_calls_today(cfg)
budget = max(0, cap - spent)
print(f"re-read spent = {spent}, budget = {budget}")
assert spent == 4 and budget == 11

# Simulate cap exhausted.
store.incr_hunter_calls(cfg, cap)  # 4 + 15 = 19 > cap
spent = store.get_hunter_calls_today(cfg)
budget = max(0, cap - spent)
print(f"after overspend: spent = {spent}, budget = {budget} (clamped)")
assert budget == 0

backlog = store.get_scored_awaiting_enrichment(cfg)
print(f"backlog (scored awaiting enrichment) = {len(backlog)} rows")
assert isinstance(backlog, list)

# Reset so today starts with full budget again.
client.table("usage").delete().eq("day", today).execute()
print(f"reset: spent today = {store.get_hunter_calls_today(cfg)}")
print("SMOKE HUNTER CAP CLEAN")
