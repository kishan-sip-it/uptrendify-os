import { SettingsClient } from '@/components/settings/settings-client';
import { BrandDangerZone } from '@/components/settings/brand-danger-zone';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <>
      <SettingsClient />
      <div className="settings-page" style={{ paddingTop: 0 }}>
        <BrandDangerZone />
      </div>
    </>
  );
}
