import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { safeAccent } from '../lib/utils';
export function OrganizationIdentity({
  name,
  logoUrl,
  accent,
}: {
  name: string;
  logoUrl?: string;
  accent?: string;
}) {
  const [failed, setFailed] = useState(false);
  const color = safeAccent(accent);
  return (
    <div
      className="org-identity"
      style={color ? ({ '--organization-accent': color } as React.CSSProperties) : undefined}
    >
      {logoUrl && !failed ? (
        <img src={logoUrl} alt="" onError={() => setFailed(true)} className="org-logo" />
      ) : (
        <span className="org-logo org-fallback">
          <Building2 className="size-4" />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
    </div>
  );
}
