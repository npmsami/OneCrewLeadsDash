// Builds the n8n workflow JSON for the Job Application Automation Agent.
// Run: node scripts/build_workflow.js  -> writes ../job-application-agent.n8n.json
// Generating via script guarantees valid JSON and lets dry_run.js execute the
// exact Code-node sources that ship in the workflow file.
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Node name constants (used in connections AND inside code/expressions, so a
// typo is impossible).
// ---------------------------------------------------------------------------
const N = {
  TRIG12: 'Every 12 Hours',
  TRIG_MANUAL: 'Manual Test',
  CONFIG: 'Config',
  F_REMOTEOK: 'Fetch RemoteOK',
  F_REMOTIVE: 'Fetch Remotive',
  F_ARBEITNOW: 'Fetch Arbeitnow',
  F_JOBICY: 'Fetch Jobicy',
  F_HIMALAYAS: 'Fetch Himalayas',
  F_WWR: 'Fetch WWR RSS',
  N_REMOTEOK: 'Normalize RemoteOK',
  N_REMOTIVE: 'Normalize Remotive',
  N_ARBEITNOW: 'Normalize Arbeitnow',
  N_JOBICY: 'Normalize Jobicy',
  N_HIMALAYAS: 'Normalize Himalayas',
  N_WWR: 'Normalize WWR',
  MERGE: 'Merge Sources',
  FILTERS: 'Hard Filters',
  READ_LOG: 'Read Sheet Log',
  FILTER_NEW: 'Filter New Jobs',
  LOG_NEW: 'Log New Jobs',
  SCORE_PROMPT: 'Build Score Prompt',
  LLM_SCORE: 'LLM: Score Job',
  PARSE_SCORE: 'Parse Score',
  SAVE_SCORE: 'Save Score',
  ROUTE: 'Route by Score',
  TG_GEO: 'TG: Geo Blocked',
  TG_LOW: 'TG: Low Match',
  TG_ERR: 'TG: Score Error',
  DOMAIN: 'Extract Domain',
  HUNTER: 'Hunter: Find Email',
  PICK_HUNTER: 'Pick Hunter Email',
  IF_HUNTER: 'Hunter Found?',
  APOLLO: 'Apollo: Find People',
  PICK_APOLLO: 'Pick Apollo Email',
  FINALIZE: 'Finalize Email',
  SAVE_ENRICH: 'Save Enrichment',
  RESUME_PROMPT: 'Build Resume Prompt',
  LLM_RESUME: 'LLM: Tailor Resume',
  PARSE_RESUME: 'Parse Resume',
  DOC_CREATE: 'Create Resume Doc',
  SAVE_RESUME: 'Save Resume Link',
  IF_EMAIL: 'Email Found?',
  EMAIL_PROMPT: 'Build Email Prompt',
  LLM_EMAIL: 'LLM: Cold Email',
  PARSE_EMAIL: 'Parse Cold Email',
  IF_SEND: 'Send Enabled?',
  EXPORT_PDF: 'Export Resume PDF',
  SET_FILENAME: 'Set PDF Filename',
  GMAIL_SEND: 'Gmail: Send Application',
  MARK_APPLIED: 'Mark Applied',
  TG_APPLIED: 'TG: Applied',
  MARK_DRY: 'Mark Dry Run',
  TG_DRY: 'TG: Dry Run',
  MARK_MANUAL: 'Mark Manual Apply',
  TG_MANUAL: 'TG: Manual Apply',
  // follow-up flow
  TRIG_FU: 'Daily Follow-up Check',
  CONFIG_FU: 'Config (Follow-up)',
  READ_ALL: 'Read All Rows',
  GMAIL_INBOX: 'Gmail: Recent Inbox',
  SELECT_DUE: 'Select Due Actions',
  ROUTE_FU: 'Route Follow-up',
  MARK_REPLIED: 'Mark Replied',
  TG_REPLY: 'TG: Reply Received',
  FU_PROMPT: 'Build FU Prompt',
  LLM_FU: 'LLM: Follow-up',
  PARSE_FU: 'Parse Follow-up',
  IF_SEND_FU: 'Send FU Enabled?',
  GMAIL_FU: 'Gmail: Send Follow-up',
  MARK_FU: 'Mark Followed Up',
  TG_FU: 'TG: Follow-up Sent',
  MARK_FU_DRY: 'Mark FU Dry Run',
  TG_FU_DRY: 'TG: FU Dry Run',
  MARK_CLOSED: 'Mark Closed',
  TG_CLOSED: 'TG: Closed',
};

// Sheet columns (header row, exact order — paste into row 1 of the sheet)
const COLUMNS = ['job_id','job_title','company','matched_track','source','job_url','posted_date','scraped_at','match_score','geo_eligible','geo_reason','seniority_match','matched_keywords','missing_keywords','recruiter_name','recruiter_email','email_confidence','email_source','resume_filename','resume_drive_link','email_subject','applied_at','reply_received','reply_date','followup_sent','followup_date','status','notes'];

// ---------------------------------------------------------------------------
// Code node sources. Built with string concatenation (no template literals)
// so they can be embedded and unit-tested verbatim.
// ---------------------------------------------------------------------------
const CODE = {};

CODE.normalizeRemoteOK = [
  "// RemoteOK: response is an array; first element is a legal notice (no position).",
  "const out = [];",
  "for (const item of $input.all()) {",
  "  const j = item.json || {};",
  "  if (!j || !(j.position || j.title) || !j.company) continue;",
  "  out.push({ json: {",
  "    title: String(j.position || j.title),",
  "    company: String(j.company),",
  "    url: String(j.url || ('https://remoteok.com' + (j.apply_url || ''))),",
  "    location_tag: String(j.location || 'Remote'),",
  "    posted_at: String(j.date || (j.epoch ? new Date(Number(j.epoch) * 1000).toISOString() : '')),",
  "    description: String(j.description || ''),",
  "    tags: Array.isArray(j.tags) ? j.tags : [],",
  "    salary_raw: j.salary_min ? ('$' + j.salary_min + '-' + (j.salary_max || '?')) : '',",
  "    company_website: '',",
  "    source: 'remoteok',",
  "  }});",
  "}",
  "return out;",
].join('\n');

CODE.normalizeRemotive = [
  "const first = $input.first();",
  "const jobs = (first && first.json && Array.isArray(first.json.jobs)) ? first.json.jobs : [];",
  "return jobs.map(j => ({ json: {",
  "  title: String(j.title || ''),",
  "  company: String(j.company_name || ''),",
  "  url: String(j.url || ''),",
  "  location_tag: String(j.candidate_required_location || 'Remote'),",
  "  posted_at: String(j.publication_date || ''),",
  "  description: String(j.description || ''),",
  "  tags: Array.isArray(j.tags) ? j.tags : [],",
  "  salary_raw: String(j.salary || ''),",
  "  company_website: '',",
  "  source: 'remotive',",
  "}}));",
].join('\n');

CODE.normalizeArbeitnow = [
  "const first = $input.first();",
  "const jobs = (first && first.json && Array.isArray(first.json.data)) ? first.json.data : [];",
  "return jobs.filter(j => j && j.remote === true).map(j => ({ json: {",
  "  title: String(j.title || ''),",
  "  company: String(j.company_name || ''),",
  "  url: String(j.url || ''),",
  "  location_tag: String(j.location || 'Remote'),",
  "  posted_at: j.created_at ? new Date(Number(j.created_at) * 1000).toISOString() : '',",
  "  description: String(j.description || ''),",
  "  tags: [].concat(j.tags || [], j.job_types || []),",
  "  salary_raw: '',",
  "  company_website: '',",
  "  source: 'arbeitnow',",
  "}}));",
].join('\n');

CODE.normalizeJobicy = [
  "const first = $input.first();",
  "const jobs = (first && first.json && Array.isArray(first.json.jobs)) ? first.json.jobs : [];",
  "return jobs.map(j => ({ json: {",
  "  title: String(j.jobTitle || ''),",
  "  company: String(j.companyName || ''),",
  "  url: String(j.url || ''),",
  "  location_tag: String(j.jobGeo || 'Remote'),",
  "  posted_at: String(j.pubDate || '').replace(' ', 'T'),",
  "  description: String(j.jobDescription || j.jobExcerpt || ''),",
  "  tags: [].concat(j.jobIndustry || [], j.jobType || []),",
  "  salary_raw: j.salaryMin ? ((j.salaryCurrency || '$') + j.salaryMin + '-' + (j.salaryMax || '?') + '/' + (j.salaryPeriod || 'yr')) : '',",
  "  company_website: '',",
  "  source: 'jobicy',",
  "}}));",
].join('\n');

CODE.normalizeHimalayas = [
  "const first = $input.first();",
  "const jobs = (first && first.json && Array.isArray(first.json.jobs)) ? first.json.jobs : [];",
  "return jobs.map(j => ({ json: {",
  "  title: String(j.title || ''),",
  "  company: String(j.companyName || ''),",
  "  url: String(j.applicationLink || j.guid || ''),",
  "  location_tag: (Array.isArray(j.locationRestrictions) && j.locationRestrictions.length) ? j.locationRestrictions.join(', ') : 'Worldwide',",
  "  posted_at: j.pubDate ? new Date(Number(j.pubDate) * 1000).toISOString() : '',",
  "  description: String(j.description || j.excerpt || ''),",
  "  tags: [].concat(j.categories || [], j.seniority || []),",
  "  salary_raw: j.minSalary ? ((j.currency || 'USD') + ' ' + j.minSalary + '-' + (j.maxSalary || '?') + '/' + (j.salaryPeriod || 'yr')) : '',",
  "  company_website: '',",
  "  source: 'himalayas',",
  "}}));",
].join('\n');

CODE.normalizeWWR = [
  "// We Work Remotely RSS items: title is 'Company: Role'",
  "const out = [];",
  "for (const item of $input.all()) {",
  "  const j = item.json || {};",
  "  const rawTitle = String(j.title || '');",
  "  if (!rawTitle || !j.link) continue;",
  "  const idx = rawTitle.indexOf(':');",
  "  const company = idx > 0 ? rawTitle.slice(0, idx).trim() : 'Unknown';",
  "  const title = idx > 0 ? rawTitle.slice(idx + 1).trim() : rawTitle.trim();",
  "  out.push({ json: {",
  "    title: title,",
  "    company: company,",
  "    url: String(j.link),",
  "    location_tag: 'Remote',",
  "    posted_at: String(j.isoDate || j.pubDate || ''),",
  "    description: String(j.content || j['content:encoded'] || j.contentSnippet || ''),",
  "    tags: [],",
  "    salary_raw: '',",
  "    company_website: '',",
  "    source: 'weworkremotely',",
  "  }});",
  "}",
  "return out;",
].join('\n');

CODE.hardFilters = [
  "// STAGE 1 hard filters + STAGE 2 hash. Drops non-target roles, junior/onsite,",
  "// obvious geo locks, stale posts, excluded companies; dedupes within the batch.",
  "const cfg = $('" + N.CONFIG + "').first().json;",
  "const LOOKBACK_MS = (Number(cfg.LOOKBACK_HOURS) || 48) * 3600 * 1000;",
  "const now = Date.now();",
  "",
  "const INCLUDE = /(dev\\s*ops|dev\\s*sec\\s*ops|site reliability|\\bsre\\b|platform engineer|infrastructure engineer|cloud (engineer|architect|security|infrastructure|platform)|aws (engineer|architect|devops)|azure (engineer|architect|devops)|gcp engineer|appsec|application security|mlops|ml\\s*ops|llmops|llm\\s*ops|dataops|data\\s*ops|data (platform|infrastructure) engineer|ai (engineer|automation|infrastructure|platform)|genai|gen\\s*ai|ml (infrastructure|platform) engineer|machine learning (infrastructure|platform)|kubernetes engineer|cloud devops)/i;",
  "const EXCLUDE_TITLE = /(intern(ship)?\\b|junior|\\bjr\\.?\\b|entry[\\s-]?level|graduate|trainee|working student|associate degree)/i;",
  "const ONSITE = /(on[\\s-]?site|in[\\s-]?office|hybrid)/i;",
  "const GEO_REJECT = /(\\bus[- ]only\\b|usa only|united states only|u\\.s\\. only|us citizens?|green card|security clearance|must (be |reside |live )?(based |located )?in (the )?(us|usa|u\\.s|uk|eu|europe|canada|australia|germany|netherlands)\\b|(us|uk|eu) work authoriz|authorized to work in (the )?(us|u\\.s|uk|eu)|right to work in (the )?(us|uk|eu)|eu (residents?|citizens?) only|north america only|americas only|(eastern|pacific|central|mountain) time ?zone (required|only))/i;",
  "// location_tag that names a specific lock-in country/region with no PK-eligible marker",
  "const COUNTRY_LOCK = /(\\busa?\\b|united states|u\\.s\\.|\\buk\\b|united kingdom|\\beu\\b|europe|canada|australia|germany|france|netherlands|poland|spain|portugal|latam|south america|north america|americas|brazil|mexico|japan|korea)/i;",
  "const ELIGIBLE = /(worldwide|anywhere|global|international|remote|pakistan|asia|apac|emea|mena|middle east)/i;",
  "const EXCLUDED_COMPANIES = /netsol/i;",
  "",
  "const fnv1a = function (s) {",
  "  let h = 0x811c9dc5;",
  "  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }",
  "  return h.toString(16).padStart(8, '0');",
  "};",
  "",
  "const seen = new Set();",
  "const out = [];",
  "for (const item of $input.all()) {",
  "  const j = item.json || {};",
  "  if (!j.title || !j.company || !j.url) continue;",
  "  const title = String(j.title).trim();",
  "  const company = String(j.company).trim();",
  "  const loc = String(j.location_tag || '').trim();",
  "  const desc = String(j.description || '').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();",
  "  const tags = Array.isArray(j.tags) ? j.tags.join(' ') : String(j.tags || '');",
  "",
  "  if (EXCLUDED_COMPANIES.test(company)) continue;",
  "  if (!INCLUDE.test(title) && !INCLUDE.test(tags)) continue;",
  "  if (EXCLUDE_TITLE.test(title)) continue;",
  "  if (ONSITE.test(title) || ONSITE.test(loc)) continue;",
  "  if (COUNTRY_LOCK.test(loc) && !ELIGIBLE.test(loc)) continue;",
  "  if (GEO_REJECT.test(loc) || GEO_REJECT.test(desc.slice(0, 4000))) continue;",
  "",
  "  let postedMs = Date.parse(String(j.posted_at || '').replace(' ', 'T'));",
  "  if (!isNaN(postedMs)) {",
  "    if (now - postedMs > LOOKBACK_MS) continue;",
  "  } else { postedMs = null; }",
  "",
  "  const urlNorm = String(j.url).toLowerCase().split('?')[0].replace(/\\/+$/, '');",
  "  const key = (title + '|' + company).toLowerCase();",
  "  const job_id = 'j' + fnv1a(key + '|' + urlNorm) + fnv1a(urlNorm);",
  "  if (seen.has(key) || seen.has(job_id)) continue;",
  "  seen.add(key); seen.add(job_id);",
  "",
  "  out.push({ json: {",
  "    job_id: job_id,",
  "    job_title: title,",
  "    company: company,",
  "    job_url: String(j.url),",
  "    source: String(j.source || 'unknown'),",
  "    location_tag: loc || 'Remote',",
  "    posted_date: postedMs ? new Date(postedMs).toISOString() : '',",
  "    scraped_at: new Date().toISOString(),",
  "    description: desc.slice(0, 12000),",
  "    salary_raw: String(j.salary_raw || ''),",
  "    company_website: String(j.company_website || ''),",
  "  }});",
  "}",
  "out.sort((a, b) => String(b.json.posted_date).localeCompare(String(a.json.posted_date)));",
  "return out;",
].join('\n');

CODE.filterNew = [
  "// STAGE 2: drop anything already in the sheet (by job_id, and by title+company",
  "// so the same role found on two boards is not applied to twice). Cap per run.",
  "const cfg = $('" + N.CONFIG + "').first().json;",
  "const cap = Math.max(1, Number(cfg.MAX_JOBS_PER_RUN) || 10);",
  "const existingIds = new Set();",
  "const existingPairs = new Set();",
  "for (const row of $input.all()) {",
  "  const r = row.json || {};",
  "  if (r.job_id) existingIds.add(String(r.job_id));",
  "  if (r.job_title && r.company) existingPairs.add((String(r.job_title) + '|' + String(r.company)).toLowerCase());",
  "}",
  "const fresh = $('" + N.FILTERS + "').all().filter(i => {",
  "  const j = i.json;",
  "  if (existingIds.has(String(j.job_id))) return false;",
  "  if (existingPairs.has((String(j.job_title) + '|' + String(j.company)).toLowerCase())) return false;",
  "  return true;",
  "});",
  "return fresh.slice(0, cap);",
].join('\n');

// Helper snippet reused by every prompt-builder: builds the OpenAI
// chat-completions request body.
function llmBodySnippet(configNode) {
  return [
    "const cfg = $('" + configNode + "').first().json;",
    "// OpenAI reasoning models (gpt-5*, o1/o3/o4...) reject the temperature param - omit it for them",
    "const noTemp = /^(o[0-9]|gpt-5)/i.test(String(cfg.LLM_MODEL)) && !/chat/i.test(String(cfg.LLM_MODEL));",
    "const makeBody = function (prompt) {",
    "  const body = { model: cfg.LLM_MODEL, messages: [{ role: 'user', content: prompt }] };",
    "  if (!noTemp) body.temperature = 0;",
    "  return JSON.stringify(body);",
    "};",
  ].join('\n');
}

CODE.scorePrompt = [
  "// STAGE 3 prompt (verbatim from the master spec) + OpenAI request body.",
  llmBodySnippet(N.CONFIG),
  "const items = $input.all();",
  "const out = [];",
  "for (let i = 0; i < items.length; i++) {",
  "  let j = items[i].json;",
  "  try { j = Object.assign({}, $('" + N.FILTER_NEW + "').itemMatching(i).json); } catch (e) { j = Object.assign({}, j); }",
  "  const prompt = [",
  "    'You are evaluating a remote job posting for a Senior Engineer based in Pakistan who is open to roles across these four tracks:',",
  "    '',",
  "    'Track 1 - DevOps / DevSecOps / Platform / SRE',",
  "    'Track 2 - Cloud Engineering / Cloud Security (AWS, Azure, GCP)',",
  "    'Track 3 - AI Engineering / AI Automation / LLMOps / GenAI Infrastructure',",
  "    'Track 4 - DataOps / Data DevOps / MLOps / ML Infrastructure',",
  "    '',",
  "    'Candidate stack: AWS, Azure, GCP, Kubernetes, Docker, Terraform, Ansible, GitHub Actions, Azure DevOps, Jenkins, Grafana, Prometheus, Datadog, Nginx, Application Gateway, Bash, Python, MongoDB Atlas, PostgreSQL, DevSecOps, IAM, Secrets Management, Security Hub, n8n, LLM APIs (OpenAI, Anthropic), Agentic Workflows, API Orchestration, AI/ML Infrastructure, FinOps.',",
  "    '',",
  "    'Job Posting:',",
  "    'Title: ' + j.job_title,",
  "    'Company: ' + j.company,",
  "    'Location / geo note: ' + (j.location_tag || 'not stated'),",
  "    'Salary info: ' + (j.salary_raw || 'not stated'),",
  "    'Description: ' + String(j.description || '').slice(0, 7000),",
  "    '',",
  "    'Evaluate and return ONLY this JSON with no markdown or explanation:',",
  "    '',",
  "    '{',",
  "    '  \"match_score\": 0-100,',",
  "    '  \"matched_track\": \"DevOps | Cloud | AI/Automation | DataOps\",',",
  "    '  \"matched_keywords\": [\"list of matched stack items\"],',",
  "    '  \"missing_keywords\": [\"list of missing items\"],',",
  "    '  \"seniority_match\": true/false,',",
  "    '  \"geo_eligible\": true/false,',",
  "    '  \"geo_reason\": \"one line reason\",',",
  "    '  \"recommended_action\": \"apply / skip\",',",
  "    '  \"skip_reason\": \"one line - only if skip\"',",
  "    '}',",
  "    '',",
  "    'geo_eligible = false IF: US only, EU residents only, requires work authorization, specific visa required, must have right to work in specific country.',",
  "    'geo_eligible = true IF: worldwide, remote, APAC, EMEA, MENA, Asia, Pakistan, or no geographic restriction mentioned.',",
  "    '',",
  "    'Score across all four tracks. Use the highest matching track score.',",
  "    'Return JSON only. No markdown. No backticks.',",
  "  ].join('\\n');",
  "  j.llm_body = makeBody(prompt);",
  "  out.push({ json: j });",
  "}",
  "return out;",
].join('\n');

// shared LLM response text extractor (OpenAI chat-completions shape)
const LLM_EXTRACT = [
  "let raw = null;",
  "try { raw = $json.choices[0].message.content; } catch (e) {}",
  "let parsed = null;",
  "if (raw) {",
  "  const cleaned = String(raw).trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();",
  "  const m = cleaned.match(/\\{[\\s\\S]*\\}/);",
  "  if (m) { try { parsed = JSON.parse(m[0]); } catch (e) {} }",
  "}",
].join('\n');

CODE.parseScore = [
  "// STAGE 3 result -> route. status drives the Switch and is written to the sheet.",
  "const ctx = Object.assign({}, $('" + N.SCORE_PROMPT + "').item.json);",
  "delete ctx.llm_body;",
  "const cfg = $('" + N.CONFIG + "').first().json;",
  "const minScore = Number(cfg.MIN_SCORE) || 70;",
  LLM_EXTRACT,
  "let status, notes = '';",
  "if (!parsed || typeof parsed.match_score === 'undefined') {",
  "  status = 'score_error';",
  "  const errMsg = ($json.error && ($json.error.message || JSON.stringify($json.error))) || (raw ? ('unparseable: ' + String(raw).slice(0, 150)) : 'empty LLM response');",
  "  notes = 'LLM scoring failed: ' + String(errMsg).slice(0, 300);",
  "  ctx.match_score = ''; ctx.matched_track = ''; ctx.matched_keywords = ''; ctx.missing_keywords = '';",
  "  ctx.seniority_match = ''; ctx.geo_eligible = ''; ctx.geo_reason = '';",
  "} else {",
  "  const score = Math.max(0, Math.min(100, Number(parsed.match_score) || 0));",
  "  const geo = parsed.geo_eligible === true || String(parsed.geo_eligible).toLowerCase() === 'true';",
  "  ctx.match_score = score;",
  "  ctx.matched_track = String(parsed.matched_track || '');",
  "  ctx.matched_keywords = Array.isArray(parsed.matched_keywords) ? parsed.matched_keywords.join('; ') : String(parsed.matched_keywords || '');",
  "  ctx.missing_keywords = Array.isArray(parsed.missing_keywords) ? parsed.missing_keywords.join('; ') : String(parsed.missing_keywords || '');",
  "  ctx.seniority_match = String(parsed.seniority_match === true || String(parsed.seniority_match).toLowerCase() === 'true');",
  "  ctx.geo_eligible = String(geo);",
  "  ctx.geo_reason = String(parsed.geo_reason || '');",
  "  if (parsed.skip_reason) notes = String(parsed.skip_reason);",
  "  if (score >= minScore && geo) status = 'scored';",
  "  else if (score >= minScore) status = 'geo_blocked';",
  "  else status = 'low_match';",
  "}",
  "ctx.status = status;",
  "ctx.notes = notes;",
  "return { json: ctx };",
].join('\n');

CODE.extractDomain = [
  "// STAGE 4 prep: best-effort company domain. Job-board hosts do not count.",
  "// If no domain is found we still call Hunter with the company NAME (Hunter",
  "// resolves names to domains server-side).",
  "const BOARD_HOSTS = ['remoteok.com','remotive.com','remotive.io','arbeitnow.com','jobicy.com','himalayas.app','weworkremotely.com','greenhouse.io','lever.co','ashbyhq.com','workable.com','linkedin.com','indeed.com','bamboohr.com','smartrecruiters.com','recruitee.com','breezy.hr','jobvite.com','wellfound.com','myworkdayjobs.com','icims.com','notion.site','typeform.com','google.com','gem.com','rippling.com','dover.com'];",
  "const tryHost = function (u) {",
  "  try {",
  "    let host = new URL(String(u)).hostname.toLowerCase().replace(/^www\\./, '');",
  "    if (!host) return '';",
  "    if (BOARD_HOSTS.some(function (b) { return host === b || host.endsWith('.' + b); })) return '';",
  "    return host.replace(/^(jobs|careers|career|apply|hire|boards|job|work)\\./, '');",
  "  } catch (e) { return ''; }",
  "};",
  "const items = $input.all();",
  "const out = [];",
  "for (let i = 0; i < items.length; i++) {",
  "  let ctx = items[i].json;",
  "  try { ctx = Object.assign({}, $('" + N.PARSE_SCORE + "').itemMatching(i).json); } catch (e) { ctx = Object.assign({}, ctx); }",
  "  let domain = '';",
  "  if (ctx.company_website) domain = tryHost(ctx.company_website);",
  "  if (!domain) domain = tryHost(ctx.job_url);",
  "  ctx.company_domain = domain;",
  "  out.push({ json: ctx });",
  "}",
  "return out;",
].join('\n');

CODE.pickHunter = [
  "// Pick the best contact from Hunter domain-search. Preference: recruiting/HR",
  "// people > generic careers@/jobs@ > engineering leadership > highest confidence.",
  "const ctx = Object.assign({}, $('" + N.DOMAIN + "').item.json);",
  "const d = ($json && $json.data) || {};",
  "const emails = Array.isArray(d.emails) ? d.emails : [];",
  "if (d.domain && !ctx.company_domain) ctx.company_domain = String(d.domain);",
  "const rank = function (e) {",
  "  const pos = String(e.position || '').toLowerCase();",
  "  const val = String(e.value || '').toLowerCase();",
  "  if (/(recruit|talent|people ops|people operations|\\bhr\\b|human resources|hiring)/.test(pos)) return 400;",
  "  if (/(careers|jobs|talent|recruiting|hiring|hr)@/.test(val)) return 300;",
  "  if (/(engineering manager|head of engineering|vp (of )?engineering|cto|co-?founder|founder)/.test(pos)) return 200;",
  "  if (e.type === 'generic') return 50;",
  "  return 100;",
  "};",
  "let best = null, bestScore = -1;",
  "for (const e of emails) {",
  "  if (!e || !e.value) continue;",
  "  const s = rank(e) + (Number(e.confidence) || 0) / 100;",
  "  if (s > bestScore) { best = e; bestScore = s; }",
  "}",
  "ctx.recruiter_email = ''; ctx.recruiter_name = ''; ctx.email_confidence = ''; ctx.email_source = '';",
  "if (best) {",
  "  ctx.recruiter_email = String(best.value);",
  "  ctx.recruiter_name = [best.first_name, best.last_name].filter(Boolean).join(' ') || 'Hiring Team';",
  "  const c = Number(best.confidence) || 0;",
  "  ctx.email_confidence = c >= 70 ? 'high' : (c >= 40 ? 'medium' : 'low');",
  "  ctx.email_source = 'hunter';",
  "}",
  "return { json: ctx };",
].join('\n');

CODE.pickApollo = [
  "// Apollo fallback. Free plans often lock emails ('email_not_unlocked...') -",
  "// only accept a real address.",
  "const ctx = Object.assign({}, $('" + N.PICK_HUNTER + "').item.json);",
  "const people = ($json && ($json.people || $json.contacts)) || [];",
  "for (const p of people) {",
  "  const em = String((p && p.email) || '');",
  "  if (em && em.indexOf('@') !== -1 && !/not_unlocked|domain\\.com$/.test(em)) {",
  "    ctx.recruiter_email = em;",
  "    ctx.recruiter_name = String(p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Hiring Team');",
  "    ctx.email_confidence = 'medium';",
  "    ctx.email_source = 'apollo';",
  "    break;",
  "  }",
  "}",
  "return { json: ctx };",
].join('\n');

CODE.finalizeEmail = [
  "// STAGE 4 final routing. Pattern fallback (careers@domain) when finders fail",
  "// but we do know the company domain. No email at all -> manual_apply path.",
  "const j = Object.assign({}, $json);",
  "if (!j.recruiter_email && j.company_domain) {",
  "  j.recruiter_email = 'careers@' + j.company_domain;",
  "  j.recruiter_name = j.recruiter_name || 'Hiring Team';",
  "  j.email_confidence = 'medium';",
  "  j.email_source = 'pattern';",
  "}",
  "j.recruiter_name = j.recruiter_name || 'Hiring Team';",
  "j.email_found = !!j.recruiter_email;",
  "j.status = j.email_found ? 'enriched' : 'scored';",
  "return { json: j };",
].join('\n');

CODE.resumePrompt = [
  "// STAGE 5 prompt (verbatim from the master spec) + OpenAI request body.",
  llmBodySnippet(N.CONFIG),
  "const items = $input.all();",
  "const out = [];",
  "for (let i = 0; i < items.length; i++) {",
  "  let j = items[i].json;",
  "  try { j = Object.assign({}, $('" + N.FINALIZE + "').itemMatching(i).json); } catch (e) { j = Object.assign({}, j); }",
  "  const prompt = [",
  "    'You are a resume optimization assistant. Customize this candidate\\'s master resume for a specific job posting without fabricating anything.',",
  "    '',",
  "    'Master resume:',",
  "    String(cfg.MASTER_RESUME || ''),",
  "    '',",
  "    'Job description:',",
  "    'Title: ' + j.job_title + ' at ' + j.company,",
  "    String(j.description || '').slice(0, 6000),",
  "    '',",
  "    'Matched track: ' + (j.matched_track || 'DevOps'),",
  "    '',",
  "    'Emphasis by track:',",
  "    'Track 1 - DevOps/DevSecOps/Platform/SRE: Prioritize Kubernetes, CI/CD, Terraform, incident response, monitoring, container orchestration, deployment automation',",
  "    'Track 2 - Cloud / Cloud Security: Prioritize multi-cloud architecture, IAM, Security Hub, secrets management, network security, VNet/VPC, compliance, FinOps',",
  "    'Track 3 - AI / AI Automation / LLMOps: Prioritize AI/ML infrastructure, LLM API integrations, n8n workflows, agentic pipelines, Python, API orchestration, model deployment',",
  "    'Track 4 - DataOps / MLOps: Prioritize data pipeline infrastructure, MongoDB Atlas, cloud storage, ETL orchestration, observability for data systems, ML infra support',",
  "    '',",
  "    'Rules:',",
  "    'Mirror exact keywords from the job description',",
  "    'Reorder bullets to put most relevant experience first',",
  "    'Rewrite summary to match this specific role',",
  "    'Never fabricate or exaggerate any experience',",
  "    'Maximum 1 page',",
  "    'Use action verbs and quantified achievements',",
  "    '',",
  "    'Return ONLY this JSON with no markdown or explanation:',",
  "    '',",
  "    '{',",
  "    '  \"professional_summary\": \"3 line tailored summary\",',",
  "    '  \"experience\": [ { \"company\": \"Company Name\", \"role\": \"Job Title\", \"duration\": \"Month Year - Month Year\", \"bullets\": [\"bullet 1\", \"bullet 2\", \"bullet 3\"] } ],',",
  "    '  \"skills\": { \"cloud\": [], \"containers\": [], \"cicd\": [], \"iac\": [], \"monitoring\": [], \"security\": [], \"ai_automation\": [], \"scripting\": [], \"databases\": [] },',",
  "    '  \"certifications\": [],',",
  "    '  \"education\": \"Degree, University, Year\"',",
  "    '}',",
  "    '',",
  "    'Return JSON only. No markdown. No backticks.',",
  "  ].join('\\n');",
  "  j.llm_body = makeBody(prompt);",
  "  out.push({ json: j });",
  "}",
  "return out;",
].join('\n');

CODE.parseResume = [
  "// STAGE 5 result -> plain-text resume + filename. Falls back to the master",
  "// resume if the LLM output is unusable, so the pipeline never stalls here.",
  "const ctx = Object.assign({}, $('" + N.RESUME_PROMPT + "').item.json);",
  "delete ctx.llm_body;",
  "const cfg = $('" + N.CONFIG + "').first().json;",
  LLM_EXTRACT,
  "const name = String(cfg.CANDIDATE_NAME || 'Mahad Saleem');",
  "const contact = [cfg.CANDIDATE_EMAIL, cfg.CANDIDATE_LINKEDIN, 'Lahore, Pakistan', 'Remote (Worldwide) | Available immediately'].filter(Boolean).join(' | ');",
  "let resume_text = '';",
  "let note = '';",
  "if (parsed && parsed.professional_summary) {",
  "  const lines = [];",
  "  lines.push(name.toUpperCase());",
  "  lines.push('Senior ' + (ctx.matched_track || 'DevOps') + ' Engineer');",
  "  lines.push(contact);",
  "  lines.push('');",
  "  lines.push('SUMMARY');",
  "  lines.push(String(parsed.professional_summary));",
  "  lines.push('');",
  "  lines.push('EXPERIENCE');",
  "  for (const e of (parsed.experience || [])) {",
  "    if (!e) continue;",
  "    lines.push(String(e.role || '') + ' - ' + String(e.company || '') + ' (' + String(e.duration || '') + ')');",
  "    for (const b of (e.bullets || [])) lines.push('- ' + String(b));",
  "    lines.push('');",
  "  }",
  "  lines.push('SKILLS');",
  "  const cat = { cloud: 'Cloud', containers: 'Containers', cicd: 'CI/CD', iac: 'IaC', monitoring: 'Monitoring', security: 'Security', ai_automation: 'AI & Automation', scripting: 'Scripting', databases: 'Databases' };",
  "  const sk = parsed.skills || {};",
  "  for (const k of Object.keys(cat)) {",
  "    const v = sk[k];",
  "    if (Array.isArray(v) && v.length) lines.push(cat[k] + ': ' + v.join(', '));",
  "  }",
  "  if (Array.isArray(parsed.certifications) && parsed.certifications.length) {",
  "    lines.push('');",
  "    lines.push('CERTIFICATIONS');",
  "    for (const c of parsed.certifications) lines.push('- ' + String(c));",
  "  }",
  "  if (parsed.education) { lines.push(''); lines.push('EDUCATION'); lines.push(String(parsed.education)); }",
  "  resume_text = lines.join('\\n');",
  "} else {",
  "  resume_text = name.toUpperCase() + '\\n' + contact + '\\n\\n' + String(cfg.MASTER_RESUME || '');",
  "  note = 'LLM resume generation failed - sent master resume as-is. ';",
  "}",
  "const clean = function (s) { return String(s || '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40).replace(/^_+|_+$/g, ''); };",
  "const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');",
  "ctx.resume_text = resume_text;",
  "ctx.resume_filename = 'Mahad_Saleem_' + clean(ctx.company) + '_' + clean(ctx.job_title) + '_' + ymd + '.pdf';",
  "ctx.resume_note = note;",
  "return { json: ctx };",
].join('\n');

CODE.emailPrompt = [
  "// STAGE 6 prompt (verbatim from the master spec) + OpenAI request body.",
  llmBodySnippet(N.CONFIG),
  "const j = Object.assign({}, $('" + N.FINALIZE + "').item.json);",
  "j.resume_filename = $('" + N.PARSE_RESUME + "').item.json.resume_filename;",
  "j.resume_note = $('" + N.PARSE_RESUME + "').item.json.resume_note || '';",
  "const prompt = [",
  "  'Write a cold application email from Mahad Saleem, a Senior DevOps/Cloud/AI Engineer based in Pakistan, applying for ' + j.job_title + ' at ' + j.company + '.',",
  "  '',",
  "  'Recruiter name: ' + (j.recruiter_name || 'Hiring Team'),",
  "  'Role track: ' + (j.matched_track || 'DevOps'),",
  "  'Pick ONE specific detail about this company or role from the job description below - a specific stack, product, infrastructure detail, or engineering challenge they mention:',",
  "  String(j.description || '').slice(0, 4000),",
  "  '',",
  "  'Quantified achievements to choose ONE from: migrated 5 applications from GitHub to Azure DevOps; reduced deployment time by 60% through pipeline optimization; resolved critical production swap incidents via container memory management; built AWS Secrets Manager rotation alerting with Slack notifications; managed multi-cloud infrastructure across 4+ concurrent production environments; built end-to-end AI automation workflows using n8n and LLM APIs.',",
  "  '',",
  "  'Rules:',",
  "  'Maximum 6 lines of body text',",
  "  'Tone: confident, direct, peer-to-peer - not desperate, not salesy',",
  "  'Do NOT use: \"I hope this email finds you well\", \"I am writing to apply\", \"I am passionate about\", \"I would love to\", \"Please find attached\", \"I came across your posting\", \"I am excited to\"',",
  "  'DO include: one specific observation about their stack or engineering challenge; one quantified achievement relevant to the matched track; a soft CTA - opening a door, not begging for a job',",
  "  'End the body with: \"Resume attached.\"',",
  "  'Subject: maximum 8 words, direct, no fluff',",
  "  'After \"Resume attached.\" end with this exact signature on new lines: ' + cfg.CANDIDATE_NAME + ' | ' + cfg.CANDIDATE_EMAIL + ' | ' + cfg.CANDIDATE_LINKEDIN,",
  "  '',",
  "  'Return ONLY this JSON with no markdown or explanation:',",
  "  '{ \"subject\": \"subject line here\", \"body\": \"full email body here\" }',",
  "  'Return JSON only. No markdown. No backticks.',",
  "].join('\\n');",
  "j.llm_body = makeBody(prompt);",
  "return { json: j };",
].join('\n');

CODE.parseEmail = [
  "// STAGE 6 result. Deterministic fallback template if the LLM output is unusable.",
  "const ctx = Object.assign({}, $('" + N.EMAIL_PROMPT + "').item.json);",
  "delete ctx.llm_body;",
  "const cfg = $('" + N.CONFIG + "').first().json;",
  LLM_EXTRACT,
  "if (parsed && parsed.subject && parsed.body) {",
  "  ctx.email_subject = String(parsed.subject).slice(0, 150);",
  "  ctx.email_body = String(parsed.body);",
  "  ctx.email_note = '';",
  "} else {",
  "  ctx.email_subject = 'Senior ' + (ctx.matched_track || 'DevOps') + ' Engineer - available immediately';",
  "  ctx.email_body = 'Hi ' + (ctx.recruiter_name || 'Hiring Team') + ',\\n\\n'",
  "    + 'Saw the ' + ctx.job_title + ' opening at ' + ctx.company + '. I run multi-cloud infrastructure (AWS/Azure/GCP, Kubernetes, Terraform) and cut deployment time by 60% in my current role through CI/CD pipeline optimization.\\n\\n'",
  "    + 'If the team is still looking, happy to walk through how I would approach your stack.\\n\\n'",
  "    + 'Resume attached.\\n\\n'",
  "    + cfg.CANDIDATE_NAME + ' | ' + cfg.CANDIDATE_EMAIL + ' | ' + cfg.CANDIDATE_LINKEDIN;",
  "  ctx.email_note = 'LLM email generation failed - used fallback template. ';",
  "}",
  "return { json: ctx };",
].join('\n');

CODE.setFilename = [
  "// Rename the exported PDF binary and restore the job context for Gmail.",
  "const meta = $('" + N.PARSE_EMAIL + "').item.json;",
  "const binary = $input.item.binary || {};",
  "if (binary.data) {",
  "  binary.data.fileName = String(meta.resume_filename || 'Mahad_Saleem_Resume.pdf');",
  "  binary.data.mimeType = 'application/pdf';",
  "}",
  "return { json: meta, binary: binary };",
].join('\n');

CODE.selectDue = [
  "// STAGE 8 selector. Reads every sheet row + recent inbox, then decides per row:",
  "//   replied  -> recruiter answered since we applied / followed up",
  "//   followup -> applied >= 5 business days ago, no reply, no follow-up yet",
  "//   close    -> followed up >= 3 days ago, still no reply",
  "const rows = $('" + N.READ_ALL + "').all().map(function (i) { return i.json; }).filter(function (r) { return r && r.job_id; });",
  "const inbox = $input.all().map(function (i) { return i.json; }).filter(function (m) { return m && typeof m === 'object'; });",
  "",
  "const senderOf = function (m) {",
  "  let from = m.From || m.from || '';",
  "  if (!from && m.payload && Array.isArray(m.payload.headers)) {",
  "    const h = m.payload.headers.find(function (x) { return x && /^from$/i.test(String(x.name)); });",
  "    from = h ? h.value : '';",
  "  }",
  "  if (from && typeof from === 'object') { from = (from.value && from.value[0] && from.value[0].address) || from.text || ''; }",
  "  const m2 = String(from).match(/<([^>]+)>/);",
  "  return (m2 ? m2[1] : String(from).trim()).toLowerCase();",
  "};",
  "const dateOf = function (m) {",
  "  const v = Number(m.internalDate) || Date.parse(m.date || m.Date || '') || 0;",
  "  return v || Date.now();",
  "};",
  "const msgs = inbox.map(function (m) { return { sender: senderOf(m), ts: dateOf(m) }; }).filter(function (x) { return x.sender.indexOf('@') !== -1; });",
  "",
  "const isTrue = function (v) { return v === true || String(v).toLowerCase() === 'true'; };",
  "const businessDaysSince = function (iso) {",
  "  const t = Date.parse(iso); if (isNaN(t)) return 0;",
  "  let d = new Date(t), count = 0;",
  "  const now = new Date();",
  "  while (d < now) {",
  "    d = new Date(d.getTime() + 86400000);",
  "    if (d > now) break;",
  "    const day = d.getDay();",
  "    if (day !== 0 && day !== 6) count++;",
  "  }",
  "  return count;",
  "};",
  "const daysSince = function (iso) { const t = Date.parse(iso); return isNaN(t) ? 0 : (Date.now() - t) / 86400000; };",
  "",
  "const out = [];",
  "for (const r of rows) {",
  "  const status = String(r.status || '').toLowerCase();",
  "  const email = String(r.recruiter_email || '').toLowerCase();",
  "  if (!email) continue;",
  "  const repliedAfter = function (sinceIso) {",
  "    const since = Date.parse(sinceIso) || 0;",
  "    return msgs.some(function (m) { return m.sender === email && m.ts > since; });",
  "  };",
  "  if (status === 'applied' && !isTrue(r.followup_sent)) {",
  "    if (repliedAfter(r.applied_at)) out.push({ json: Object.assign({}, r, { action: 'replied' }) });",
  "    else if (businessDaysSince(r.applied_at) >= 5) out.push({ json: Object.assign({}, r, { action: 'followup' }) });",
  "  } else if (status === 'followed_up') {",
  "    if (repliedAfter(r.followup_date || r.applied_at)) out.push({ json: Object.assign({}, r, { action: 'replied' }) });",
  "    else if (daysSince(r.followup_date) >= 3) out.push({ json: Object.assign({}, r, { action: 'close' }) });",
  "  }",
  "}",
  "return out;",
].join('\n');

CODE.fuPrompt = [
  "// STAGE 8 prompt (verbatim from the master spec) + OpenAI request body.",
  llmBodySnippet(N.CONFIG_FU),
  "const items = $input.all();",
  "const out = [];",
  "for (let i = 0; i < items.length; i++) {",
  "  const j = Object.assign({}, items[i].json);",
  "  const prompt = [",
  "    'Write a 2-line follow-up email from Mahad Saleem following up on his application for ' + j.job_title + ' at ' + j.company + ' sent on ' + String(j.applied_at || '').slice(0, 10) + '.',",
  "    '',",
  "    'Rules:',",
  "    'Maximum 2 lines',",
  "    'Light tone - just circling back, zero desperation',",
  "    'Do not re-explain the application',",
  "    'Do not re-attach resume',",
  "    'End with this exact signature on a new line: ' + cfg.CANDIDATE_NAME + ' | ' + cfg.CANDIDATE_EMAIL + ' | ' + cfg.CANDIDATE_LINKEDIN,",
  "    '',",
  "    'Return ONLY this JSON:',",
  "    '{ \"subject\": \"subject here\", \"body\": \"2 line body here\" }',",
  "    'Return JSON only. No markdown. No backticks.',",
  "  ].join('\\n');",
  "  j.llm_body = makeBody(prompt);",
  "  out.push({ json: j });",
  "}",
  "return out;",
].join('\n');

CODE.parseFU = [
  "const ctx = Object.assign({}, $('" + N.FU_PROMPT + "').item.json);",
  "delete ctx.llm_body;",
  "const cfg = $('" + N.CONFIG_FU + "').first().json;",
  LLM_EXTRACT,
  "if (parsed && parsed.subject && parsed.body) {",
  "  ctx.fu_subject = String(parsed.subject).slice(0, 150);",
  "  ctx.fu_body = String(parsed.body);",
  "} else {",
  "  ctx.fu_subject = 'Re: ' + String(ctx.email_subject || (ctx.job_title + ' application'));",
  "  ctx.fu_body = 'Hi ' + (ctx.recruiter_name || 'Hiring Team') + ', just circling back on my application for ' + ctx.job_title + ' - happy to chat if the role is still open.\\n\\n' + cfg.CANDIDATE_NAME + ' | ' + cfg.CANDIDATE_EMAIL + ' | ' + cfg.CANDIDATE_LINKEDIN;",
  "}",
  "return { json: ctx };",
].join('\n');

// ---------------------------------------------------------------------------
// Workflow assembly helpers
// ---------------------------------------------------------------------------
const nodes = [];
const connections = {};
let idCounter = 0;

function uid() {
  idCounter += 1;
  return '0a0b0c0d-0000-4000-8000-' + String(idCounter).padStart(12, '0');
}

function addNode(name, type, typeVersion, position, parameters, extra) {
  const node = Object.assign({ parameters, id: uid(), name, type, typeVersion, position }, extra || {});
  nodes.push(node);
  return node;
}

function connect(from, to, fromOutput, toInput) {
  fromOutput = fromOutput || 0;
  toInput = toInput || 0;
  if (!connections[from]) connections[from] = { main: [] };
  while (connections[from].main.length <= fromOutput) connections[from].main.push([]);
  connections[from].main[fromOutput].push({ node: to, type: 'main', index: toInput });
}

function setAssignments(fields) {
  return {
    assignments: { assignments: fields.map(function (f, i) { return { id: 'as-' + (i + 1), name: f[0], value: f[1], type: 'string' }; }) },
    includeOtherFields: false,
    options: {},
  };
}

function rlSheet(configNode) {
  return {
    documentId: { __rl: true, value: "={{ $('" + configNode + "').first().json.SHEET_ID }}", mode: 'id' },
    sheetName: { __rl: true, value: "={{ $('" + configNode + "').first().json.SHEET_TAB }}", mode: 'name' },
  };
}

function sheetsAppendOrUpdate(configNode, valueMap) {
  return Object.assign({ resource: 'sheet', operation: 'appendOrUpdate' }, rlSheet(configNode), {
    columns: { mappingMode: 'defineBelow', value: valueMap, matchingColumns: ['job_id'], schema: [] },
    options: {},
  });
}

function ifCondition(cond) {
  return {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [cond],
      combinator: 'and',
    },
    options: {},
  };
}

function switchOn(expr, values) {
  return {
    rules: {
      values: values.map(function (v, i) {
        return {
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
            conditions: [{ id: 'sw-' + (i + 1), leftValue: expr, rightValue: v, operator: { type: 'string', operation: 'equals' } }],
            combinator: 'and',
          },
          renameOutput: true,
          outputKey: v,
        };
      }),
    },
    options: {},
  };
}

function llmHttpNode(configNode) {
  return {
    method: 'POST',
    url: "={{ $('" + configNode + "').first().json.LLM_API_BASE }}",
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Authorization', value: "={{ 'Bearer ' + $('" + configNode + "').first().json.LLM_API_KEY }}" },
      ],
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ $json.llm_body }}',
    options: { timeout: 120000, batching: { batch: { batchSize: 1, batchInterval: 6000 } } },
  };
}

const CONTINUE = { onError: 'continueRegularOutput' };
const GS_CRED = { googleSheetsOAuth2Api: { id: 'REPLACE-SHEETS', name: 'Google Sheets account' } };
const GMAIL_CRED = { gmailOAuth2: { id: 'REPLACE-GMAIL', name: 'Gmail account' } };
const DRIVE_CRED = { googleDriveOAuth2Api: { id: 'REPLACE-DRIVE', name: 'Google Drive account' } };
const TG_CRED = { telegramApi: { id: 'REPLACE-TELEGRAM', name: 'Telegram Bot' } };

const MASTER_RESUME = [
  'MAHAD SALEEM',
  'Senior DevOps / Cloud / AI Infrastructure Engineer',
  'Lahore, Pakistan | Available immediately | Remote only (Contract or Full-time) | Regions: US, EMEA, MENA, APAC, Worldwide',
  '',
  'SUMMARY',
  'Senior engineer with 5+ years building and securing multi-cloud infrastructure (AWS, Azure, GCP). Deep hands-on work across Kubernetes, Terraform, CI/CD, DevSecOps and AI/LLM automation. Managed 4+ concurrent production environments and cut deployment time by 60% through pipeline optimization.',
  '',
  'EXPERIENCE',
  'Senior DevOps Engineer - NETSOL Technologies, Lahore (20XX - Present)  <-- FIX DATES',
  '- Migrated 5 applications from GitHub to Azure DevOps with zero downtime',
  '- Reduced deployment time by 60% through CI/CD pipeline optimization',
  '- Resolved critical production swap incidents via container memory management',
  '- Built AWS Secrets Manager rotation alerting with Slack notifications',
  '- Managed multi-cloud infrastructure across 4+ concurrent production environments (AWS, Azure, GCP)',
  '- Built end-to-end AI automation workflows using n8n and LLM APIs (OpenAI, Anthropic)',
  '',
  '[EARLIER ROLE - COMPANY, TITLE, DATES - FILL ME IN OR DELETE]',
  '- [achievement bullet]',
  '',
  'SKILLS',
  'Cloud: AWS, Azure, GCP | Containers: Docker, Kubernetes (on-prem + managed)',
  'IaC: Terraform, Ansible | CI/CD: GitHub Actions, Azure DevOps, Jenkins',
  'Monitoring: Grafana, Prometheus, Datadog | Security: DevSecOps, IAM, Secrets Management, Security Hub',
  'Web/Proxy: Nginx, Application Gateway | Scripting: Bash, Python',
  'Databases: MongoDB Atlas, PostgreSQL | AI/Automation: n8n, LLM APIs (OpenAI, Anthropic), Agentic Workflows, API Orchestration',
  'Other: FinOps, Multi-cloud Architecture, Network Security',
  '',
  'CERTIFICATIONS',
  '[FILL IN OR DELETE]',
  '',
  'EDUCATION',
  '[Degree, University, Year - FILL ME IN]',
].join('\n');

const CONFIG_FIELDS = [
  ['LLM_API_BASE', 'https://api.openai.com/v1/chat/completions'],
  ['LLM_MODEL', 'gpt-4o-mini'],
  ['LLM_API_KEY', 'PASTE_OPENAI_KEY_FROM_platform.openai.com/api-keys'],
  ['HUNTER_API_KEY', 'PASTE_HUNTER_KEY_FROM_hunter.io (free: 25 searches/mo)'],
  ['APOLLO_API_KEY', ''],
  ['SHEET_ID', 'PASTE_GOOGLE_SHEET_ID_FROM_URL'],
  ['SHEET_TAB', 'applications'],
  ['DRIVE_FOLDER_ID', ''],
  ['TELEGRAM_CHAT_ID', 'PASTE_TELEGRAM_CHAT_ID'],
  ['SEND_EMAILS', 'false'],
  ['MIN_SCORE', '70'],
  ['LOOKBACK_HOURS', '48'],
  ['MAX_JOBS_PER_RUN', '10'],
  ['CANDIDATE_NAME', 'Mahad Saleem'],
  ['CANDIDATE_EMAIL', 'PASTE_YOUR_EMAIL@gmail.com'],
  ['CANDIDATE_LINKEDIN', 'https://www.linkedin.com/in/PASTE_YOUR_HANDLE'],
  ['MASTER_RESUME', MASTER_RESUME],
];

// Follow-up branch only needs a subset (keep both Config nodes in sync!)
const CONFIG_FU_FIELDS = CONFIG_FIELDS.filter(function (f) {
  return ['LLM_API_BASE', 'LLM_MODEL', 'LLM_API_KEY', 'SHEET_ID', 'SHEET_TAB', 'TELEGRAM_CHAT_ID', 'SEND_EMAILS', 'CANDIDATE_NAME', 'CANDIDATE_EMAIL', 'CANDIDATE_LINKEDIN'].indexOf(f[0]) !== -1;
});

// ---------------------------------------------------------------------------
// MAIN FLOW NODES
// ---------------------------------------------------------------------------
addNode(N.TRIG12, 'n8n-nodes-base.scheduleTrigger', 1.2, [-1660, 260], { rule: { interval: [{ field: 'hours', hoursInterval: 12 }] } });
addNode(N.TRIG_MANUAL, 'n8n-nodes-base.manualTrigger', 1, [-1660, 460], {});
addNode(N.CONFIG, 'n8n-nodes-base.set', 3.4, [-1440, 360], setAssignments(CONFIG_FIELDS));

addNode(N.F_REMOTEOK, 'n8n-nodes-base.httpRequest', 4.2, [-1200, -140], {
  method: 'GET', url: 'https://remoteok.com/api',
  sendHeaders: true,
  headerParameters: { parameters: [{ name: 'User-Agent', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) JobAgent/1.0' }] },
  options: { timeout: 30000 },
}, CONTINUE);
addNode(N.F_REMOTIVE, 'n8n-nodes-base.httpRequest', 4.2, [-1200, 60], { method: 'GET', url: 'https://remotive.com/api/remote-jobs?category=software-dev&limit=100', options: { timeout: 30000 } }, CONTINUE);
addNode(N.F_ARBEITNOW, 'n8n-nodes-base.httpRequest', 4.2, [-1200, 260], { method: 'GET', url: 'https://www.arbeitnow.com/api/job-board-api', options: { timeout: 30000 } }, CONTINUE);
addNode(N.F_JOBICY, 'n8n-nodes-base.httpRequest', 4.2, [-1200, 460], { method: 'GET', url: 'https://jobicy.com/api/v2/remote-jobs?count=50&tag=devops', options: { timeout: 30000 } }, CONTINUE);
addNode(N.F_HIMALAYAS, 'n8n-nodes-base.httpRequest', 4.2, [-1200, 660], { method: 'GET', url: 'https://himalayas.app/jobs/api?limit=100', options: { timeout: 30000 } }, CONTINUE);
addNode(N.F_WWR, 'n8n-nodes-base.rssFeedRead', 1.1, [-1200, 860], { url: 'https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss', options: {} }, CONTINUE);

addNode(N.N_REMOTEOK, 'n8n-nodes-base.code', 2, [-980, -140], { jsCode: CODE.normalizeRemoteOK });
addNode(N.N_REMOTIVE, 'n8n-nodes-base.code', 2, [-980, 60], { jsCode: CODE.normalizeRemotive });
addNode(N.N_ARBEITNOW, 'n8n-nodes-base.code', 2, [-980, 260], { jsCode: CODE.normalizeArbeitnow });
addNode(N.N_JOBICY, 'n8n-nodes-base.code', 2, [-980, 460], { jsCode: CODE.normalizeJobicy });
addNode(N.N_HIMALAYAS, 'n8n-nodes-base.code', 2, [-980, 660], { jsCode: CODE.normalizeHimalayas });
addNode(N.N_WWR, 'n8n-nodes-base.code', 2, [-980, 860], { jsCode: CODE.normalizeWWR });

addNode(N.MERGE, 'n8n-nodes-base.merge', 3, [-740, 360], { mode: 'append', numberInputs: 6 });
addNode(N.FILTERS, 'n8n-nodes-base.code', 2, [-520, 360], { jsCode: CODE.hardFilters });
addNode(N.READ_LOG, 'n8n-nodes-base.googleSheets', 4.5, [-300, 360], Object.assign({ resource: 'sheet', operation: 'read' }, rlSheet(N.CONFIG), { options: {} }), Object.assign({ alwaysOutputData: true, credentials: GS_CRED }));
addNode(N.FILTER_NEW, 'n8n-nodes-base.code', 2, [-80, 360], { jsCode: CODE.filterNew });

addNode(N.LOG_NEW, 'n8n-nodes-base.googleSheets', 4.5, [140, 360], Object.assign({ resource: 'sheet', operation: 'append' }, rlSheet(N.CONFIG), {
  columns: {
    mappingMode: 'defineBelow',
    value: {
      job_id: '={{ $json.job_id }}',
      job_title: '={{ $json.job_title }}',
      company: '={{ $json.company }}',
      source: '={{ $json.source }}',
      job_url: '={{ $json.job_url }}',
      posted_date: '={{ $json.posted_date }}',
      scraped_at: '={{ $json.scraped_at }}',
      status: 'new',
    },
    matchingColumns: [],
    schema: [],
  },
  options: {},
}), { credentials: GS_CRED });

addNode(N.SCORE_PROMPT, 'n8n-nodes-base.code', 2, [360, 360], { jsCode: CODE.scorePrompt });
addNode(N.LLM_SCORE, 'n8n-nodes-base.httpRequest', 4.2, [580, 360], llmHttpNode(N.CONFIG), CONTINUE);
addNode(N.PARSE_SCORE, 'n8n-nodes-base.code', 2, [800, 360], { mode: 'runOnceForEachItem', jsCode: CODE.parseScore });

addNode(N.SAVE_SCORE, 'n8n-nodes-base.googleSheets', 4.5, [1020, 360], sheetsAppendOrUpdate(N.CONFIG, {
  job_id: '={{ $json.job_id }}',
  match_score: '={{ $json.match_score }}',
  matched_track: '={{ $json.matched_track }}',
  matched_keywords: '={{ $json.matched_keywords }}',
  missing_keywords: '={{ $json.missing_keywords }}',
  seniority_match: '={{ $json.seniority_match }}',
  geo_eligible: '={{ $json.geo_eligible }}',
  geo_reason: '={{ $json.geo_reason }}',
  status: '={{ $json.status }}',
  notes: '={{ $json.notes }}',
}), { credentials: GS_CRED });

// Reads status via the paired-item chain from Parse Score so routing never
// depends on what shape the Sheets node returns.
addNode(N.ROUTE, 'n8n-nodes-base.switch', 3.2, [1240, 360], switchOn("={{ $('" + N.PARSE_SCORE + "').item.json.status }}", ['scored', 'geo_blocked', 'low_match', 'score_error']));

addNode(N.TG_GEO, 'n8n-nodes-base.telegram', 1.2, [1480, 560], {
  resource: 'message', operation: 'sendMessage',
  chatId: "={{ $('" + N.CONFIG + "').first().json.TELEGRAM_CHAT_ID }}",
  text: "=🚫 Skipped {{ $('" + N.PARSE_SCORE + "').item.json.company }} — {{ $('" + N.PARSE_SCORE + "').item.json.geo_reason }}",
  additionalFields: {},
}, Object.assign({ credentials: TG_CRED }, CONTINUE));
addNode(N.TG_LOW, 'n8n-nodes-base.telegram', 1.2, [1480, 720], {
  resource: 'message', operation: 'sendMessage',
  chatId: "={{ $('" + N.CONFIG + "').first().json.TELEGRAM_CHAT_ID }}",
  text: "=📊 Skipped {{ $('" + N.PARSE_SCORE + "').item.json.company }} — score {{ $('" + N.PARSE_SCORE + "').item.json.match_score }}/100",
  additionalFields: {},
}, Object.assign({ credentials: TG_CRED }, CONTINUE));
addNode(N.TG_ERR, 'n8n-nodes-base.telegram', 1.2, [1480, 880], {
  resource: 'message', operation: 'sendMessage',
  chatId: "={{ $('" + N.CONFIG + "').first().json.TELEGRAM_CHAT_ID }}",
  text: "=⚠️ Scoring failed for {{ $('" + N.PARSE_SCORE + "').item.json.company }} — {{ $('" + N.PARSE_SCORE + "').item.json.notes }}",
  additionalFields: {},
}, Object.assign({ credentials: TG_CRED }, CONTINUE));

// ---- apply branch: enrichment ----
addNode(N.DOMAIN, 'n8n-nodes-base.code', 2, [1480, 160], { jsCode: CODE.extractDomain });
addNode(N.HUNTER, 'n8n-nodes-base.httpRequest', 4.2, [1700, 160], {
  method: 'GET',
  url: "=https://api.hunter.io/v2/domain-search?{{ $json.company_domain ? 'domain=' + encodeURIComponent($json.company_domain) : 'company=' + encodeURIComponent($json.company) }}&api_key={{ $('" + N.CONFIG + "').first().json.HUNTER_API_KEY }}&limit=10",
  options: { timeout: 30000, batching: { batch: { batchSize: 1, batchInterval: 1500 } } },
}, CONTINUE);
addNode(N.PICK_HUNTER, 'n8n-nodes-base.code', 2, [1920, 160], { mode: 'runOnceForEachItem', jsCode: CODE.pickHunter });
addNode(N.IF_HUNTER, 'n8n-nodes-base.if', 2.2, [2140, 160], ifCondition({ id: 'c-hunter', leftValue: '={{ $json.recruiter_email }}', rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }));
addNode(N.APOLLO, 'n8n-nodes-base.httpRequest', 4.2, [2360, 300], {
  method: 'POST',
  url: 'https://api.apollo.io/api/v1/mixed_people/search',
  sendHeaders: true,
  headerParameters: {
    parameters: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'X-Api-Key', value: "={{ $('" + N.CONFIG + "').first().json.APOLLO_API_KEY }}" },
    ],
  },
  sendBody: true,
  specifyBody: 'json',
  jsonBody: "={{ JSON.stringify({ q_organization_domains: $json.company_domain || undefined, q_organization_name: $json.company, person_titles: ['Technical Recruiter','Recruiter','Talent Acquisition Specialist','Head of Talent','HR Manager','Engineering Manager','Head of Engineering','CTO'], page: 1, per_page: 5 }) }}",
  options: { timeout: 30000, batching: { batch: { batchSize: 1, batchInterval: 1500 } } },
}, CONTINUE);
addNode(N.PICK_APOLLO, 'n8n-nodes-base.code', 2, [2580, 300], { mode: 'runOnceForEachItem', jsCode: CODE.pickApollo });
addNode(N.FINALIZE, 'n8n-nodes-base.code', 2, [2800, 160], { mode: 'runOnceForEachItem', jsCode: CODE.finalizeEmail });

addNode(N.SAVE_ENRICH, 'n8n-nodes-base.googleSheets', 4.5, [3020, 160], sheetsAppendOrUpdate(N.CONFIG, {
  job_id: '={{ $json.job_id }}',
  recruiter_name: '={{ $json.recruiter_name }}',
  recruiter_email: '={{ $json.recruiter_email }}',
  email_confidence: '={{ $json.email_confidence }}',
  email_source: '={{ $json.email_source }}',
  status: '={{ $json.status }}',
}), { credentials: GS_CRED });

// ---- resume ----
addNode(N.RESUME_PROMPT, 'n8n-nodes-base.code', 2, [3240, 160], { jsCode: CODE.resumePrompt });
addNode(N.LLM_RESUME, 'n8n-nodes-base.httpRequest', 4.2, [3460, 160], llmHttpNode(N.CONFIG), CONTINUE);
addNode(N.PARSE_RESUME, 'n8n-nodes-base.code', 2, [3680, 160], { mode: 'runOnceForEachItem', jsCode: CODE.parseResume });
// Native Google Drive node: creates a Google Doc straight from the resume text,
// in the target folder, in one step (replaces the old create+insert+move HTTP trio).
// Only the Google Drive credential is needed for the whole resume section now.
addNode(N.DOC_CREATE, 'n8n-nodes-base.googleDrive', 3, [3900, 160], {
  resource: 'file',
  operation: 'createFromText',
  content: '={{ $json.resume_text }}',
  name: "={{ String($json.resume_filename).replace('.pdf', '') }}",
  driveId: { __rl: true, mode: 'list', value: 'My Drive', cachedResultName: 'My Drive' },
  folderId: { __rl: true, mode: 'id', value: "={{ $('" + N.CONFIG + "').first().json.DRIVE_FOLDER_ID || 'root' }}" },
  options: { convertToGoogleDocument: true },
}, { credentials: DRIVE_CRED });
addNode(N.SAVE_RESUME, 'n8n-nodes-base.googleSheets', 4.5, [4340, 160], sheetsAppendOrUpdate(N.CONFIG, {
  job_id: "={{ $('" + N.PARSE_RESUME + "').item.json.job_id }}",
  resume_filename: "={{ $('" + N.PARSE_RESUME + "').item.json.resume_filename }}",
  resume_drive_link: "={{ $('" + N.DOC_CREATE + "').item.json.webViewLink || ('https://docs.google.com/document/d/' + $('" + N.DOC_CREATE + "').item.json.id + '/edit') }}",
}), { credentials: GS_CRED });

// ---- cold email / manual split ----
addNode(N.IF_EMAIL, 'n8n-nodes-base.if', 2.2, [4780, 160], ifCondition({ id: 'c-email', leftValue: "={{ $('" + N.FINALIZE + "').item.json.email_found }}", rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }));
addNode(N.EMAIL_PROMPT, 'n8n-nodes-base.code', 2, [5000, 40], { mode: 'runOnceForEachItem', jsCode: CODE.emailPrompt });
addNode(N.LLM_EMAIL, 'n8n-nodes-base.httpRequest', 4.2, [5220, 40], llmHttpNode(N.CONFIG), CONTINUE);
addNode(N.PARSE_EMAIL, 'n8n-nodes-base.code', 2, [5440, 40], { mode: 'runOnceForEachItem', jsCode: CODE.parseEmail });
addNode(N.IF_SEND, 'n8n-nodes-base.if', 2.2, [5660, 40], ifCondition({ id: 'c-send', leftValue: "={{ $('" + N.CONFIG + "').first().json.SEND_EMAILS }}", rightValue: 'true', operator: { type: 'string', operation: 'equals' } }));

// Native Google Drive node: exports the Google Doc as a PDF binary (property "data").
addNode(N.EXPORT_PDF, 'n8n-nodes-base.googleDrive', 3, [5880, -60], {
  resource: 'file',
  operation: 'download',
  fileId: { __rl: true, mode: 'id', value: "={{ $('" + N.DOC_CREATE + "').item.json.id }}" },
  options: {
    binaryPropertyName: 'data',
    googleFileConversion: { conversion: { docsToFormat: 'application/pdf' } },
  },
}, { credentials: DRIVE_CRED });
addNode(N.SET_FILENAME, 'n8n-nodes-base.code', 2, [6100, -60], { mode: 'runOnceForEachItem', jsCode: CODE.setFilename });
addNode(N.GMAIL_SEND, 'n8n-nodes-base.gmail', 2.1, [6320, -60], {
  resource: 'message', operation: 'send',
  sendTo: '={{ $json.recruiter_email }}',
  subject: '={{ $json.email_subject }}',
  emailType: 'text',
  message: '={{ $json.email_body }}',
  options: { appendAttribution: false, attachmentsUi: { attachmentsBinary: [{ property: 'data' }] } },
}, { credentials: GMAIL_CRED });
addNode(N.MARK_APPLIED, 'n8n-nodes-base.googleSheets', 4.5, [6540, -60], sheetsAppendOrUpdate(N.CONFIG, {
  job_id: "={{ $('" + N.PARSE_EMAIL + "').item.json.job_id }}",
  status: 'applied',
  applied_at: '={{ $now.toISO() }}',
  email_subject: "={{ $('" + N.PARSE_EMAIL + "').item.json.email_subject }}",
  notes: "={{ ($('" + N.PARSE_EMAIL + "').item.json.resume_note || '') + ($('" + N.PARSE_EMAIL + "').item.json.email_note || '') }}",
}), { credentials: GS_CRED });
addNode(N.TG_APPLIED, 'n8n-nodes-base.telegram', 1.2, [6760, -60], {
  resource: 'message', operation: 'sendMessage',
  chatId: "={{ $('" + N.CONFIG + "').first().json.TELEGRAM_CHAT_ID }}",
  text: "=✅ Applied to {{ $('" + N.PARSE_EMAIL + "').item.json.job_title }} ({{ $('" + N.PARSE_EMAIL + "').item.json.matched_track }}) at {{ $('" + N.PARSE_EMAIL + "').item.json.company }}",
  additionalFields: {},
}, Object.assign({ credentials: TG_CRED }, CONTINUE));

addNode(N.MARK_DRY, 'n8n-nodes-base.googleSheets', 4.5, [5880, 140], sheetsAppendOrUpdate(N.CONFIG, {
  job_id: "={{ $('" + N.PARSE_EMAIL + "').item.json.job_id }}",
  status: 'dry_run',
  email_subject: "={{ $('" + N.PARSE_EMAIL + "').item.json.email_subject }}",
  notes: "={{ 'TEST MODE: email NOT sent (SEND_EMAILS=false). ' + ($('" + N.PARSE_EMAIL + "').item.json.resume_note || '') + ($('" + N.PARSE_EMAIL + "').item.json.email_note || '') }}",
}), { credentials: GS_CRED });
addNode(N.TG_DRY, 'n8n-nodes-base.telegram', 1.2, [6100, 140], {
  resource: 'message', operation: 'sendMessage',
  chatId: "={{ $('" + N.CONFIG + "').first().json.TELEGRAM_CHAT_ID }}",
  text: "=🧪 DRY RUN — would apply to {{ $('" + N.PARSE_EMAIL + "').item.json.job_title }} at {{ $('" + N.PARSE_EMAIL + "').item.json.company }} ({{ $('" + N.PARSE_EMAIL + "').item.json.recruiter_email }})\nSubject: {{ $('" + N.PARSE_EMAIL + "').item.json.email_subject }}",
  additionalFields: {},
}, Object.assign({ credentials: TG_CRED }, CONTINUE));

addNode(N.MARK_MANUAL, 'n8n-nodes-base.googleSheets', 4.5, [5000, 320], sheetsAppendOrUpdate(N.CONFIG, {
  job_id: "={{ $('" + N.FINALIZE + "').item.json.job_id }}",
  status: 'manual_apply',
  notes: 'No recruiter email found - resume is ready, apply manually via job_url',
}), { credentials: GS_CRED });
addNode(N.TG_MANUAL, 'n8n-nodes-base.telegram', 1.2, [5220, 320], {
  resource: 'message', operation: 'sendMessage',
  chatId: "={{ $('" + N.CONFIG + "').first().json.TELEGRAM_CHAT_ID }}",
  text: "=⚠️ Resume ready ({{ $('" + N.FINALIZE + "').item.json.matched_track }}) — apply manually: {{ $('" + N.FINALIZE + "').item.json.job_url }}\nResume: {{ $('" + N.DOC_CREATE + "').item.json.webViewLink || ('https://docs.google.com/document/d/' + $('" + N.DOC_CREATE + "').item.json.id + '/edit') }}",
  additionalFields: {},
}, Object.assign({ credentials: TG_CRED }, CONTINUE));

// ---------------------------------------------------------------------------
// FOLLOW-UP FLOW NODES
// ---------------------------------------------------------------------------
addNode(N.TRIG_FU, 'n8n-nodes-base.scheduleTrigger', 1.2, [-1660, 1340], { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 9 }] } });
addNode(N.CONFIG_FU, 'n8n-nodes-base.set', 3.4, [-1440, 1340], setAssignments(CONFIG_FU_FIELDS));
addNode(N.READ_ALL, 'n8n-nodes-base.googleSheets', 4.5, [-1220, 1340], Object.assign({ resource: 'sheet', operation: 'read' }, rlSheet(N.CONFIG_FU), { options: {} }), Object.assign({ alwaysOutputData: true, credentials: GS_CRED }));
addNode(N.GMAIL_INBOX, 'n8n-nodes-base.gmail', 2.1, [-1000, 1340], {
  resource: 'message', operation: 'getAll',
  returnAll: false, limit: 100,
  simple: false,
  filters: { q: 'in:inbox newer_than:14d' },
}, Object.assign({ alwaysOutputData: true, credentials: GMAIL_CRED }, CONTINUE));
addNode(N.SELECT_DUE, 'n8n-nodes-base.code', 2, [-780, 1340], { jsCode: CODE.selectDue });
addNode(N.ROUTE_FU, 'n8n-nodes-base.switch', 3.2, [-560, 1340], switchOn('={{ $json.action }}', ['replied', 'followup', 'close']));

addNode(N.MARK_REPLIED, 'n8n-nodes-base.googleSheets', 4.5, [-340, 1160], sheetsAppendOrUpdate(N.CONFIG_FU, {
  job_id: '={{ $json.job_id }}',
  status: 'replied',
  reply_received: 'true',
  reply_date: '={{ $now.toISO() }}',
}), { credentials: GS_CRED });
addNode(N.TG_REPLY, 'n8n-nodes-base.telegram', 1.2, [-120, 1160], {
  resource: 'message', operation: 'sendMessage',
  chatId: "={{ $('" + N.CONFIG_FU + "').first().json.TELEGRAM_CHAT_ID }}",
  text: "=📩 Reply received from {{ $('" + N.SELECT_DUE + "').item.json.company }} for {{ $('" + N.SELECT_DUE + "').item.json.job_title }} — check your inbox!",
  additionalFields: {},
}, Object.assign({ credentials: TG_CRED }, CONTINUE));

addNode(N.FU_PROMPT, 'n8n-nodes-base.code', 2, [-340, 1340], { jsCode: CODE.fuPrompt });
addNode(N.LLM_FU, 'n8n-nodes-base.httpRequest', 4.2, [-120, 1340], llmHttpNode(N.CONFIG_FU), CONTINUE);
addNode(N.PARSE_FU, 'n8n-nodes-base.code', 2, [100, 1340], { mode: 'runOnceForEachItem', jsCode: CODE.parseFU });
addNode(N.IF_SEND_FU, 'n8n-nodes-base.if', 2.2, [320, 1340], ifCondition({ id: 'c-send-fu', leftValue: "={{ $('" + N.CONFIG_FU + "').first().json.SEND_EMAILS }}", rightValue: 'true', operator: { type: 'string', operation: 'equals' } }));
addNode(N.GMAIL_FU, 'n8n-nodes-base.gmail', 2.1, [540, 1240], {
  resource: 'message', operation: 'send',
  sendTo: "={{ $('" + N.PARSE_FU + "').item.json.recruiter_email }}",
  subject: "={{ $('" + N.PARSE_FU + "').item.json.fu_subject }}",
  emailType: 'text',
  message: "={{ $('" + N.PARSE_FU + "').item.json.fu_body }}",
  options: { appendAttribution: false },
}, { credentials: GMAIL_CRED });
addNode(N.MARK_FU, 'n8n-nodes-base.googleSheets', 4.5, [760, 1240], sheetsAppendOrUpdate(N.CONFIG_FU, {
  job_id: "={{ $('" + N.PARSE_FU + "').item.json.job_id }}",
  status: 'followed_up',
  followup_sent: 'true',
  followup_date: '={{ $now.toISO() }}',
}), { credentials: GS_CRED });
addNode(N.TG_FU, 'n8n-nodes-base.telegram', 1.2, [980, 1240], {
  resource: 'message', operation: 'sendMessage',
  chatId: "={{ $('" + N.CONFIG_FU + "').first().json.TELEGRAM_CHAT_ID }}",
  text: "=📬 Follow-up sent to {{ $('" + N.PARSE_FU + "').item.json.company }} for {{ $('" + N.PARSE_FU + "').item.json.job_title }}",
  additionalFields: {},
}, Object.assign({ credentials: TG_CRED }, CONTINUE));

addNode(N.MARK_FU_DRY, 'n8n-nodes-base.googleSheets', 4.5, [540, 1440], sheetsAppendOrUpdate(N.CONFIG_FU, {
  job_id: "={{ $('" + N.PARSE_FU + "').item.json.job_id }}",
  status: 'followed_up',
  followup_sent: 'true',
  followup_date: '={{ $now.toISO() }}',
  notes: 'TEST MODE: follow-up NOT sent (SEND_EMAILS=false)',
}), { credentials: GS_CRED });
addNode(N.TG_FU_DRY, 'n8n-nodes-base.telegram', 1.2, [760, 1440], {
  resource: 'message', operation: 'sendMessage',
  chatId: "={{ $('" + N.CONFIG_FU + "').first().json.TELEGRAM_CHAT_ID }}",
  text: "=🧪 DRY RUN — would follow up with {{ $('" + N.PARSE_FU + "').item.json.company }}: {{ $('" + N.PARSE_FU + "').item.json.fu_subject }}",
  additionalFields: {},
}, Object.assign({ credentials: TG_CRED }, CONTINUE));

addNode(N.MARK_CLOSED, 'n8n-nodes-base.googleSheets', 4.5, [-340, 1560], sheetsAppendOrUpdate(N.CONFIG_FU, {
  job_id: '={{ $json.job_id }}',
  status: 'closed',
}), { credentials: GS_CRED });
addNode(N.TG_CLOSED, 'n8n-nodes-base.telegram', 1.2, [-120, 1560], {
  resource: 'message', operation: 'sendMessage',
  chatId: "={{ $('" + N.CONFIG_FU + "').first().json.TELEGRAM_CHAT_ID }}",
  text: "=🔒 No reply from {{ $('" + N.SELECT_DUE + "').item.json.company }} — marked closed",
  additionalFields: {},
}, Object.assign({ credentials: TG_CRED }, CONTINUE));

// ---------------------------------------------------------------------------
// STICKY NOTES
// ---------------------------------------------------------------------------
function sticky(content, x, y, w, h) {
  addNode('Note ' + (++sticky.n), 'n8n-nodes-base.stickyNote', 1, [x, y], { content, width: w, height: h });
}
sticky.n = 0;

sticky([
  '## 🚀 JOB APPLICATION AGENT — READ ME FIRST',
  '',
  '**Setup (one time):**',
  '1. Create a Google Sheet, tab name `applications`, paste the 28-column header row from the README into row 1. Put the Sheet ID in **Config**.',
  '2. Get an **OpenAI key** → platform.openai.com/api-keys (add ~$5 billing credit first) → paste into Config → `LLM_API_KEY`.',
  '3. Get a **free Hunter.io key** (25 searches/mo) → paste into Config.',
  '4. Create a Telegram bot via @BotFather, get your chat_id → Config. Attach the bot token as the Telegram credential.',
  '5. Attach Google credentials: Sheets, Gmail, Docs, Drive (all free OAuth).',
  '6. Run **Manual Test** once. Everything stays in DRY RUN until you set `SEND_EMAILS=true`.',
  '',
  '**Test knobs in Config:** MAX_JOBS_PER_RUN=10, LOOKBACK_HOURS=48 (raise to 168 if a test run finds few jobs), MIN_SCORE=70.',
].join('\n'), -1740, -560, 560, 420);

sticky([
  '## 🔎 DISCOVERY — free sources (no Apify needed for testing)',
  '',
  'Layer 2 of the master spec, implemented with free keyless APIs:',
  'RemoteOK · Remotive · Arbeitnow · Jobicy · Himalayas · WeWorkRemotely RSS',
  '',
  '**Add later (paid/keyed):**',
  '• Layer 1: Apify actors for LinkedIn/Indeed/Rozee/Mustakbil — add an HTTP node per actor feeding `Merge Sources` (raise numberInputs).',
  '• Layer 3: Greenhouse/Lever/Ashby boards per company.',
  '• Layer 4: web-search discovery via Tavily or Brave Search free tier.',
  '',
  'Each source = Fetch → Normalize (same output shape) → Merge. One dead API never kills the run (onError=continue).',
].join('\n'), -1240, -560, 540, 380);

sticky([
  '## 🧠 LLM — OpenAI',
  '',
  '**Model:** `gpt-4o-mini` — cheap and deterministic (temperature 0). Key from platform.openai.com/api-keys (needs a small prepaid balance, $5 is plenty for weeks of testing).',
  '',
  'Want better quality? Just change `LLM_MODEL` in Config:',
  '• `gpt-4.1-mini` — stronger, still cheap',
  '• `gpt-5-mini` / `gpt-5` — reasoning models (the workflow auto-drops temperature for gpt-5*/o* models, which reject it)',
  '',
  'All 4 LLM calls (score, resume, cold email, follow-up) read LLM_API_BASE / LLM_MODEL / LLM_API_KEY from Config — nothing to configure on the nodes themselves.',
].join('\n'), 420, -40, 520, 320);

sticky([
  '## 📧 ENRICHMENT + SAFETY',
  '',
  'Hunter domain-search runs per apply-routed job (free = 25/mo — fine for testing, watch quota).',
  'No domain known? Hunter is queried by company NAME and resolves it.',
  'Apollo fallback only fires when Hunter finds nothing (needs APOLLO_API_KEY; harmless 401 → skipped if empty).',
  'Last resort: careers@domain pattern. Nothing found → status=manual_apply + Telegram link.',
  '',
  '⚠️ **SEND_EMAILS=false by default.** The pipeline scores, enriches, builds the resume Doc and writes the email — but does NOT send. Sheet rows get status=dry_run so you can review subjects/resumes first. Set to true only when output quality looks right.',
].join('\n'), 1900, -180, 540, 300);

sticky([
  '## 📄 RESUME → PDF (free, no Carbone)',
  '',
  'LLM tailors the resume per track → **Create Resume Doc** (native Google Drive node) turns the text into a Google Doc in your DRIVE_FOLDER_ID in one step → **Export Resume PDF** (Google Drive download) exports it as a PDF → attached to Gmail.',
  'The Doc link is written to `resume_drive_link` in the sheet.',
  '',
  '**Only the Google Drive credential is needed here** — both nodes are native Drive nodes (no Google Docs API/credential, no raw HTTP).',
].join('\n'), 3760, -80, 520, 240);

sticky([
  '## ⏰ FOLLOW-UP ENGINE (daily 09:00 Asia/Karachi)',
  '',
  'Reads the sheet + last 14 days of inbox, then per row:',
  '• recruiter replied → status=replied + 📩 Telegram',
  '• applied ≥ 5 business days, no reply → LLM 2-line follow-up → send → status=followed_up',
  '• followed_up ≥ 3 days, still nothing → status=closed. Never a third email.',
  '',
  'Uses **Config (Follow-up)** — keep its values in sync with Config.',
  'SEND_EMAILS=false here too → follow-ups are logged, not sent.',
].join('\n'), -1740, 1080, 560, 300);

// ---------------------------------------------------------------------------
// CONNECTIONS
// ---------------------------------------------------------------------------
connect(N.TRIG12, N.CONFIG);
connect(N.TRIG_MANUAL, N.CONFIG);
[N.F_REMOTEOK, N.F_REMOTIVE, N.F_ARBEITNOW, N.F_JOBICY, N.F_HIMALAYAS, N.F_WWR].forEach(function (f) { connect(N.CONFIG, f); });
connect(N.F_REMOTEOK, N.N_REMOTEOK);
connect(N.F_REMOTIVE, N.N_REMOTIVE);
connect(N.F_ARBEITNOW, N.N_ARBEITNOW);
connect(N.F_JOBICY, N.N_JOBICY);
connect(N.F_HIMALAYAS, N.N_HIMALAYAS);
connect(N.F_WWR, N.N_WWR);
connect(N.N_REMOTEOK, N.MERGE, 0, 0);
connect(N.N_REMOTIVE, N.MERGE, 0, 1);
connect(N.N_ARBEITNOW, N.MERGE, 0, 2);
connect(N.N_JOBICY, N.MERGE, 0, 3);
connect(N.N_HIMALAYAS, N.MERGE, 0, 4);
connect(N.N_WWR, N.MERGE, 0, 5);
connect(N.MERGE, N.FILTERS);
connect(N.FILTERS, N.READ_LOG);
connect(N.READ_LOG, N.FILTER_NEW);
connect(N.FILTER_NEW, N.LOG_NEW);
connect(N.LOG_NEW, N.SCORE_PROMPT);
connect(N.SCORE_PROMPT, N.LLM_SCORE);
connect(N.LLM_SCORE, N.PARSE_SCORE);
connect(N.PARSE_SCORE, N.SAVE_SCORE);
connect(N.SAVE_SCORE, N.ROUTE);
connect(N.ROUTE, N.DOMAIN, 0);      // scored -> apply pipeline
connect(N.ROUTE, N.TG_GEO, 1);      // geo_blocked
connect(N.ROUTE, N.TG_LOW, 2);      // low_match
connect(N.ROUTE, N.TG_ERR, 3);      // score_error
connect(N.DOMAIN, N.HUNTER);
connect(N.HUNTER, N.PICK_HUNTER);
connect(N.PICK_HUNTER, N.IF_HUNTER);
connect(N.IF_HUNTER, N.FINALIZE, 0); // found -> finalize
connect(N.IF_HUNTER, N.APOLLO, 1);   // not found -> apollo
connect(N.APOLLO, N.PICK_APOLLO);
connect(N.PICK_APOLLO, N.FINALIZE);
connect(N.FINALIZE, N.SAVE_ENRICH);
connect(N.SAVE_ENRICH, N.RESUME_PROMPT);
connect(N.RESUME_PROMPT, N.LLM_RESUME);
connect(N.LLM_RESUME, N.PARSE_RESUME);
connect(N.PARSE_RESUME, N.DOC_CREATE);
connect(N.DOC_CREATE, N.SAVE_RESUME);
connect(N.SAVE_RESUME, N.IF_EMAIL);
connect(N.IF_EMAIL, N.EMAIL_PROMPT, 0);
connect(N.IF_EMAIL, N.MARK_MANUAL, 1);
connect(N.EMAIL_PROMPT, N.LLM_EMAIL);
connect(N.LLM_EMAIL, N.PARSE_EMAIL);
connect(N.PARSE_EMAIL, N.IF_SEND);
connect(N.IF_SEND, N.EXPORT_PDF, 0);
connect(N.IF_SEND, N.MARK_DRY, 1);
connect(N.EXPORT_PDF, N.SET_FILENAME);
connect(N.SET_FILENAME, N.GMAIL_SEND);
connect(N.GMAIL_SEND, N.MARK_APPLIED);
connect(N.MARK_APPLIED, N.TG_APPLIED);
connect(N.MARK_DRY, N.TG_DRY);
connect(N.MARK_MANUAL, N.TG_MANUAL);
// follow-up flow
connect(N.TRIG_FU, N.CONFIG_FU);
connect(N.CONFIG_FU, N.READ_ALL);
connect(N.READ_ALL, N.GMAIL_INBOX);
connect(N.GMAIL_INBOX, N.SELECT_DUE);
connect(N.SELECT_DUE, N.ROUTE_FU);
connect(N.ROUTE_FU, N.MARK_REPLIED, 0);
connect(N.ROUTE_FU, N.FU_PROMPT, 1);
connect(N.ROUTE_FU, N.MARK_CLOSED, 2);
connect(N.MARK_REPLIED, N.TG_REPLY);
connect(N.FU_PROMPT, N.LLM_FU);
connect(N.LLM_FU, N.PARSE_FU);
connect(N.PARSE_FU, N.IF_SEND_FU);
connect(N.IF_SEND_FU, N.GMAIL_FU, 0);
connect(N.IF_SEND_FU, N.MARK_FU_DRY, 1);
connect(N.GMAIL_FU, N.MARK_FU);
connect(N.MARK_FU, N.TG_FU);
connect(N.MARK_FU_DRY, N.TG_FU_DRY);
connect(N.MARK_CLOSED, N.TG_CLOSED);

// ---------------------------------------------------------------------------
// EMIT
// ---------------------------------------------------------------------------
const workflow = {
  name: 'Job Application Agent — Mahad Saleem (free-tier test build)',
  nodes,
  connections,
  settings: { executionOrder: 'v1', timezone: 'Asia/Karachi' },
  active: false,
  pinData: {},
  meta: { templateCredsSetupCompleted: false },
};

const outPath = path.join(__dirname, '..', 'job-application-agent.n8n.json');
fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2));
console.log('Wrote', outPath);
console.log('Nodes:', nodes.length, '(incl', nodes.filter(n => n.type === 'n8n-nodes-base.stickyNote').length, 'sticky notes)');
console.log('SHEET HEADER ROW:\n' + COLUMNS.join('\t'));

module.exports = { N, CODE, COLUMNS, workflow };
