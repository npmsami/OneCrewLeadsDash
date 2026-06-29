// Probes the free job-feed APIs the n8n workflow uses and saves raw samples.
// Run: node scripts/fetch_samples.js
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'samples');

const SOURCES = [
  { name: 'remoteok', url: 'https://remoteok.com/api', type: 'json' },
  { name: 'remotive', url: 'https://remotive.com/api/remote-jobs?category=software-dev&limit=100', type: 'json' },
  { name: 'arbeitnow', url: 'https://www.arbeitnow.com/api/job-board-api', type: 'json' },
  { name: 'jobicy', url: 'https://jobicy.com/api/v2/remote-jobs?count=50&tag=devops', type: 'json' },
  { name: 'himalayas', url: 'https://himalayas.app/jobs/api?limit=100', type: 'json' },
  { name: 'wwr_rss', url: 'https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss', type: 'xml' },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) JobAgent/1.0',
  'Accept': 'application/json, application/rss+xml, text/xml, */*',
};

function describe(name, data) {
  if (name === 'remoteok') {
    const arr = Array.isArray(data) ? data : [];
    const jobs = arr.filter(j => j && (j.position || j.title));
    const s = jobs[0] || {};
    return { count: jobs.length, firstElementKeys: Object.keys(arr[0] || {}), sampleKeys: Object.keys(s), sample: { position: s.position, company: s.company, location: s.location, date: s.date, url: s.url, tags: s.tags, salary_min: s.salary_min } };
  }
  if (name === 'remotive') {
    const jobs = (data && data.jobs) || [];
    const s = jobs[0] || {};
    return { count: jobs.length, sampleKeys: Object.keys(s), sample: { title: s.title, company_name: s.company_name, candidate_required_location: s.candidate_required_location, publication_date: s.publication_date, url: s.url, salary: s.salary, job_type: s.job_type } };
  }
  if (name === 'arbeitnow') {
    const jobs = (data && data.data) || [];
    const s = jobs[0] || {};
    return { count: jobs.length, sampleKeys: Object.keys(s), sample: { title: s.title, company_name: s.company_name, remote: s.remote, location: s.location, created_at: s.created_at, url: s.url, tags: s.tags, job_types: s.job_types } };
  }
  if (name === 'jobicy') {
    const jobs = (data && data.jobs) || [];
    const s = jobs[0] || {};
    return { count: jobs.length, topLevelKeys: Object.keys(data || {}), sampleKeys: Object.keys(s), sample: { jobTitle: s.jobTitle, companyName: s.companyName, jobGeo: s.jobGeo, jobLevel: s.jobLevel, pubDate: s.pubDate, url: s.url, jobType: s.jobType, annualSalaryMin: s.annualSalaryMin } };
  }
  if (name === 'himalayas') {
    const jobs = (data && data.jobs) || [];
    const s = jobs[0] || {};
    return { count: jobs.length, topLevelKeys: Object.keys(data || {}), sampleKeys: Object.keys(s), sample: JSON.parse(JSON.stringify(s, (k, v) => (k === 'description' || k === 'excerpt') ? String(v).slice(0, 120) : v)) };
  }
  return {};
}

(async () => {
  const report = {};
  for (const src of SOURCES) {
    try {
      const res = await fetch(src.url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
      const text = await res.text();
      fs.writeFileSync(path.join(OUT, src.name + (src.type === 'json' ? '.json' : '.xml')), text);
      if (src.type === 'json') {
        let data;
        try { data = JSON.parse(text); } catch (e) { report[src.name] = { status: res.status, error: 'NOT JSON: ' + text.slice(0, 200) }; continue; }
        report[src.name] = { status: res.status, ...describe(src.name, data) };
      } else {
        const items = (text.match(/<item>/g) || []).length;
        const firstTitle = (text.match(/<title>([\s\S]*?)<\/title>/g) || [])[1] || '';
        report[src.name] = { status: res.status, rssItems: items, sampleTitle: firstTitle.slice(0, 160) };
      }
    } catch (e) {
      report[src.name] = { error: String(e.message || e) };
    }
  }
  fs.writeFileSync(path.join(OUT, '_probe_report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})();
