type RefreshSession = () => Promise<void>;
type DecideNavigation = (authenticated: boolean) => void;

const flows = new Map<string, Promise<void>>();

export function runConsumeFlowOnce(
  token: string,
  refreshSession: RefreshSession,
  decideNavigation: DecideNavigation,
) {
  const existing = flows.get(token);
  if (existing) return existing;
  const flow = (async () => {
    let authenticated = false;
    try {
      const response = await fetch('/api/v1/auth/magic-link/consume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
        cache: 'no-store',
      });
      if (response.ok) {
        await refreshSession();
        authenticated = true;
      }
    } catch {
      authenticated = false;
    }
    decideNavigation(authenticated);
  })().finally(() => {
    flows.delete(token);
  });
  flows.set(token, flow);
  return flow;
}

export function resetConsumeRequestsForTests() {
  flows.clear();
}
