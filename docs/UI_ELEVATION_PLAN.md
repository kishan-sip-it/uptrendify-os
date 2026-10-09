# UpTrendifyOS UI Elevation Plan

## Phase 0 — Audit snapshot

- Repository: `kishan-sip-it/uptrendify-os`
- Styling system: shared global CSS (`app/globals.css`), light-theme semantic overrides (`app/cool-light-theme.css`), responsive hardening (`app/responsive-hardening.css`), public-site CSS (`app/public-pages.css`), landing hero CSS (`app/landing-hero.css`), and Brand Profile CSS (`app/brand-profile.css`). No new styling framework is needed.
- Theme mechanism: existing `html[data-theme]` values: `light`, `dark`, and `system`. Keep the existing preference/storage mechanism and pre-hydration theme setup.
- Fonts: the app currently imports Inter/Plus Jakarta Sans via CSS and uses Space Grotesk/DM Sans tokens in component styles. Align tokens to real existing fonts first; avoid adding network font requests until offline build behavior is understood.
- Automation: package scripts are `npm run typecheck`, `npm test`, `npm run build`. CI workflow: `.github/workflows/ci.yml`.
- Before baseline supplied in this conversation: landing page in light and dark mode, light Dashboard, and dark Brand Overview. These screenshots show the current landing hero and differing screen compositions; the dashboard and brand overview are different routes, so they are not a valid one-to-one theme comparison. Capture paired screenshots of the *same route* in both themes during local verification.

## Existing page-route inventory (34 page files)

### Public and account
- `/`, `/landing`
- `/about`, `/contact`, `/feedback`, `/report-issue`, `/terms`, `/privacy`
- `/login`, `/register`, `/forgot-password`, `/reset-password`, `/invite`, `/auth/confirmed`, `/onboarding`, `/progress`

### Authenticated workspace
- `/dashboard`
- `/brands`, `/brands/new`, `/brands/[brandId]`
- `/brands/[brandId]/campaigns`, `/brands/[brandId]/campaigns/new`, `/brands/[brandId]/campaigns/[campaignId]`
- `/brands/[brandId]/content`, `/brands/[brandId]/content/new`, `/brands/[brandId]/content/[contentId]`
- `/campaigns`, `/content`, `/approvals`
- `/settings`, `/settings/system-health`, `/settings/team`, `/settings/trash`, `/settings/workspace/new`

There are 45 API route handlers and 3 layouts. This work will not change API contracts, auth/PKCE/confirmation, role permissions, state machines, approval rules, RLS, migrations, or publishing truthfulness.

## Key findings and risks

1. **Theme geometry drift:** `app/globals.css` defined `.main { max-width: none; }` but later overrode it with `html[data-theme="dark"] .main { max-width: 1500px; }`. That made dark mode constrain content geometry when light mode did not. Removed on the preceding hero/theme fix branch; theme should affect palette, not layout.
2. **Hero video loop:** the original supplied clips are ~5.17 seconds and don't return to the same pose at the cut. Frame-matched forward/reverse encodes are prepared as downloadable binary assets; they still need to be pushed from the user's machine because the GitHub file connector cannot upload local binary files directly. Original sources remain in local history/asset archive.
3. **Hero composition:** Manus artwork is a full composition. Do not draw duplicate research/brain/content cards over it; CSS-built workflow illustration remains only as the fallback when neither video nor still can load.
4. **Theme override debt:** global styles contain a number of hard-coded dark RGBA surfaces. Convert these to existing semantic surface tokens in small, testable increments; avoid broad selector rewrites that may affect workflow screens.
5. **Layout baseline:** use shared layout rules for the shell/sidebar/main/context rail and keep geometry identical across light/dark. Tune only semantic color, border, shadow, and focus tokens per theme.
6. **Accessibility and motion:** retain data-testid/ids/aria labels. Honor `prefers-reduced-motion`, visible focus, keyboard controls, and form labels.
7. **Proof:** no fake data, customer logos, testimonials, or metrics. Any simulated UI must be labelled illustrative.

## Phased implementation order

1. **Hero/theme parity (preparatory fix branch):** dark-only content width override removed; supply a seamless-loop asset commit; verify the hero media URLs and paired light/dark screenshots.
2. **Phase 1 — Design system and shared primitives:** central tokens mapped to current CSS, StatusBadge, PageHeader/Section, Stat, EmptyState/ErrorState, skeletons, StageStepper, and copy/relative-time primitives where they can replace duplicates without behavior changes.
3. **Phase 2 — Landing, public pages and site SEO:** preserve existing copy meaning, anchors, CTAs, and registration/login behavior; improve navbar, product theater, honest proof points, page metadata, sitemap/robots/OG assets.
4. **Phase 3 — App shell:** responsive sidebar/nav, breadcrumbs, consistent shell gutters, loading/error/not-found and shared diagnostics patterns. Do not add dead routes or new backend actions.
5. **Phase 4 — Dashboard and Brands list:** reuse existing data only; normalize empty/error/loading states and compact responsive card/list presentation.
6. **Phase 5 — Brand workspace:** research, Brand Brain, strategy viewer, tab navigation and evidence presentation; preserve the human approval gate and source traceability.
7. **Phase 6 — Content Studio, campaigns, approvals/publishing and settings:** shared state badges and UX primitives; no lifecycle or publish-contract changes.
8. **Phase 7 — polish:** responsive pass at 375/768/1280/1536 widths, paired light/dark comparisons, reduced motion and keyboard checks, remove unused CSS added by this work.

## Validation rule

For each phase, run `npm run typecheck && npm test && npm run build` locally or via CI. A Vercel deployment marked READY is a build signal, not proof of the authenticated golden journey. Record the exact checks that ran. Do not claim Lighthouse 95+ or axe-clean without those measurements. Preview deployments may be limited by the team's Vercel daily deployment quota; do not upgrade billing or alter Production environment variables without explicit approval.
