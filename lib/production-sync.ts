export const PRODUCTION_SUPABASE_PROJECT_REF = 'hbwpzuenihaxneqpzkrc';

export type SyncCheck = {
  key: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
};

export const RUNTIME_SCHEMA_CONTRACTS = [
  {
    key: 'workspace',
    label: 'Workspace model',
    checks: [
      ['organizations', 'id,name,workspace_type,timezone'],
      ['user_profiles', 'theme_preference,timezone'],
    ] as const,
  },
  {
    key: 'onboarding',
    label: 'Onboarding persistence',
    checks: [
      ['onboarding_progress', 'user_id,organization_id,current_step,completed_steps,draft_data'],
      ['user_tour_state', 'user_id,stage_key,tour_version,status,updated_at'],
    ] as const,
  },
  {
    key: 'campaigns',
    label: 'Campaign management',
    checks: [
      ['campaigns', 'id,name,status,client_id,description,budget,currency,channels'],
    ] as const,
  },
  {
    key: 'publishing',
    label: 'Approval & publishing',
    checks: [
      ['channel_configurations', 'id,organization_id,brand_id,channel,status'],
      ['content_publications', 'id,organization_id,brand_id,content_item_id,content_version_id,channel,status'],
    ] as const,
  },
  {
    key: 'team',
    label: 'Team invitations',
    checks: [
      ['team_invitations', 'id,organization_id,email,role,token_hash,expires_at,accepted_at,revoked_at'],
    ] as const,
  },
] as const;

export function projectRefFromUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}
