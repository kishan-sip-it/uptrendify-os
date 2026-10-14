# Brand IQ 100-domain compatibility sweep

This runner exercises the authenticated `/api/brands/website-identity` endpoint against the 100 target websites in `scripts/brand-iq-compatibility.mjs`. It records scan outcomes, HTTP status, elapsed time, selected logo URL/host, palette, AI completion/fallback state, warnings and evidence-page counts.

It does **not** bypass a site's access controls or infer that a 403 means the scan succeeded. `logoHostMatchesDomain=false` is a review hint, not proof of a wrong logo: many brands serve genuine logos from CDNs. The JSON includes the full selected URL so you can review the asset before classifying it as a mismatch.

## Run it locally

1. Start the local app and sign in using your normal browser.
2. In browser DevTools → Network, select a successful authenticated `/api/brands/website-identity` request and copy its **Cookie** request header. Keep this value private.
3. In the same terminal running the commands below, paste the Cookie header when prompted. It is only passed to the process environment and is never written into the report.

```bash
read -rsp "Paste your own authenticated Cookie header: " UPTRENDIFY_COOKIE
echo
export UPTRENDIFY_COOKIE
UPTRENDIFY_BASE_URL=http://localhost:3000 npm run brand:compat
unset UPTRENDIFY_COOKIE
```

To quickly test a subset:

```bash
UPTRENDIFY_BASE_URL=http://localhost:3000 npm run brand:compat -- --only openai.com,stripe.com,cognichip.ai
```

The default run tests the full 100-domain matrix with concurrency 2. Concurrency is intentionally capped at 4 to reduce accidental provider/site rate limiting. The timeout can be adjusted with `--timeout-ms` (10,000–120,000 ms).

Reports are written locally under `artifacts/brand-iq-compatibility/` as timestamped JSON and CSV files. That folder is git-ignored. Share the CSV plus any problematic sites' matching JSON rows (remove any identifying or sensitive details) so failures can be grouped and fixed from exact observations.
