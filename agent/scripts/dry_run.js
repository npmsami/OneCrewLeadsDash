// DRY RUN for job-application-agent.n8n.json
// 1) Structural validation of the workflow file (connections, $('refs'), switches).
// 2) Functional simulation: executes the ACTUAL jsCode from the workflow file
//    against the real API samples saved by fetch_samples.js, with mocked
//    LLM / Hunter / Apollo / Gmail responses. Exercises every branch.
// Run: node scripts/dry_run.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const wf = JSON.parse(fs.readFileSync(path.join(ROOT, 'job-application-agent.n8n.json'), 'utf8'));

let failures = 0;
let passes = 0;
function check(ok, label, detail) {
  if (ok) { passes++; console.log('  PASS  ' + label); }
  else { failures++; console.log('  FAIL  ' + label + (detail ? ' -> ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

// ---------------------------------------------------------------------------
// 1. STRUCTURAL VALIDATION
// ---------------------------------------------------------------------------
section('STRUCTURAL VALIDATION');

const nodesByName = {};
for (const n of wf.nodes) {
  check(!nodesByName[n.name], 'unique node name: ' + n.name);
  nodesByName[n.name] = n;
}
const realNodes = wf.nodes.filter(n => n.type !== 'n8n-nodes-base.stickyNote');
console.log('  node count: ' + wf.nodes.length + ' (' + realNodes.length + ' functional)');

// connections reference existing nodes
let connOk = true, connCount = 0;
for (const [from, conn] of Object.entries(wf.connections)) {
  if (!nodesByName[from]) { connOk = false; console.log('  missing source: ' + from); }
  for (const outs of conn.main || []) for (const c of outs || []) {
    connCount++;
    if (!nodesByName[c.node]) { connOk = false; console.log('  missing target: ' + c.node + ' (from ' + from + ')'); }
  }
}
check(connOk, 'all ' + connCount + ' connections reference existing nodes');

// every $('Node Ref') in any parameter/jsCode exists
const refRe = /\$\('([^']+)'\)/g;
const wfText = JSON.stringify(wf);
const badRefs = new Set();
let m;
while ((m = refRe.exec(wfText)) !== null) if (!nodesByName[m[1]]) badRefs.add(m[1]);
check(badRefs.size === 0, "all $('...') node references resolve", [...badRefs].join(', '));

// switches: connected outputs <= defined rules
for (const n of wf.nodes.filter(n => n.type === 'n8n-nodes-base.switch')) {
  const rules = n.parameters.rules.values.length;
  const outs = (wf.connections[n.name] || { main: [] }).main.length;
  check(outs <= rules, 'switch "' + n.name + '" outputs (' + outs + ') <= rules (' + rules + ')');
}
// merge gets all declared inputs
const mergeNode = wf.nodes.find(n => n.type === 'n8n-nodes-base.merge');
const mergeInputs = new Set();
for (const [from, conn] of Object.entries(wf.connections))
  for (const outs of conn.main || []) for (const c of outs || []) if (c.node === mergeNode.name) mergeInputs.add(c.index);
check(mergeInputs.size === mergeNode.parameters.numberInputs, 'merge has all ' + mergeNode.parameters.numberInputs + ' inputs wired (got ' + mergeInputs.size + ')');

// reachability from triggers
const triggers = wf.nodes.filter(n => /trigger/i.test(n.type)).map(n => n.name);
const reached = new Set(triggers);
let frontier = [...triggers];
while (frontier.length) {
  const next = [];
  for (const f of frontier) for (const outs of (wf.connections[f] || { main: [] }).main) for (const c of outs || []) {
    if (!reached.has(c.node)) { reached.add(c.node); next.push(c.node); }
  }
  frontier = next;
}
const unreachable = realNodes.filter(n => !reached.has(n.name)).map(n => n.name);
check(unreachable.length === 0, 'every functional node reachable from a trigger', unreachable.join(', '));

// fragile nodes have onError=continue
for (const name of ['Fetch RemoteOK', 'Fetch Remotive', 'Fetch Arbeitnow', 'Fetch Jobicy', 'Fetch Himalayas', 'Fetch WWR RSS', 'LLM: Score Job', 'LLM: Tailor Resume', 'LLM: Cold Email', 'LLM: Follow-up', 'Hunter: Find Email', 'Apollo: Find People', 'Gmail: Recent Inbox'])
  check(nodesByName[name] && nodesByName[name].onError === 'continueRegularOutput', 'onError=continue on "' + name + '"');
check(nodesByName['Read Sheet Log'].alwaysOutputData === true, 'alwaysOutputData on "Read Sheet Log" (first run / empty sheet)');
check(nodesByName['Read All Rows'].alwaysOutputData === true, 'alwaysOutputData on "Read All Rows"');
check(nodesByName['Gmail: Recent Inbox'].alwaysOutputData === true, 'alwaysOutputData on "Gmail: Recent Inbox"');
check(wf.settings.executionOrder === 'v1', 'executionOrder v1');

// resume section is native Google Drive nodes, no Google Docs API / credential left
check(nodesByName['Create Resume Doc'].type === 'n8n-nodes-base.googleDrive', '"Create Resume Doc" is a native Google Drive node');
check(nodesByName['Create Resume Doc'].parameters.operation === 'createFromText', 'Create Resume Doc uses createFromText (one-step text -> Google Doc)');
check(nodesByName['Export Resume PDF'].type === 'n8n-nodes-base.googleDrive', '"Export Resume PDF" is a native Google Drive node');
check(JSON.stringify(nodesByName['Export Resume PDF'].parameters).includes('application/pdf'), 'Export Resume PDF converts to PDF');
check(!nodesByName['Write Resume Text'] && !nodesByName['Move Doc To Folder'], 'old create+insert+move HTTP nodes removed (folded into createFromText)');
check(!wfText.includes('googleDocsOAuth2Api') && !wfText.includes('docs.googleapis.com'), 'no Google Docs API / credential references remain anywhere');
const driveCredNodes = wf.nodes.filter(n => n.credentials && n.credentials.googleDriveOAuth2Api).map(n => n.name);
check(driveCredNodes.length === 2 && driveCredNodes.includes('Create Resume Doc') && driveCredNodes.includes('Export Resume PDF'), 'exactly the 2 resume nodes use the Google Drive credential');

// jsCode of every code node compiles
for (const n of wf.nodes.filter(n => n.type === 'n8n-nodes-base.code')) {
  let ok = true, err = '';
  try { new Function('$input', '$', '$json', n.parameters.jsCode); } catch (e) { ok = false; err = e.message; }
  check(ok, 'jsCode compiles: ' + n.name, err);
}

// ---------------------------------------------------------------------------
// 2. MINI n8n RUNTIME
// ---------------------------------------------------------------------------
function code(name) { return nodesByName[name].parameters.jsCode; }

function makeDollar(ctx, idx) {
  return function (name) {
    const arr = ctx[name] || [];
    return {
      all: () => arr,
      first: () => arr[0],
      itemMatching: (i) => { if (!arr[i]) throw new Error('no paired item ' + i + ' for ' + name); return arr[i]; },
      get item() {
        const i = typeof idx === 'number' ? idx : 0;
        if (!arr[i]) throw new Error('no paired item ' + i + ' for ' + name);
        return arr[i];
      },
    };
  };
}

function runAll(name, inputItems, ctx) {
  const fn = new Function('$input', '$', '$json', code(name));
  const $input = { all: () => inputItems, first: () => inputItems[0], item: inputItems[0] };
  const out = fn($input, makeDollar(ctx), inputItems[0] && inputItems[0].json) || [];
  return out;
}

function runEach(name, inputItems, ctxArrays) {
  // ctxArrays: { 'Node Name': itemsAlignedToInput } ; 'Config' style refs use .first()
  const out = [];
  for (let i = 0; i < inputItems.length; i++) {
    const fn = new Function('$input', '$', '$json', code(name));
    const item = inputItems[i];
    const $input = { all: () => [item], first: () => item, item };
    out.push(fn($input, makeDollar(ctxArrays, i), item.json));
  }
  return out;
}

const configItem = (() => {
  const o = {};
  for (const a of nodesByName['Config'].parameters.assignments.assignments) o[a.name] = a.value;
  return { json: o };
})();
const configFuItem = (() => {
  const o = {};
  for (const a of nodesByName['Config (Follow-up)'].parameters.assignments.assignments) o[a.name] = a.value;
  return { json: o };
})();

// ---------------------------------------------------------------------------
// 3. DISCOVERY -> NORMALIZE (real samples)
// ---------------------------------------------------------------------------
section('DISCOVERY + NORMALIZE (real API samples)');
const S = (f) => fs.readFileSync(path.join(ROOT, 'samples', f), 'utf8');

// HTTP node behavior: JSON array response -> one item per element; object -> one item
const remoteokItems = JSON.parse(S('remoteok.json')).map(j => ({ json: j }));
const remotiveItems = [{ json: JSON.parse(S('remotive.json')) }];
const arbeitnowItems = [{ json: JSON.parse(S('arbeitnow.json')) }];
const jobicyItems = [{ json: JSON.parse(S('jobicy.json')) }];
const himalayasItems = [{ json: JSON.parse(S('himalayas.json')) }];
// RSS node output mock from raw XML (mimics rss-parser fields)
const wwrXml = S('wwr_rss.xml');
const wwrItems = [...wwrXml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(mm => {
  const block = mm[1];
  const pick = (tag) => {
    const r = block.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>'));
    let v = r ? r[1].trim() : '';
    v = v.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
    return v.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  };
  const pub = pick('pubDate');
  return { json: { title: pick('title'), link: pick('link'), pubDate: pub, isoDate: pub ? new Date(pub).toISOString() : '', content: pick('description') } };
});

const ctx0 = { 'Config': [configItem] };
const norm = {
  remoteok: runAll('Normalize RemoteOK', remoteokItems, ctx0),
  remotive: runAll('Normalize Remotive', remotiveItems, ctx0),
  arbeitnow: runAll('Normalize Arbeitnow', arbeitnowItems, ctx0),
  jobicy: runAll('Normalize Jobicy', jobicyItems, ctx0),
  himalayas: runAll('Normalize Himalayas', himalayasItems, ctx0),
  wwr: runAll('Normalize WWR', wwrItems, ctx0),
};
for (const [k, v] of Object.entries(norm)) {
  console.log('  ' + k.padEnd(10) + ' -> ' + String(v.length).padStart(3) + ' normalized jobs');
  check(v.every(i => i.json.title && i.json.company && i.json.url && i.json.source), k + ': all items have title/company/url/source');
}
check(norm.remoteok.length > 0 && norm.remotive.length > 0 && norm.wwr.length > 0, 'at least remoteok/remotive/wwr produced jobs');
// error-item resilience: feed an HTTP error item through a normalizer
const errOut = runAll('Normalize RemoteOK', [{ json: { error: 'getaddrinfo ENOTFOUND' } }], ctx0);
check(errOut.length === 0, 'normalizer swallows HTTP error items (dead API does not pollute the run)');

const merged = [].concat(norm.remoteok, norm.remotive, norm.arbeitnow, norm.jobicy, norm.himalayas, norm.wwr);
console.log('  merged total: ' + merged.length);

// ---------------------------------------------------------------------------
// 4. HARD FILTERS (STAGE 1) + DEDUP (STAGE 2)
// ---------------------------------------------------------------------------
section('HARD FILTERS + DEDUP');
const filtered48 = runAll('Hard Filters', merged, ctx0);
const cfg168 = { json: Object.assign({}, configItem.json, { LOOKBACK_HOURS: '168' }) };
const filtered168 = runAll('Hard Filters', merged, { 'Config': [cfg168] });
console.log('  pass @48h lookback : ' + filtered48.length);
console.log('  pass @168h lookback: ' + filtered168.length);
check(filtered168.length > 0, 'hard filters keep relevant jobs (168h window)');
const pool = filtered48.length >= 4 ? filtered48 : filtered168;
check(pool.every(i => /^j[0-9a-f]{16}$/.test(i.json.job_id)), 'job_id hash format', pool.find(i => !/^j[0-9a-f]{16}$/.test(i.json.job_id)) && pool.find(i => !/^j[0-9a-f]{16}$/.test(i.json.job_id)).json.job_id);
check(new Set(pool.map(i => i.json.job_id)).size === pool.length, 'no duplicate job_ids in batch');
check(!pool.some(i => /junior|intern/i.test(i.json.job_title)), 'no junior/intern titles survive');
check(!pool.some(i => /netsol/i.test(i.json.company)), 'exclusion list (NETSOL) enforced');
check(!pool.some(i => /hybrid|on-?site/i.test(i.json.location_tag)), 'no hybrid/onsite locations survive');
// country-lock spot check: a US-only location must not survive
const usLockProbe = runAll('Hard Filters', [{ json: { title: 'Senior DevOps Engineer', company: 'TestCo', url: 'https://x.com/j/1', location_tag: 'USA', posted_at: new Date().toISOString(), description: 'k8s', tags: [], source: 'probe' } }], ctx0);
check(usLockProbe.length === 0, 'country-locked location (USA) rejected at scrape level');
const pkProbe = runAll('Hard Filters', [{ json: { title: 'Senior DevOps Engineer', company: 'TestCo', url: 'https://x.com/j/2', location_tag: 'Worldwide', posted_at: new Date().toISOString(), description: 'k8s', tags: [], source: 'probe' } }], ctx0);
check(pkProbe.length === 1, 'worldwide remote job kept');
console.log('  sample kept jobs:');
pool.slice(0, 6).forEach(i => console.log('    - [' + i.json.source + '] ' + i.json.job_title + ' @ ' + i.json.company + ' (' + i.json.location_tag + ')'));

// dedup vs sheet: empty sheet (first run) then one known row
const emptySheet = [{ json: {} }]; // what alwaysOutputData emits for an empty sheet
let fresh = runAll('Filter New Jobs', emptySheet, { 'Config': [configItem], 'Hard Filters': pool });
check(fresh.length === Math.min(pool.length, 10), 'cap respected: ' + fresh.length + ' of ' + pool.length + ' (MAX_JOBS_PER_RUN=10)');
const knownRow = { json: { job_id: pool[0].json.job_id, job_title: pool[0].json.job_title, company: pool[0].json.company, status: 'applied' } };
const fresh2 = runAll('Filter New Jobs', [knownRow], { 'Config': [configItem], 'Hard Filters': pool });
check(!fresh2.some(i => i.json.job_id === pool[0].json.job_id), 'known job_id skipped on re-run');
const dupTitleRow = { json: { job_id: 'jdeadbeefdeadbeef', job_title: pool[1] ? pool[1].json.job_title : 'x', company: pool[1] ? pool[1].json.company : 'y' } };
const fresh3 = runAll('Filter New Jobs', [dupTitleRow], { 'Config': [configItem], 'Hard Filters': pool });
check(pool.length < 2 || !fresh3.some(i => i.json.job_title === pool[1].json.job_title && i.json.company === pool[1].json.company), 'same title+company from another board skipped');

// ---------------------------------------------------------------------------
// 5. STAGE 3 — SCORING (mock LLM, all 4 routes + both provider shapes)
// ---------------------------------------------------------------------------
section('STAGE 3 — LLM SCORING');
const prompts = runAll('Build Score Prompt', fresh, { 'Config': [configItem], 'Filter New Jobs': fresh });
check(prompts.length === fresh.length, 'one prompt per job');
check(prompts.every(p => {
  try { const b = JSON.parse(p.json.llm_body); return b.model && b.messages[0].content.includes(p.json.job_title) && b.messages[0].content.includes('Return JSON only'); } catch (e) { return false; }
}), 'llm_body is valid JSON containing the job + spec instructions');
check(configItem.json.LLM_API_BASE.includes('api.openai.com') && configItem.json.LLM_MODEL === 'gpt-4o-mini', 'Config default LLM is OpenAI gpt-4o-mini');
const defBody = JSON.parse(prompts[0].json.llm_body);
check(defBody.temperature === 0 && defBody.max_tokens === undefined, 'OpenAI default: chat-completions body with temperature 0');
const gpt5Cfg = { json: Object.assign({}, configItem.json, { LLM_MODEL: 'gpt-5-mini' }) };
const gpt5Prompt = runAll('Build Score Prompt', fresh.slice(0, 1), { 'Config': [gpt5Cfg], 'Filter New Jobs': fresh.slice(0, 1) });
check(JSON.parse(gpt5Prompt[0].json.llm_body).temperature === undefined, 'OpenAI reasoning models (gpt-5*/o*): temperature omitted (avoids 400)');
const llmHeaderText = JSON.stringify(nodesByName['LLM: Score Job'].parameters.headerParameters);
check(llmHeaderText.includes('Authorization') && llmHeaderText.includes('Bearer') && !llmHeaderText.includes('anthropic'), 'LLM nodes use plain OpenAI Bearer auth (no provider switching left)');

const mkScore = (over) => JSON.stringify(Object.assign({ match_score: 88, matched_track: 'DevOps', matched_keywords: ['Kubernetes', 'Terraform', 'AWS'], missing_keywords: ['GCP'], seniority_match: true, geo_eligible: true, geo_reason: 'Worldwide remote', recommended_action: 'apply', skip_reason: '' }, over));
const llmScoreResponses = prompts.map((p, i) => {
  if (i % 4 === 0) return { json: { choices: [{ message: { content: mkScore({}) } }] } };                                   // apply
  if (i % 4 === 1) return { json: { choices: [{ message: { content: mkScore({ geo_eligible: false, geo_reason: 'US only - requires US work authorization' }) } }] } }; // geo_blocked
  if (i % 4 === 2) return { json: { choices: [{ message: { content: '```json\n' + mkScore({ match_score: 45, recommended_action: 'skip', skip_reason: 'junior stack' }) + '\n```' } }] } }; // low_match, fenced
  return { json: { error: { message: 'HTTP 429 rate limit from LLM' } } };                                                   // score_error
});
const scored = runEach('Parse Score', llmScoreResponses, { 'Build Score Prompt': prompts, 'Config': [configItem] });
const byStatus = {};
scored.forEach(s => { byStatus[s.json.status] = (byStatus[s.json.status] || 0) + 1; });
console.log('  routes: ' + JSON.stringify(byStatus));
check(scored.length === fresh.length, 'every job scored');
['scored', 'geo_blocked', 'low_match', 'score_error'].forEach(st => check(fresh.length < 4 || byStatus[st] > 0, 'route exercised: ' + st));
check(scored.every(s => s.json.job_id && s.json.job_url), 'job context survives the LLM hop (itemMatching restore)');
check(scored.every(s => !s.json.llm_body), 'llm_body stripped before sheet write');
const fenced = scored[2];
check(!fenced || fenced.json.status === 'low_match', 'fenced ```json response parsed correctly');

// ---------------------------------------------------------------------------
// 6. STAGE 4 — ENRICHMENT (mock Hunter/Apollo, all 3 outcomes)
// ---------------------------------------------------------------------------
section('STAGE 4 — EMAIL ENRICHMENT');
// take apply-routed + 2 synthetic jobs to deterministically exercise domain logic
const applyJobs = scored.filter(s => s.json.status === 'scored');
const syn1 = { json: Object.assign({}, scored[0].json, { job_id: 'jsyn1syn1syn1syn1'.slice(0, 17), job_title: 'Senior Platform Engineer', company: 'Acme Cloud', job_url: 'https://jobs.acme.io/positions/123', status: 'scored', description: 'Kubernetes platform team. We run EKS, Terraform, ArgoCD.' }) };
const syn2 = { json: Object.assign({}, scored[0].json, { job_id: 'jsyn2syn2syn2syn2'.slice(0, 17), job_title: 'Senior SRE', company: 'Beta Labs', job_url: 'https://remoteok.com/remote-jobs/999999', status: 'scored', description: 'SRE role, Prometheus, on-call.' }) };
const applySet = applyJobs.concat([syn1, syn2]);
const domains = runAll('Extract Domain', applySet, { 'Parse Score': applySet, 'Config': [configItem] });
const synDomain = domains.find(d => d.json.company === 'Acme Cloud');
const boardDomain = domains.find(d => d.json.company === 'Beta Labs');
check(synDomain.json.company_domain === 'acme.io', 'company-hosted ATS URL -> domain extracted (jobs.acme.io -> acme.io)', synDomain.json.company_domain);
check(boardDomain.json.company_domain === '', 'job-board URL -> no fake domain (hunter falls back to company-name search)');

// Hunter mocks: [0]=rich person hit, [1]=domain resolved but no emails, rest=error (quota)
const hunterResponses = domains.map((d, i) => {
  if (i === 0) return { json: { data: { domain: d.json.company_domain || 'firstco.com', emails: [
    { value: 'sara.khan@' + (d.json.company_domain || 'firstco.com'), type: 'personal', confidence: 91, first_name: 'Sara', last_name: 'Khan', position: 'Technical Recruiter' },
    { value: 'info@' + (d.json.company_domain || 'firstco.com'), type: 'generic', confidence: 80, position: '' },
  ] } } };
  if (i === 1) return { json: { data: { domain: d.json.company_domain || 'secondco.dev', emails: [] } } };
  return { json: { errors: [{ id: 'too_many_requests', code: 429, details: 'monthly quota reached' }] } };
});
const picked = runEach('Pick Hunter Email', hunterResponses, { 'Extract Domain': domains, 'Config': [configItem] });
check(picked[0].json.recruiter_email.startsWith('sara.khan@') && picked[0].json.email_source === 'hunter' && picked[0].json.email_confidence === 'high', 'hunter picks recruiter over generic, confidence mapped', JSON.stringify(picked[0].json.recruiter_email));
check(picked[0].json.recruiter_name === 'Sara Khan', 'recruiter name captured');
check(picked[1].json.recruiter_email === '' && picked[1].json.company_domain, 'no-email case keeps hunter-resolved domain for pattern fallback');

// IF split: found -> finalize; not found -> apollo(empty/locked) -> finalize
const found = picked.filter(p => p.json.recruiter_email);
const notFound = picked.filter(p => !p.json.recruiter_email);
const apolloResponses = notFound.map(() => ({ json: { people: [{ name: 'Locked Person', email: 'email_not_unlocked@domain.com' }] } }));
const apolloPicked = runEach('Pick Apollo Email', apolloResponses, { 'Pick Hunter Email': notFound, 'Config': [configItem] });
check(apolloPicked.every(p => !p.json.recruiter_email || p.json.email_source !== 'apollo' || !/not_unlocked/.test(p.json.recruiter_email)), 'apollo locked emails rejected');
const finalized = runEach('Finalize Email', found.concat(apolloPicked), {});
const patternCase = finalized.find(f => f.json.email_source === 'pattern');
const manualCase = finalized.filter(f => !f.json.email_found);
check(!!patternCase && patternCase.json.recruiter_email.startsWith('careers@'), 'pattern fallback careers@domain when domain known', patternCase && patternCase.json.recruiter_email);
check(manualCase.length > 0, 'manual_apply path exercised (no email, no domain)');
console.log('  email outcomes: hunter=' + finalized.filter(f => f.json.email_source === 'hunter').length + ' pattern=' + finalized.filter(f => f.json.email_source === 'pattern').length + ' manual=' + manualCase.length);

// ---------------------------------------------------------------------------
// 7. STAGE 5 — RESUME (mock LLM ok + broken -> fallback)
// ---------------------------------------------------------------------------
section('STAGE 5 — RESUME GENERATION');
const resumePrompts = runAll('Build Resume Prompt', finalized, { 'Config': [configItem], 'Finalize Email': finalized });
check(resumePrompts.every(p => { const b = JSON.parse(p.json.llm_body); return b.messages[0].content.includes('MAHAD SALEEM') && b.messages[0].content.includes('Never fabricate'); }), 'resume prompt embeds master resume + anti-fabrication rule');
const resumeJson = JSON.stringify({
  professional_summary: 'Senior DevOps engineer with 5+ years across AWS, Azure and GCP.\nKubernetes and Terraform specialist focused on CI/CD speed.\nCut deployment time 60% in current role.',
  experience: [{ company: 'NETSOL Technologies', role: 'Senior DevOps Engineer', duration: 'Jan 2021 - Present', bullets: ['Reduced deployment time by 60% through pipeline optimization', 'Migrated 5 applications from GitHub to Azure DevOps', 'Managed 4+ concurrent production environments'] }],
  skills: { cloud: ['AWS', 'Azure', 'GCP'], containers: ['Docker', 'Kubernetes'], cicd: ['GitHub Actions', 'Azure DevOps'], iac: ['Terraform', 'Ansible'], monitoring: ['Grafana', 'Prometheus'], security: ['IAM', 'Secrets Management'], ai_automation: ['n8n', 'LLM APIs'], scripting: ['Bash', 'Python'], databases: ['PostgreSQL', 'MongoDB Atlas'] },
  certifications: [],
  education: 'BS Computer Science',
});
const llmResumeResponses = resumePrompts.map((p, i) => i === 1 ? { json: { error: { message: 'timeout' } } } : { json: { choices: [{ message: { content: resumeJson } }] } });
const resumes = runEach('Parse Resume', llmResumeResponses, { 'Build Resume Prompt': resumePrompts, 'Config': [configItem] });
check(resumes.every(r => /^Mahad_Saleem_[A-Za-z0-9_]+_\d{8}\.pdf$/.test(r.json.resume_filename)), 'PDF filename format Mahad_Saleem_<Company>_<Role>_<YYYYMMDD>.pdf', resumes[0].json.resume_filename);
check(resumes[0].json.resume_text.includes('SUMMARY') && resumes[0].json.resume_text.includes('EXPERIENCE') && resumes[0].json.resume_text.includes('SKILLS'), 'tailored resume rendered with all sections');
check(resumes.length > 1 ? resumes[1].json.resume_note.includes('failed') && resumes[1].json.resume_text.includes('MAHAD SALEEM') : true, 'LLM failure -> master resume fallback, pipeline continues');
console.log('  sample filename: ' + resumes[0].json.resume_filename);

// ---------------------------------------------------------------------------
// 8. STAGE 6 — COLD EMAIL (mock LLM ok + broken -> fallback)
// ---------------------------------------------------------------------------
section('STAGE 6 — COLD EMAIL');
const emailable = finalized.filter(f => f.json.email_found);
const emailPrompts = runEach('Build Email Prompt', emailable, { 'Finalize Email': emailable, 'Parse Resume': resumes.slice(0, emailable.length), 'Config': [configItem] });
check(emailPrompts.every(p => { const b = JSON.parse(p.json.llm_body); return b.messages[0].content.includes('Maximum 6 lines') && b.messages[0].content.includes('Resume attached.'); }), 'cold email prompt carries spec rules');
const goodEmail = JSON.stringify({ subject: 'Senior DevOps Engineer - 60% faster deployments', body: 'Hi Sara,\n\nNoticed you run EKS with ArgoCD - I manage the same stack across 4+ production environments and cut deployment time 60% via pipeline optimization.\n\nIf you are still hiring for the platform team, open to a quick chat this week.\n\nResume attached.\n\nMahad Saleem | email | linkedin' });
const llmEmailResponses = emailPrompts.map((p, i) => i === 0 ? { json: { choices: [{ message: { content: goodEmail } }] } } : { json: { choices: [{ message: { content: 'Sorry, I cannot' } }] } });
const emails = runEach('Parse Cold Email', llmEmailResponses, { 'Build Email Prompt': emailPrompts, 'Config': [configItem] });
check(emails[0].json.email_subject.length > 0 && emails[0].json.email_body.includes('Resume attached.'), 'cold email parsed');
check(emails.length > 1 ? emails[1].json.email_note.includes('fallback') && emails[1].json.email_body.includes('Resume attached.') : true, 'unusable LLM email -> deterministic fallback template');
console.log('  sample subject: ' + emails[0].json.email_subject);

// PDF filename/binary restore
const pdfItems = emails.map(e => ({ json: { someDriveResponse: true }, binary: { data: { fileName: 'export', mimeType: 'application/octet-stream', data: 'JVBERi0xLjQ=' } } }));
const renamed = runEach('Set PDF Filename', pdfItems, { 'Parse Cold Email': emails, 'Parse Resume': resumes });
check(renamed[0].binary.data.fileName === emails[0].json.resume_filename && renamed[0].binary.data.mimeType === 'application/pdf', 'attachment renamed to resume filename');
check(renamed[0].json.recruiter_email && renamed[0].json.email_subject, 'gmail fields restored on the item after binary export');

// ---------------------------------------------------------------------------
// 9. STAGE 8 — FOLLOW-UP ENGINE (mock sheet rows + inbox)
// ---------------------------------------------------------------------------
section('STAGE 8 — FOLLOW-UP ENGINE');
const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();
const rows = [
  { json: { job_id: 'j1', job_title: 'Senior DevOps Engineer', company: 'AlphaCo', recruiter_email: 'rec@alphaco.com', status: 'applied', applied_at: daysAgo(10), followup_sent: '', email_subject: 'Senior DevOps Engineer - intro' } },           // -> followup
  { json: { job_id: 'j2', job_title: 'Senior SRE', company: 'BravoCo', recruiter_email: 'hr@bravoco.com', status: 'applied', applied_at: daysAgo(1), followup_sent: '' } },                                                                            // -> nothing (too fresh)
  { json: { job_id: 'j3', job_title: 'Cloud Engineer', company: 'CharlieCo', recruiter_email: 'talent@charlieco.com', status: 'applied', applied_at: daysAgo(8), followup_sent: '' } },                                                                // -> replied (inbox hit)
  { json: { job_id: 'j4', job_title: 'MLOps Engineer', company: 'DeltaCo', recruiter_email: 'jobs@deltaco.com', status: 'followed_up', applied_at: daysAgo(12), followup_sent: 'true', followup_date: daysAgo(4) } },                                  // -> close
  { json: { job_id: 'j5', job_title: 'Platform Engineer', company: 'EchoCo', recruiter_email: 'careers@echoco.com', status: 'closed', applied_at: daysAgo(30) } },                                                                                     // -> nothing (closed)
];
const inbox = [
  { json: { payload: { headers: [{ name: 'From', value: 'Recruiting Team <talent@charlieco.com>' }] }, internalDate: String(Date.now() - 2 * 86400000) } }, // reply for j3
  { json: { From: 'newsletter@random.com', internalDate: String(Date.now() - 86400000) } },
  { json: {} }, // alwaysOutputData empty item must not crash
];
const due = runAll('Select Due Actions', inbox, { 'Read All Rows': rows, 'Config (Follow-up)': [configFuItem] });
const actions = {};
due.forEach(d => { actions[d.json.job_id] = d.json.action; });
console.log('  actions: ' + JSON.stringify(actions));
check(actions.j1 === 'followup', 'applied 10d ago + no reply -> followup (5 business days rule)');
check(!actions.j2, 'applied yesterday -> no action');
check(actions.j3 === 'replied', 'inbox reply matched by sender -> replied');
check(actions.j4 === 'close', 'followed_up 4d ago, silent -> close (3 day rule)');
check(!actions.j5, 'closed rows untouched (never a third email)');

const fuTargets = due.filter(d => d.json.action === 'followup');
const fuPrompts = runAll('Build FU Prompt', fuTargets, { 'Config (Follow-up)': [configFuItem] });
check(fuPrompts.every(p => { const b = JSON.parse(p.json.llm_body); return b.messages[0].content.includes('Maximum 2 lines') && b.messages[0].content.includes('zero desperation'); }), 'follow-up prompt carries spec rules');
const fuResp = fuPrompts.map(() => ({ json: { choices: [{ message: { content: JSON.stringify({ subject: 'Re: Senior DevOps Engineer - intro', body: 'Hi, just circling back on my application - happy to chat if the role is still open.\nMahad Saleem | email | linkedin' }) } }] } }));
const fuParsed = runEach('Parse Follow-up', fuResp, { 'Build FU Prompt': fuPrompts, 'Config (Follow-up)': [configFuItem] });
check(fuParsed[0].json.fu_subject.startsWith('Re:') && fuParsed[0].json.recruiter_email === 'rec@alphaco.com', 'follow-up email ready with recruiter context');
const fuBroken = runEach('Parse Follow-up', [{ json: { error: 'x' } }], { 'Build FU Prompt': fuPrompts, 'Config (Follow-up)': [configFuItem] });
check(fuBroken[0].json.fu_subject.startsWith('Re:') && fuBroken[0].json.fu_body.length > 10, 'follow-up LLM failure -> deterministic fallback');

// ---------------------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------------------
section('RESULT');
console.log('  ' + passes + ' checks passed, ' + failures + ' failed');
if (failures > 0) process.exit(1);
console.log('  DRY RUN CLEAN ✔');
