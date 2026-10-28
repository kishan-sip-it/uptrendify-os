-- Brand-canvas QA seed (2026-10-28 toolbar + brand-generation round) — run AFTER scripts/qa/qa-seed-canvas.sql:
-- PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f scripts/qa/qa-seed-canvas.sql
-- PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f scripts/qa/qa-seed-brand-canvas.sql
-- Single statement per psql -c is fine; run as file so everything is one transaction.

-- Scanned identity powering brand essentials + strategy profile (no logo —
-- the brand-logo route would try to fetch a remote URL).
update brands set
  industry = 'Wellness',
  primary_color = '#0f766e',
  secondary_colors = array['#f59e0b', '#e2e8f0'],
  visual_identity = jsonb_build_object(
    'palette', jsonb_build_array(
      jsonb_build_object('hex', '#0f766e', 'role', 'primary', 'occurrences', 40, 'sources', jsonb_build_array('home')),
      jsonb_build_object('hex', '#f59e0b', 'role', 'secondary', 'occurrences', 18, 'sources', jsonb_build_array('home')),
      jsonb_build_object('hex', '#f4f7f6', 'role', 'surface', 'occurrences', 22, 'sources', jsonb_build_array('home'))
    ),
    'fonts', jsonb_build_array(
      jsonb_build_object('family', 'Poppins', 'source', 'css-declaration', 'evidence', 'heading'),
      jsonb_build_object('family', 'Inter', 'source', 'css-declaration', 'evidence', 'body')
    ),
    'headingFont', 'Poppins',
    'bodyFont', 'Inter',
    'voice', jsonb_build_object('tone', jsonb_build_array('Calm', 'Friendly'), 'personality', jsonb_build_array('grounded'), 'styleNotes', null),
    'socialProfiles', jsonb_build_array(),
    'assets', jsonb_build_array(),
    'aiProfile', jsonb_build_object(
      'products', jsonb_build_array(),
      'services', jsonb_build_array('Studio yoga', 'Corporate resets'),
      'audience', 'Busy professionals',
      'personas', jsonb_build_array(),
      'customerTypes', jsonb_build_array(),
      'painPoints', jsonb_build_array('Back tension from desk work'),
      'useCases', jsonb_build_array('Lunch resets', 'Evening wind-down', 'Weekend strength'),
      'tone', jsonb_build_array('Calm'),
      'terminology', jsonb_build_array(),
      'recurringClaims', jsonb_build_array(),
      'messagingThemes', jsonb_build_array('Small daily pauses', 'Strength through softness'),
      'valueProposition', 'Yoga that fits between meetings',
      'differentiators', jsonb_build_array(),
      'positioningThemes', jsonb_build_array('Calm productivity'),
      'callsToAction', jsonb_build_array('Join tonight’s class', 'Book a class'),
      'productCategories', jsonb_build_array(),
      'industry', 'Wellness',
      'businessModel', null,
      'primaryMarket', null,
      'geography', null,
      'evidence', jsonb_build_array()
    ),
    'crawl', null,
    'inspected', jsonb_build_array(),
    'warnings', jsonb_build_array(),
    'detectedAt', '2026-10-28T00:00:00.000Z'
  )
where id = 'b7a00000-0000-4000-8000-00000000c104';

-- Bootstrap reads user_profiles; the editor route needs onboarding done.
insert into user_profiles (user_id, organization_id, first_name, role, onboarding_completed)
values ('b7a00000-0000-4000-8000-00000000c101', 'b7a00000-0000-4000-8000-00000000c102', 'Canvas', 'OWNER', true)
on conflict (user_id) do update set organization_id = excluded.organization_id, role = 'OWNER', onboarding_completed = true;

-- Version-less content item: opens Studio on a genuinely EMPTY canvas
-- (manual-blank flow) so the "generate a design from this brand" path runs.
insert into content_items (id, organization_id, brand_id, type, title, status, created_at, updated_at, context)
values ('b7a00000-0000-4000-8000-00000000c107', 'b7a00000-0000-4000-8000-00000000c102', 'b7a00000-0000-4000-8000-00000000c104', 'SOCIAL_POST', 'Blank Canvas QA', 'DRAFT', now(), now(), '{}')
on conflict (id) do update set title = excluded.title, updated_at = now(), current_version_id = null;

update content_items set current_version_id = null where id = 'b7a00000-0000-4000-8000-00000000c107';
delete from content_versions where content_item_id = 'b7a00000-0000-4000-8000-00000000c107';
