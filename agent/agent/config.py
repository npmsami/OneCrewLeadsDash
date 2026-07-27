"""Runtime config — the Python equivalent of the n8n "Config" Set node.

Every value comes from an environment variable (loaded from .env locally, or
from GitHub Actions secrets in CI). Defaults mirror CONFIG_FIELDS in
scripts/build_workflow.js so behaviour matches the original workflow.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # dotenv is optional in CI where env is already populated
    pass

_MASTER_RESUME_PATH = Path(__file__).with_name("master_resume.txt")


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()


def _env_int(key: str, default: int) -> int:
    raw = os.environ.get(key, "").strip()
    try:
        return int(raw) if raw else default
    except ValueError:
        return default


@dataclass(frozen=True)
class Config:
    # --- LLM (OpenAI) ---
    llm_api_base: str = field(default_factory=lambda: _env("LLM_API_BASE", "https://api.openai.com/v1/chat/completions"))
    llm_model: str = field(default_factory=lambda: _env("LLM_MODEL", "gpt-4o-mini"))
    llm_api_key: str = field(default_factory=lambda: _env("LLM_API_KEY"))

    # --- Enrichment (Hunter primary, Apollo secondary) ---
    # Hunter finds professional recruiter/company emails. Key is BACKEND-ONLY
    # (GitHub Actions secret + agent .env) and never exposed to the dashboard.
    hunter_api_key: str = field(default_factory=lambda: _env("HUNTER_API_KEY"))
    # Daily search cap so one run can't drain the allowance; tracked in the
    # Supabase `usage` table (day -> hunter_calls).
    hunter_daily_cap: int = field(default_factory=lambda: _env_int("HUNTER_DAILY_CAP", 10))
    # Hunter's allowance resets MONTHLY, so this is the cap that actually
    # protects the plan (Free = 50 searches/mo; Starter = 500). Keep it a little
    # under the plan limit so a miscount can't overrun it.
    hunter_monthly_cap: int = field(default_factory=lambda: _env_int("HUNTER_MONTHLY_CAP", 45))
    apollo_api_key: str = field(default_factory=lambda: _env("APOLLO_API_KEY"))

    # --- Discovery: JSearch (RapidAPI) ---
    jsearch_api_key: str = field(default_factory=lambda: _env("JSEARCH_API_KEY"))
    jsearch_query: str = field(default_factory=lambda: _env("JSEARCH_QUERY", "devops cloud sre platform engineer"))
    jsearch_num_pages: int = field(default_factory=lambda: _env_int("JSEARCH_NUM_PAGES", 1))

    # --- Discovery: LinkedIn via Apify (MAIN source) ---
    # Runs a no-cookie LinkedIn Jobs actor with workType=remote. Locations must be
    # real LinkedIn geo names ("Worldwide" is NOT valid); we query a set of markets
    # to approximate worldwide-remote. Actor aborts below 150 results/run.
    apify_token: str = field(default_factory=lambda: _env("APIFY_TOKEN"))
    apify_actor: str = field(default_factory=lambda: _env("APIFY_ACTOR", "cheap_scraper~linkedin-job-scraper"))
    apify_keywords: str = field(default_factory=lambda: _env(
        "APIFY_KEYWORDS", "devops engineer,cloud engineer,site reliability engineer,platform engineer"))
    apify_locations: str = field(default_factory=lambda: _env(
        "APIFY_LOCATIONS", "United States,United Kingdom,India,Pakistan"))
    apify_max_results: int = field(default_factory=lambda: _env_int("APIFY_MAX_RESULTS", 200))

    # --- Storage (Supabase) ---
    supabase_url: str = field(default_factory=lambda: _env("SUPABASE_URL"))
    supabase_service_role_key: str = field(default_factory=lambda: _env("SUPABASE_SERVICE_ROLE_KEY"))

    # --- Google (Gmail + Drive, headless OAuth) ---
    google_client_id: str = field(default_factory=lambda: _env("GOOGLE_CLIENT_ID"))
    google_client_secret: str = field(default_factory=lambda: _env("GOOGLE_CLIENT_SECRET"))
    google_refresh_token: str = field(default_factory=lambda: _env("GOOGLE_REFRESH_TOKEN"))
    drive_folder_id: str = field(default_factory=lambda: _env("DRIVE_FOLDER_ID"))

    # --- Telegram ---
    telegram_bot_token: str = field(default_factory=lambda: _env("TELEGRAM_BOT_TOKEN"))
    telegram_chat_id: str = field(default_factory=lambda: _env("TELEGRAM_CHAT_ID"))

    # --- Candidate ---
    candidate_name: str = field(default_factory=lambda: _env("CANDIDATE_NAME", "Mahad Saleem"))
    candidate_email: str = field(default_factory=lambda: _env("CANDIDATE_EMAIL"))
    candidate_linkedin: str = field(default_factory=lambda: _env("CANDIDATE_LINKEDIN"))

    # --- Behaviour knobs ---
    send_emails: bool = field(default_factory=lambda: _env("SEND_EMAILS", "false").lower() == "true")
    # Guess a careers@<domain> address when no real recruiter email is found.
    # Off by default: in manual-apply mode it only produces wrong/unusable emails
    # (careers@ of a reposter/hosting domain). Leads route to manual_apply instead.
    email_pattern_fallback: bool = field(default_factory=lambda: _env("EMAIL_PATTERN_FALLBACK", "false").lower() == "true")
    min_score: int = field(default_factory=lambda: _env_int("MIN_SCORE", 70))
    lookback_hours: int = field(default_factory=lambda: _env_int("LOOKBACK_HOURS", 168))
    max_jobs_per_run: int = field(default_factory=lambda: _env_int("MAX_JOBS_PER_RUN", 30))
    # Seconds to wait between real sends (deliverability — spaced, not bursty).
    send_throttle_seconds: int = field(default_factory=lambda: _env_int("SEND_THROTTLE_SECONDS", 30))
    # Extra random jitter (0..N seconds) added on top of the throttle between
    # sends, so the cadence looks human instead of a fixed-interval bot. 0 = off.
    send_throttle_jitter_seconds: int = field(default_factory=lambda: _env_int("SEND_THROTTLE_JITTER_SECONDS", 0))

    # --- Outreach queue (human-gated send) ---
    # The dashboard "Apply" button enqueues a lead; a scheduled worker
    # (agent.outreach) sends ONE due item per tick. The gap between consecutive
    # sends is randomized in [min, max] minutes (default ~8-10) at enqueue time.
    outreach_min_gap_minutes: int = field(default_factory=lambda: _env_int("OUTREACH_MIN_GAP_MINUTES", 8))
    outreach_max_gap_minutes: int = field(default_factory=lambda: _env_int("OUTREACH_MAX_GAP_MINUTES", 10))
    # Hard ceiling on emails actually sent per calendar day (provider limit /
    # deliverability). Overridden by settings.daily_send_cap when present.
    outreach_daily_cap: int = field(default_factory=lambda: _env_int("OUTREACH_DAILY_CAP", 40))

    @property
    def master_resume(self) -> str:
        try:
            return _MASTER_RESUME_PATH.read_text(encoding="utf-8")
        except OSError:
            return ""

    @property
    def llm_omit_temperature(self) -> bool:
        """OpenAI reasoning models (gpt-5*, o1/o3/o4...) reject `temperature`."""
        m = self.llm_model.lower()
        import re

        return bool(re.match(r"^(o[0-9]|gpt-5)", m)) and "chat" not in m


@lru_cache(maxsize=1)
def get_config() -> Config:
    return Config()
