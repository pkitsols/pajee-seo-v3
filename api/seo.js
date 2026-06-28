const DEFAULT_TIMEOUT = 14000;
const SEARCH_TIMEOUT = 12000;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const urlObj = new URL(req.url, 'https://pajeeseo.online');
    const action = urlObj.searchParams.get('action') || 'health';
    const url = urlObj.searchParams.get('url') || '';
    const keyword = urlObj.searchParams.get('keyword') || '';
    const seed = urlObj.searchParams.get('seed') || keyword;
    const intent = urlObj.searchParams.get('intent') || 'auto';

    if (action === 'health') return json(res, { ok: true, backend: true, service: 'PajeeSEO.online Vercel API', serpProvider: activeSerpProvider(), time: new Date().toISOString() });

    if (action === 'diagnostics') {
      const data = await diagnostics(url, keyword || 'seo agency pakistan');
      return json(res, { ok: true, ...data });
    }

    if (action === 'keyword') {
      requireUrlKeyword(url, keyword);
      const data = await keywordResearch(url, keyword, seed, intent);
      return json(res, { ok: true, ...data });
    }

    if (action === 'pagespeed') {
      requireUrl(url);
      const data = await pageSpeed(url);
      return json(res, { ok: true, ...data });
    }

    if (action === 'audit') {
      requireUrl(url);
      const data = await websiteAudit(url);
      return json(res, { ok: true, ...data });
    }

    if (action === 'visibility') {
      requireUrlKeyword(url, keyword);
      const data = await visibilitySignals(url, keyword, seed);
      return json(res, { ok: true, ...data });
    }

    return json(res, { ok: false, error: 'Unknown action.' }, 404);
  } catch (err) {
    return json(res, { ok: false, error: err.message || 'Server error' }, 500);
  }
};

function json(res, payload, status = 200) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function requireUrl(url) { if (!url || !/^https?:\/\//i.test(normalizeUrl(url))) throw new Error('Valid website URL required.'); }
function requireUrlKeyword(url, keyword) { requireUrl(url); if (!keyword || keyword.trim().length < 2) throw new Error('Target keyword required.'); }
function normalizeUrl(input) { let value = String(input || '').trim(); if (!value) return ''; if (!/^https?:\/\//i.test(value)) value = 'https://' + value; return value; }
function originOf(input) { const u = new URL(normalizeUrl(input)); return u.origin; }
function hostOf(input) { const u = new URL(normalizeUrl(input)); return u.hostname.replace(/^www\./i, '').toLowerCase(); }
function stripTags(html) { return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function fmtNumber(n) { const num = Number(n || 0); if (!num) return '0'; return new Intl.NumberFormat('en-US').format(num); }
function safeKeyword(s) { return String(s || '').replace(/[\n\r\t]+/g, ' ').trim().slice(0, 120); }

async function fetchWithTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'PajeeSEOBot/1.0 (+https://pajeeseo.online)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...(options.headers || {})
      }
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}


function activeSerpProvider() {
  if (process.env.SERPAPI_KEY) return 'serpapi';
  if (process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_ID) return 'google_cse';
  return 'none';
}

async function serpSearch(query, num = 10) {
  const provider = activeSerpProvider();
  if (provider === 'serpapi') return serpApiSearch(query, num);
  if (provider === 'google_cse') return cseSearch(query, num);
  throw new Error('SERP provider missing. Add SERPAPI_KEY, or existing Google CSE variables, in Vercel Environment Variables and redeploy.');
}

async function serpApiSearch(query, num = 10) {
  const key = process.env.SERPAPI_KEY;
  if (!key) throw new Error('SERPAPI_KEY environment variable is missing.');
  const endpoint = new URL('https://serpapi.com/search.json');
  endpoint.searchParams.set('engine', 'google');
  endpoint.searchParams.set('q', query);
  endpoint.searchParams.set('num', String(Math.min(Math.max(num, 1), 10)));
  endpoint.searchParams.set('hl', process.env.SERP_LANGUAGE || 'en');
  endpoint.searchParams.set('gl', process.env.SERP_COUNTRY || 'pk');
  endpoint.searchParams.set('api_key', key);
  const res = await fetchWithTimeout(endpoint.toString(), { headers: { Accept: 'application/json' } }, SEARCH_TIMEOUT);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `SerpAPI request failed with status ${res.status}.`);
  const total = Number(data.search_information?.total_results || 0);
  return {
    totalResults: total,
    totalResultsFormatted: data.search_information?.total_results ? fmtNumber(total) : 'N/A',
    items: (data.organic_results || []).slice(0, num).map(item => ({
      title: item.title || '',
      link: item.link || '',
      snippet: item.snippet || item.rich_snippet?.top?.detected_extensions?.snippet || ''
    }))
  };
}

async function cseSearch(query, num = 10) {
  const key = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) throw new Error('Google Custom Search environment variables are missing.');
  const endpoint = new URL('https://www.googleapis.com/customsearch/v1');
  endpoint.searchParams.set('key', key);
  endpoint.searchParams.set('cx', cx);
  endpoint.searchParams.set('q', query);
  endpoint.searchParams.set('num', String(Math.min(Math.max(num, 1), 10)));
  endpoint.searchParams.set('safe', 'off');
  const res = await fetchWithTimeout(endpoint.toString(), { headers: { Accept: 'application/json' } }, SEARCH_TIMEOUT);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message || 'Google Custom Search request failed.';
    if (res.status === 403) {
      throw new Error(`${msg} Tip: Google Custom Search JSON API is closed to many new projects. Use SERPAPI_KEY in Vercel, or enable Custom Search JSON API on an eligible existing Google Cloud project.`);
    }
    throw new Error(msg);
  }
  const total = Number(data.searchInformation?.totalResults || 0);
  return {
    totalResults: total,
    totalResultsFormatted: data.searchInformation?.formattedTotalResults || fmtNumber(total),
    items: (data.items || []).map(item => ({ title: item.title || '', link: item.link || '', snippet: item.snippet || '' }))
  };
}

function findRank(items, targetHost) {
  const target = String(targetHost || '').replace(/^www\./i, '').toLowerCase();
  for (let i = 0; i < items.length; i++) {
    try {
      const h = new URL(items[i].link).hostname.replace(/^www\./i, '').toLowerCase();
      if (h === target || h.endsWith('.' + target) || target.endsWith('.' + h)) return { position: i + 1, resultUrl: items[i].link };
    } catch (_) {}
  }
  return { position: null, resultUrl: null };
}

function detectIntent(keyword, forced = 'auto') {
  if (forced && forced !== 'auto') return capitalize(forced);
  const k = String(keyword || '').toLowerCase();
  if (/near me|islamabad|lahore|karachi|rawalpindi|pakistan|local|clinic|agency in|company in/.test(k)) return 'Local';
  if (/buy|price|cost|order|hire|book|package|service|agency|company/.test(k)) return 'Commercial';
  if (/best|top|review|compare|vs|alternative/.test(k)) return 'Commercial Research';
  if (/how|what|why|guide|tips|meaning|learn/.test(k)) return 'Informational';
  return 'Mixed';
}
function capitalize(v) { return String(v || '').charAt(0).toUpperCase() + String(v || '').slice(1); }

function relatedKeywords(keyword, seed) {
  const base = safeKeyword(keyword || seed || '').toLowerCase();
  const seedText = safeKeyword(seed || keyword || '').toLowerCase();
  const roots = [base, ...seedText.split(',').map(s => s.trim()).filter(Boolean)].filter(Boolean);
  const candidates = [];
  roots.forEach(root => {
    candidates.push(root);
    candidates.push(`best ${root}`);
    candidates.push(`${root} services`);
    candidates.push(`${root} agency`);
    candidates.push(`${root} near me`);
    candidates.push(`${root} pakistan`);
    candidates.push(`${root} islamabad`);
    candidates.push(`${root} cost`);
    candidates.push(`how to improve ${root}`);
    candidates.push(`${root} strategy`);
  });
  const seen = new Set();
  return candidates
    .map(x => x.replace(/\s+/g, ' ').trim())
    .filter(x => x.length > 2 && !seen.has(x) && seen.add(x))
    .slice(0, 10);
}

function semanticThemes(keyword, seed) {
  const text = `${keyword} ${seed}`.toLowerCase();
  const words = text.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !['the','and','for','with','near','best','how'].includes(w));
  const unique = [...new Set(words)].slice(0, 6);
  const themes = [...unique];
  if (/seo|ranking|traffic|website|keyword/.test(text)) themes.push('technical SEO', 'content clusters', 'search intent', 'entity optimization');
  if (/hospital|clinic|doctor|patient|health/.test(text)) themes.push('local healthcare intent', 'appointment journey', 'trust signals');
  if (/shop|store|product|ecommerce|buy/.test(text)) themes.push('category SEO', 'commercial intent', 'product schema');
  return [...new Set(themes)].slice(0, 10);
}


async function diagnostics(url, keyword) {
  const target = url ? normalizeUrl(url) : 'https://example.com';
  const checks = {
    backend: { ok: true, message: 'Vercel serverless function is running.' },
    env: {
      pagespeedKey: Boolean(process.env.PAGESPEED_API_KEY),
      serpapiKey: Boolean(process.env.SERPAPI_KEY),
      googleCseApiKey: Boolean(process.env.GOOGLE_CSE_API_KEY),
      googleCseId: Boolean(process.env.GOOGLE_CSE_ID),
      activeSerpProvider: activeSerpProvider()
    },
    pagespeed: { ok: false, message: 'Not tested yet.' },
    serp: { ok: false, message: 'Not tested yet.' },
    auditFetch: { ok: false, message: 'Not tested yet.' }
  };

  try {
    const ps = await pageSpeedStrategy(target, 'desktop');
    checks.pagespeed = { ok: true, message: 'PageSpeed desktop test completed.', performance: ps.categories.performance, seo: ps.categories.seo };
  } catch (err) {
    checks.pagespeed = { ok: false, message: err.message };
  }

  try {
    const serp = await serpSearch(keyword || 'seo agency pakistan', 3);
    checks.serp = { ok: true, provider: activeSerpProvider(), message: 'SERP provider returned results.', totalResultsFormatted: serp.totalResultsFormatted, resultCount: serp.items.length };
  } catch (err) {
    checks.serp = { ok: false, provider: activeSerpProvider(), message: err.message };
  }

  try {
    const fetched = await fetchWithTimeout(target, {}, 10000);
    checks.auditFetch = { ok: fetched.ok, status: fetched.status, message: fetched.ok ? 'Target website HTML is fetchable.' : `Target returned HTTP ${fetched.status}.` };
  } catch (err) {
    checks.auditFetch = { ok: false, message: err.message };
  }

  return { service: 'PajeeSEO.online API diagnostics', target, checks, time: new Date().toISOString() };
}

async function keywordResearch(url, keyword, seed, forcedIntent) {
  const host = hostOf(url);
  const mainQuery = safeKeyword(keyword);
  const mainSearch = await serpSearch(mainQuery, 10);
  const mainRank = findRank(mainSearch.items, host);
  const variants = relatedKeywords(keyword, seed).filter(k => k !== mainQuery).slice(0, 5);
  const related = [];
  for (const kw of variants) {
    try {
      const s = await serpSearch(kw, 10);
      const r = findRank(s.items, host);
      related.push({ keyword: kw, intent: detectIntent(kw), totalResults: s.totalResults, totalResultsFormatted: s.totalResultsFormatted, position: r.position, resultUrl: r.resultUrl });
    } catch (err) {
      related.push({ keyword: kw, intent: detectIntent(kw), totalResults: null, totalResultsFormatted: 'Unavailable', position: null, resultUrl: null, error: err.message });
    }
  }
  return {
    domain: host,
    main: { keyword: mainQuery, intent: detectIntent(mainQuery, forcedIntent), totalResults: mainSearch.totalResults, totalResultsFormatted: mainSearch.totalResultsFormatted, position: mainRank.position, resultUrl: mainRank.resultUrl },
    related,
    semanticThemes: semanticThemes(keyword, seed),
    topResults: mainSearch.items.slice(0, 5)
  };
}

async function pageSpeed(url) {
  const target = normalizeUrl(url);
  const mobile = await pageSpeedStrategy(target, 'mobile');
  const desktop = await pageSpeedStrategy(target, 'desktop');
  return { url: target, mobile, desktop };
}

async function pageSpeedStrategy(url, strategy) {
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('strategy', strategy);
  ['performance', 'seo', 'accessibility', 'best-practices'].forEach(c => endpoint.searchParams.append('category', c));
  if (process.env.PAGESPEED_API_KEY) endpoint.searchParams.set('key', process.env.PAGESPEED_API_KEY);
  const res = await fetchWithTimeout(endpoint.toString(), { headers: { Accept: 'application/json' } }, 28000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `PageSpeed ${strategy} request failed.`);
  const cats = data.lighthouseResult?.categories || {};
  const audits = data.lighthouseResult?.audits || {};
  const score = c => cats[c]?.score === undefined ? undefined : Math.round(cats[c].score * 100);
  return {
    strategy,
    categories: {
      performance: score('performance'),
      seo: score('seo'),
      accessibility: score('accessibility'),
      bestPractices: score('best-practices')
    },
    audits: {
      fcp: audits['first-contentful-paint']?.displayValue || null,
      lcp: audits['largest-contentful-paint']?.displayValue || null,
      tbt: audits['total-blocking-time']?.displayValue || null,
      cls: audits['cumulative-layout-shift']?.displayValue || null,
      speedIndex: audits['speed-index']?.displayValue || null,
      tti: audits['interactive']?.displayValue || null
    }
  };
}

async function websiteAudit(url) {
  const target = normalizeUrl(url);
  const start = Date.now();
  const res = await fetchWithTimeout(target, {}, DEFAULT_TIMEOUT);
  const status = res.status;
  const html = await res.text();
  const responseTimeMs = Date.now() - start;
  const checks = analyzeHtml(html, target);
  const [robots, sitemap] = await Promise.all([analyzeRobots(target), analyzeSitemap(target)]);
  const issues = buildIssues(checks, robots, sitemap, responseTimeMs, status);
  return { url: target, status, responseTimeMs, checks, robots, sitemap, issues };
}

function analyzeHtml(html, url) {
  const title = getMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescription = getMetaContent(html, 'description');
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => stripTags(m[1]));
  const canonical = getLinkHref(html, 'canonical');
  const schemaCount = (html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>/gi) || []).length;
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
  const imagesMissingAlt = images.filter(tag => !/\balt\s*=\s*["'][^"']+["']/i.test(tag)).length;
  const metaRobots = getMetaContent(html, 'robots');
  const xRobots = '';
  return {
    title: cleanText(title),
    titleLength: cleanText(title).length,
    metaDescription: cleanText(metaDescription),
    metaDescriptionLength: cleanText(metaDescription).length,
    h1Count: h1s.length,
    h1s: h1s.slice(0, 5),
    hasCanonical: Boolean(canonical),
    canonical: canonical || null,
    hasSchema: schemaCount > 0,
    schemaCount,
    imagesTotal: images.length,
    imagesMissingAlt,
    metaNoindex: /noindex/i.test(metaRobots || '') || /noindex/i.test(xRobots || ''),
    https: /^https:/i.test(normalizeUrl(url)),
    wordCount: stripTags(html).split(/\s+/).filter(Boolean).length,
    internalLinks: countInternalLinks(html, url),
    externalLinks: countExternalLinks(html, url)
  };
}

function getMatch(html, regex) { const m = String(html || '').match(regex); return m ? m[1] : ''; }
function cleanText(text) { return stripTags(String(text || '').replace(/&nbsp;/g, ' ')).trim(); }
function attrValue(tag, attr) { const m = tag.match(new RegExp(attr + "\\s*=\\s*[\"']([^\"']*)[\"']", 'i')); return m ? m[1] : ''; }
function getMetaContent(html, name) {
  const tags = String(html || '').match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const n = attrValue(tag, 'name') || attrValue(tag, 'property');
    if (String(n).toLowerCase() === String(name).toLowerCase()) return attrValue(tag, 'content');
  }
  return '';
}
function getLinkHref(html, rel) {
  const tags = String(html || '').match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) if (new RegExp("rel\\s*=\\s*[\"'][^\"']*" + rel + "[^\"']*[\"']", 'i').test(tag)) return attrValue(tag, 'href');
  return '';
}
function countInternalLinks(html, url) {
  const host = hostOf(url); let count = 0;
  for (const m of String(html || '').matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const href = m[1];
    if (href.startsWith('/') || href.startsWith('#')) count++;
    else { try { if (hostOf(href) === host) count++; } catch (_) {} }
  }
  return count;
}
function countExternalLinks(html, url) {
  const host = hostOf(url); let count = 0;
  for (const m of String(html || '').matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const href = m[1];
    try { if (/^https?:\/\//i.test(href) && hostOf(href) !== host) count++; } catch (_) {}
  }
  return count;
}

async function analyzeRobots(url) {
  const robotsUrl = originOf(url) + '/robots.txt';
  try {
    const res = await fetchWithTimeout(robotsUrl, {}, 9000);
    if (!res.ok) return { found: false, url: robotsUrl, status: res.status, disallowCount: 0, sitemapHints: [] };
    const text = await res.text();
    const disallowCount = (text.match(/^\s*Disallow\s*:/gim) || []).length;
    const sitemapHints = [...text.matchAll(/^\s*Sitemap\s*:\s*(.+)$/gim)].map(m => m[1].trim()).slice(0, 10);
    return { found: true, url: robotsUrl, status: res.status, disallowCount, sitemapHints, blocksAll: /Disallow\s*:\s*\/\s*$/im.test(text) };
  } catch (err) { return { found: false, url: robotsUrl, error: err.message, disallowCount: 0, sitemapHints: [] }; }
}

async function analyzeSitemap(url) {
  const origin = originOf(url);
  const candidates = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/wp-sitemap.xml`];
  let foundUrl = null, xml = '';
  for (const sm of candidates) {
    try {
      const res = await fetchWithTimeout(sm, {}, 9000);
      if (res.ok) { xml = await res.text(); foundUrl = sm; break; }
    } catch (_) {}
  }
  if (!foundUrl) return { found: false, url: null, urlCount: 0, sampleUrls: [], noindexSamples: [], noindexCount: 0 };
  let locs = parseLocs(xml);
  const childSitemaps = locs.filter(x => /sitemap|wp-sitemap/i.test(x)).slice(0, 3);
  if (childSitemaps.length && locs.length <= 20) {
    const childLocs = [];
    for (const child of childSitemaps) {
      try {
        const res = await fetchWithTimeout(child, {}, 9000);
        if (res.ok) childLocs.push(...parseLocs(await res.text()));
      } catch (_) {}
    }
    if (childLocs.length) locs = childLocs;
  }
  locs = [...new Set(locs)].filter(x => /^https?:\/\//i.test(x));
  const samples = locs.slice(0, 8);
  const noindexSamples = [];
  for (const sample of samples) {
    try {
      const res = await fetchWithTimeout(sample, {}, 8000);
      const txt = await res.text();
      noindexSamples.push({ url: sample, noindex: /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(txt) || /noindex/i.test(res.headers.get('x-robots-tag') || '') });
    } catch (err) { noindexSamples.push({ url: sample, noindex: false, error: err.message }); }
  }
  return { found: true, url: foundUrl, urlCount: locs.length, sampleUrls: locs.slice(0, 20), noindexSamples, noindexCount: noindexSamples.filter(x => x.noindex).length };
}
function parseLocs(xml) { return [...String(xml || '').matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map(m => m[1].trim().replace(/&amp;/g, '&')); }

function buildIssues(checks, robots, sitemap, responseTimeMs, status) {
  const issues = [];
  if (status >= 400) issues.push({ title: 'HTTP status issue', fix: `The audited URL returned status ${status}. Fix server response before SEO optimization.` });
  if (!checks.title || checks.titleLength < 20) issues.push({ title: 'Weak or missing title tag', fix: 'Add a clear keyword-focused title tag around 45-60 characters.' });
  if (checks.titleLength > 65) issues.push({ title: 'Title tag too long', fix: 'Shorten the title so important keywords do not truncate in SERP.' });
  if (!checks.metaDescription || checks.metaDescriptionLength < 70) issues.push({ title: 'Weak or missing meta description', fix: 'Add a persuasive 120-160 character description with the main keyword and CTA.' });
  if (checks.h1Count !== 1) issues.push({ title: 'H1 structure issue', fix: 'Use one clear H1 that matches the page intent.' });
  if (!checks.hasCanonical) issues.push({ title: 'Canonical missing', fix: 'Add a self-referencing canonical to prevent duplicate URL confusion.' });
  if (!checks.hasSchema) issues.push({ title: 'Schema missing', fix: 'Add Organization, WebSite, Breadcrumb and page-specific schema where relevant.' });
  if (checks.imagesMissingAlt > 0) issues.push({ title: 'Images missing alt text', fix: `Add descriptive alt text to ${checks.imagesMissingAlt} image(s).` });
  if (checks.metaNoindex) issues.push({ title: 'Noindex detected', fix: 'Remove noindex from pages that should rank in Google.' });
  if (!robots.found) issues.push({ title: 'robots.txt not found', fix: 'Add robots.txt with sitemap reference and safe crawl rules.' });
  if (robots.blocksAll) issues.push({ title: 'Robots blocking all crawlers', fix: 'Remove global Disallow: / unless site is intentionally private.' });
  if (!sitemap.found || sitemap.urlCount === 0) issues.push({ title: 'Sitemap not detected', fix: 'Submit a valid sitemap.xml with indexable URLs.' });
  if (responseTimeMs > 2500) issues.push({ title: 'Slow server response', fix: 'Improve hosting, caching and backend response time.' });
  return issues.slice(0, 12);
}

async function visibilitySignals(url, keyword, seed) {
  const host = hostOf(url);
  const siteSearch = await serpSearch(`site:${host}`, 10);
  const variants = relatedKeywords(keyword, seed).slice(0, 10);
  const rankedKeywords = [];
  for (const kw of variants) {
    try {
      const s = await serpSearch(kw, 10);
      const r = findRank(s.items, host);
      rankedKeywords.push({ keyword: kw, position: r.position, resultUrl: r.resultUrl, totalResults: s.totalResults, totalResultsFormatted: s.totalResultsFormatted });
    } catch (err) {
      rankedKeywords.push({ keyword: kw, position: null, resultUrl: null, totalResults: null, totalResultsFormatted: 'Unavailable', error: err.message });
    }
  }
  const positions = rankedKeywords.map(k => k.position).filter(Boolean);
  return {
    domain: host,
    siteResults: siteSearch.totalResults,
    siteResultsFormatted: siteSearch.totalResultsFormatted,
    checkedKeywords: rankedKeywords.length,
    bestPosition: positions.length ? Math.min(...positions) : null,
    rankedKeywords
  };
}
