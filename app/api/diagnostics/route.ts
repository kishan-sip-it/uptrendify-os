import { NextResponse } from 'next/server';
import { requireOrgRole, ROLES } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { env, invalidEnvKeys } from '@/lib/env';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { obs } from '@/lib/obs/logger';
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  RUNTIME_SCHEMA_CONTRACTS,
  projectRefFromUrl,
  type SyncCheck,
} from '@/lib/production-sync';

export const dynamic = 'force-dynamic';

function makeCheck(
  key: string,
  label: string,
  status: SyncCheck['status'],
  detail: string,
): SyncCheck {
  return { key, label, status, detail };
}

async function queryContract(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  table: string,
  columns: string,
): Promise<SyncCheck> {
  try {
    const { error } = await supabase.from(table).select(columns).limit(1);
    if (error) {
      return makeCheck('schema.' + table, table, 'fail', error.message);
    }
    return makeCheck(
      'schema.' + table,
      table,
      'pass',
      'Readable through authenticated PostgREST (' + columns + ').',
    );
  } catch (error) {
    return makeCheck(
      'schema.' + table,
      table,
      'fail',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function GET() {
  const authorization = await requireOrgRole([ROLES.OWNER, ROLES.ADMIN]);
  if (authorization.error) {
    return NextResponse.json(authorization.error.body, { status: authorization.error.status });
  }

  try {
    const { url, key } = getSupabaseConfig();
    const configuration = env();
    const invalidKeys = invalidEnvKeys();
    const production = process.env.NODE_ENV === 'production';
    const projectRef = projectRefFromUrl(url);

    const checks: SyncCheck[] = [
      makeCheck(
        'deployment.environment',
        'Deployment environment',
        process.env.VERCEL_ENV === 'production' || !production ? 'pass' : 'warn',
        'NODE_ENV=' + (process.env.NODE_ENV ?? 'unknown') + ', VERCEL_ENV=' + (process.env.VERCEL_ENV ?? 'unknown') + '.',
      ),
      makeCheck(
        'deployment.commit',
        'Deployment identity',
        process.env.VERCEL_GIT_COMMIT_SHA ? 'pass' : 'warn',
        process.env.VERCEL_GIT_COMMIT_SHA
          ? 'Running commit ' + process.env.VERCEL_GIT_COMMIT_SHA + '.'
          : 'Vercel commit identity is not exposed in this runtime.',
      ),
      makeCheck(
        'supabase.config',
        'Effective Supabase project',
        url && key ? 'pass' : 'fail',
        projectRef
          ? 'Server and browser clients use project ' + projectRef + '.'
          : 'Supabase URL/key is missing or invalid.',
      ),
      makeCheck(
        'supabase.project',
        'Production Supabase project alignment',
        projectRef === PRODUCTION_SUPABASE_PROJECT_REF ? 'pass' : 'fail',
        'Expected ' + PRODUCTION_SUPABASE_PROJECT_REF + ', effective ' + (projectRef ?? 'unknown') + '.',
      ),
      makeCheck(
        'environment.validation',
        'Environment validation',
        invalidKeys.length === 0 ? 'pass' : 'warn',
        invalidKeys.length === 0
          ? 'Validated environment values are acceptable. AI provider=' + configuration.DEFAULT_AI_PROVIDER + '.'
          : 'Invalid values are sanitized: ' + invalidKeys.join(', ') + '.',
      ),
    ];

    if (url && key) {
      try {
        const response = await fetch(url.replace(/\/$/, '') + '/auth/v1/settings', {
          headers: { apikey: key },
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          checks.push(
            makeCheck(
              'supabase.auth',
              'Supabase Auth reachability',
              'fail',
              'Auth settings endpoint returned ' + response.status + '.',
            ),
          );
        } else {
          const settings = await response.json().catch(() => ({})) as {
            mailer_autoconfirm?: boolean;
          };
          const confirmationConfigured = settings.mailer_autoconfirm === true
            ? 'enabled'
            : settings.mailer_autoconfirm === false
              ? 'disabled'
              : 'unknown';

          checks.push(
            makeCheck(
              'supabase.auth',
              'Supabase Auth reachability',
              'pass',
              'Auth settings endpoint returned 200.',
            ),
            makeCheck(
              'supabase.auth.emailConfirmation',
              'Email confirmation policy',
              confirmationConfigured === 'disabled' ? 'pass' : confirmationConfigured === 'enabled' ? 'fail' : 'warn',
              confirmationConfigured === 'disabled'
                ? 'Confirm Email is disabled; password signup can create an immediate session.'
                : confirmationConfigured === 'enabled'
                  ? 'Confirm Email is enabled in hosted Supabase; signup will return without a session until the email is confirmed.'
                  : 'Supabase did not expose the confirmation policy in the Auth settings response.',
            ),
          );
        }
      } catch (error) {
        checks.push(
          makeCheck(
            'supabase.auth',
            'Supabase Auth reachability',
            'fail',
            error instanceof Error ? error.message : String(error),
          ),
        );
      }
    } else {
      checks.push(makeCheck(
        'supabase.auth',
        'Supabase Auth reachability',
        'fail',
        'Cannot test Auth without a resolved Supabase config.',
      ));
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    checks.push(
      makeCheck(
        'auth.session',
        'Current authenticated session',
        !userError && Boolean(user) ? 'pass' : 'warn',
        userError
          ? userError.message
          : user
            ? 'Authenticated as ' + (user.email ?? 'current user') + ' for organization ' + authorization.context.organizationId + '.'
            : 'No authenticated session in this request.',
      ),
    );

    if (!userError && user) {
      for (const group of RUNTIME_SCHEMA_CONTRACTS) {
        for (const [table, columns] of group.checks) {
          checks.push(await queryContract(supabase, table, columns));
        }
      }

      const { data: membership, error: membershipError } = await supabase
        .from('organization_members')
        .select('organization_id,role')
        .eq('user_id', user.id)
        .eq('organization_id', authorization.context.organizationId)
        .maybeSingle();

      checks.push(
        makeCheck(
          'tenant.membership',
          'Tenant membership',
          membershipError ? 'fail' : membership ? 'pass' : 'fail',
          membershipError
            ? membershipError.message
            : membership
              ? 'Membership resolved as ' + membership.role + '.'
              : 'Authenticated user is not a member of the current organization.',
        ),
      );
    }

    const failed = checks.filter((item) => item.status === 'fail');
    const response = {
      ok: failed.length === 0,
      checkedAt: new Date().toISOString(),
      build: {
        commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
        productionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null,
      },
      supabase: {
        projectRef,
        expectedProjectRef: PRODUCTION_SUPABASE_PROJECT_REF,
        source: production ? 'verified-production-pin' : 'local-environment',
      },
      checks,
    };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
      status: response.ok ? 200 : 503,
    });
  } catch (error) {
    obs.error('System diagnostics failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        ok: false,
        error: 'System diagnostics could not complete',
        checkedAt: new Date().toISOString(),
      },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}
