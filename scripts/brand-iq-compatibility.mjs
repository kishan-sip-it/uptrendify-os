#!/usr/bin/env node
/**
 * Local authenticated 100-domain compatibility sweep for Brand IQ.
 *
 * Requires the local UpTrendifyOS app to be running and an authenticated
 * browser Cookie header. Never prints or writes the cookie to the report.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DOMAINS = [
  "openai.com",
  "stripe.com",
  "microsoft.com",
  "google.com",
  "salesforce.com",
  "adobe.com",
  "oracle.com",
  "sap.com",
  "servicenow.com",
  "workday.com",
  "shopify.com",
  "intuit.com",
  "figma.com",
  "github.com",
  "harness.io",
  "workato.com",
  "n8n.io",
  "datadoghq.com",
  "mailchimp.com",
  "klaviyo.com",
  "activecampaign.com",
  "loops.so",
  "grammarly.com",
  "tableau.com",
  "wpengine.com",
  "launchdarkly.com",
  "ngrok.com",
  "holded.com",
  "digitalriver.com",
  "factorialhr.com",
  "donut.com",
  "kandji.io",
  "mcafee.com",
  "celtra.com",
  "getcensus.com",
  "lusha.com",
  "proposify.com",
  "userguiding.com",
  "fracttal.com",
  "crowdstrike.com",
  "palantir.com",
  "paloaltonetworks.com",
  "ibm.com",
  "netflix.com",
  "uber.com",
  "freshworks.com",
  "shiprocket.in",
  "rocketlane.com",
  "spotdraft.com",
  "truefoundry.com",
  "finbox.in",
  "kapturecx.com",
  "khatabook.com",
  "perfios.com",
  "fleetx.io",
  "webengage.com",
  "zaggle.in",
  "zuddl.com",
  "swipez.in",
  "docsumo.com",
  "rategain.com",
  "squadstack.com",
  "wobot.ai",
  "obsidiansecurity.com",
  "gomotive.com",
  "marqvision.com",
  "alloy.com",
  "openevidence.com",
  "appcues.com",
  "kajabi.com",
  "lattice.com",
  "hellosign.com",
  "slidebean.com",
  "formstack.com",
  "greenhouse.io",
  "jasper.ai",
  "bardeen.ai",
  "amplemarket.com",
  "accelo.com",
  "almanac.io",
  "bettermode.com",
  "bigblue.co",
  "zentail.com",
  "memberstack.com",
  "draftbit.com",
  "userinterviews.com",
  "bland.ai",
  "bill.com",
  "aerchain.io",
  "businessnext.com",
  "detecttechnologies.com",
  "riskcovry.com",
  "moveinsync.com",
  "aishield.ai",
  "antimetal.com",
  "atlar.com",
  "arcade.software",
  "aisera.com",
  "scale.com",
  "langchain.com"
];

function argValue(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

function normalizeHost(host) {
  return String(host ?? '').trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

function safeHostname(raw) {
  try { return normalizeHost(new URL(raw).hostname); } catch { return ''; }
}

function safeCsv(value) {
  let text = value == null ? '' : String(value);
  if (/^[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function escapeHtmlLikeContent(value, limit = 400) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function classify({ httpStatus, payload, error }) {
  if (error) return 'REQUEST_ERROR';
  const identity = payload?.identity;
  if (!payload?.ok || !identity) {
    if (httpStatus === 403) return 'HTTP_403';
    if (httpStatus === 401) return 'HTTP_401';
    if (httpStatus === 429) return 'HTTP_429';
    if (httpStatus === 422) return 'INSUFFICIENT_EVIDENCE';
    if (httpStatus >= 500) return 'SERVER_ERROR';
    return 'NO_IDENTITY';
  }
  const aiFallback = identity.aiFallbackUsed === true || identity.aiModelCompleted === false || identity.aiStatus === 'fallback';
  const noLogo = !identity.logoUrl;
  const noPrimaryColor = !identity.primaryColor;
  if (aiFallback && noLogo && noPrimaryColor) return 'AI_FALLBACK_AND_NO_LOGO_AND_NO_PRIMARY_COLOR';
  if (aiFallback && noLogo) return 'AI_FALLBACK_AND_NO_LOGO';
  if (aiFallback && noPrimaryColor) return 'AI_FALLBACK_AND_NO_PRIMARY_COLOR';
  if (noLogo && noPrimaryColor) return 'NO_LOGO_AND_NO_PRIMARY_COLOR';
  if (aiFallback) return 'AI_FALLBACK';
  if (noLogo) return 'NO_LOGO';
  if (noPrimaryColor) return 'NO_PRIMARY_COLOR';
  if ((identity.warnings?.length ?? 0) > 0 || (identity.scanNotices?.length ?? 0) > 0) return 'COMPLETED_WITH_WARNINGS';
  return 'COMPLETED';
}

function siteLogoRelation(domain, logoUrl) {
  if (!logoUrl) return null;
  const logoHost = safeHostname(logoUrl);
  if (!logoHost) return null;
  const siteHost = normalizeHost(domain);
  return logoHost === siteHost || logoHost.endsWith('.' + siteHost) || siteHost.endsWith('.' + logoHost);
}

async function scanDomain(domain, index, baseUrl, cookie, timeoutMs) {
  const started = Date.now();
  const targetUrl = 'https://' + domain + '/';
  const endpoint = new URL('/api/brands/website-identity', baseUrl);
  endpoint.searchParams.set('url', targetUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Request timed out')), timeoutMs);
  let httpStatus = null;
  let payload = null;
  let error = null;
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        cookie,
        'x-brand-iq-compatibility-run': 'local-100-domain-suite',
      },
      signal: controller.signal,
    });
    httpStatus = response.status;
    const body = await response.text();
    try { payload = JSON.parse(body); }
    catch { error = 'Response was not valid JSON'; }
    if (!response.ok && !payload?.error) {
      error = error ?? 'HTTP ' + response.status;
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  } finally {
    clearTimeout(timer);
  }

  const identity = payload?.identity ?? null;
  const warnings = Array.isArray(identity?.warnings) ? identity.warnings : [];
  const aiWarnings = Array.isArray(identity?.aiWarnings) ? identity.aiWarnings : [];
  const logoUrl = typeof identity?.logoUrl === 'string' ? identity.logoUrl : null;
  const row = {
    index: index + 1,
    domain,
    targetUrl,
    outcome: classify({ httpStatus, payload, error }),
    httpStatus,
    elapsedMs: Date.now() - started,
    responseOk: Boolean(payload?.ok && identity),
    error: error ?? payload?.error ?? null,
    brandName: identity?.brandName ?? null,
    finalUrl: identity?.finalUrl ?? null,
    logoUrl,
    hasLogo: Boolean(logoUrl),
    hasPrimaryColor: Boolean(identity?.primaryColor),
    logoHost: safeHostname(logoUrl),
    logoHostMatchesDomain: siteLogoRelation(domain, logoUrl),
    faviconUrl: identity?.faviconUrl ?? null,
    primaryColor: identity?.primaryColor ?? null,
    secondaryColors: Array.isArray(identity?.secondaryColors) ? identity.secondaryColors.slice(0, 4) : [],
    aiStatus: identity?.aiStatus ?? (identity?.aiFallbackUsed ? 'fallback' : identity?.aiModelCompleted ? 'completed' : 'unknown'),
    aiModelCompleted: identity?.aiModelCompleted ?? null,
    aiFallbackUsed: identity?.aiFallbackUsed ?? null,
    aiWarnings,
    warnings,
    scanNotices: Array.isArray(identity?.scanNotices) ? identity.scanNotices : [],
    pageCount: identity?.crawl?.pageCount ?? payload?.evidenceCount ?? null,
    stylesheetCount: identity?.crawl?.stylesheetCount ?? null,
    palette: Array.isArray(identity?.palette) ? identity.palette.slice(0, 6).map(({ hex, role, sources }) => ({ hex, role, sources })) : [],
    firstWarning: warnings[0] ?? aiWarnings[0] ?? null,
  };
  process.stdout.write('[' + String(index + 1).padStart(3, '0') + '/100] ' + domain + ' -> ' + row.outcome + (httpStatus == null ? '' : ' (' + httpStatus + ')') + ' in ' + row.elapsedMs + 'ms\n');
  return row;
}

async function main() {
  const baseUrl = argValue('--base-url', process.env.UPTRENDIFY_BASE_URL ?? 'http://localhost:3000');
  let parsedBase;
  try {
    parsedBase = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsedBase.protocol) || parsedBase.username || parsedBase.password) throw new Error('invalid URL');
  } catch {
    throw new Error('Use --base-url http://localhost:3000 or set UPTRENDIFY_BASE_URL to the local app URL.');
  }

  let cookie = process.env.UPTRENDIFY_COOKIE ?? '';
  cookie = cookie.replace(/^Cookie:\s*/i, '').trim();
  if (!cookie) {
    throw new Error('Authenticated Cookie header is required. Set UPTRENDIFY_COOKIE from your own signed-in browser session; this script never writes or logs it.');
  }

  const concurrencyRaw = Number(argValue('--concurrency', process.env.UPTRENDIFY_SCAN_CONCURRENCY ?? '2'));
  const concurrency = Math.max(1, Math.min(4, Number.isFinite(concurrencyRaw) ? Math.floor(concurrencyRaw) : 2));
  const timeoutRaw = Number(argValue('--timeout-ms', process.env.UPTRENDIFY_SCAN_TIMEOUT_MS ?? '100000'));
  const timeoutMs = Math.max(10_000, Math.min(120_000, Number.isFinite(timeoutRaw) ? Math.floor(timeoutRaw) : 100_000));
  const limitRaw = Number(argValue('--limit', String(DOMAINS.length)));
  const limit = Math.max(1, Math.min(DOMAINS.length, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : DOMAINS.length));
  const onlyArg = argValue('--only', '');
  // --only may include ad-hoc targets outside the standard benchmark (e.g. a
  // reported Cognichip failure) so regressions can be reproduced immediately.
  const selected = (onlyArg
    ? [...new Set(onlyArg.split(',').map(normalizeHost).filter(Boolean))]
    : DOMAINS
  ).slice(0, limit);
  if (selected.length === 0) throw new Error('No domains selected; check --only or --limit.');

  const results = new Array(selected.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= selected.length) return;
      results[index] = await scanDomain(selected[index], index, parsedBase.toString(), cookie, timeoutMs);
      // Small spacing reduces accidental rate-limit pressure when multiple requests finish quickly.
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, () => worker()));

  const outcomeCounts = {};
  for (const row of results) outcomeCounts[row.outcome] = (outcomeCounts[row.outcome] ?? 0) + 1;
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: parsedBase.origin,
    domainCount: results.length,
    timeoutMs,
    concurrency,
    summary: outcomeCounts,
    results,
  };
  const outputDir = path.resolve(process.cwd(), argValue('--output-dir', 'artifacts/brand-iq-compatibility'));
  await mkdir(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(outputDir, 'brand-iq-' + stamp + '.json');
  const csvPath = path.join(outputDir, 'brand-iq-' + stamp + '.csv');
  await writeFile(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  const columns = [
    'index','domain','outcome','httpStatus','elapsedMs','brandName','logoUrl','logoHost',
    'logoHostMatchesDomain','faviconUrl','primaryColor','hasLogo','hasPrimaryColor','aiStatus','aiModelCompleted','aiFallbackUsed',
    'pageCount','stylesheetCount','warningCount','firstWarning','error',
  ];
  const csv = [
    columns.join(','),
    ...results.map(row => columns.map(key => safeCsv(key === 'warningCount' ? row.warnings.length : row[key])).join(',')),
  ].join('\n') + '\n';
  await writeFile(csvPath, csv, 'utf8');

  process.stdout.write('\nSummary\n');
  for (const [outcome, count] of Object.entries(outcomeCounts).sort((a,b) => b[1] - a[1])) {
    process.stdout.write('  ' + outcome.padEnd(26) + count + '\n');
  }
  process.stdout.write('\nJSON: ' + path.relative(process.cwd(), jsonPath) + '\nCSV:  ' + path.relative(process.cwd(), csvPath) + '\n');
}
main().catch(error => {
  process.stderr.write('Brand IQ compatibility run failed: ' + (error instanceof Error ? error.message : String(error)) + '\n');
  process.exitCode = 1;
});
