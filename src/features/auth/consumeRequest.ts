const requests = new Map<string, Promise<boolean>>();

export function consumeMagicLinkOnce(token: string) {
  const existing = requests.get(token);
  if (existing) return existing;
  const request = fetch('/api/v1/auth/magic-link/consume', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
    cache: 'no-store',
  })
    .then((response) => response.ok)
    .catch(() => false);
  requests.set(token, request);
  return request;
}

export function resetConsumeRequestsForTests() {
  requests.clear();
}
