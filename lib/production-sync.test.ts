import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  RUNTIME_SCHEMA_CONTRACTS,
  projectRefFromUrl,
} from './production-sync';

describe('production synchronization contract', () => {
  it('extracts the Supabase project ref from the canonical hosted URL', () => {
    expect(projectRefFromUrl('https://' + PRODUCTION_SUPABASE_PROJECT_REF + '.supabase.co')).toBe(PRODUCTION_SUPABASE_PROJECT_REF);
  });

  it('does not expose a project ref for invalid URLs', () => {
    expect(projectRefFromUrl('not-a-url')).toBeNull();
    expect(projectRefFromUrl(null)).toBeNull();
  });

  it('covers the runtime schema surfaces required by the current product', () => {
    const tables = RUNTIME_SCHEMA_CONTRACTS.flatMap((group) => group.checks.map(([table]) => table));

    expect(tables).toContain('onboarding_progress');
    expect(tables).toContain('user_tour_state');
    expect(tables).toContain('campaigns');
    expect(tables).toContain('channel_configurations');
    expect(tables).toContain('content_publications');
    expect(tables).toContain('team_invitations');
  });
});
