type PilotResultTone = 'success' | 'warning' | 'error' | 'info';

const homeworkResultTones = {
  homework_updated_no_email: 'success',
  homework_updated_notified: 'success',
  homework_updated_already_notified: 'success',
  homework_unchanged: 'info',
  homework_updated_no_recipients: 'info',
  homework_updated_partial: 'warning',
  homework_updated_ambiguous: 'warning',
  homework_updated_not_retryable: 'warning',
  homework_updated_notification_in_progress: 'warning',
  homework_updated_failed: 'error',
  homework_updated_preparation_failed: 'error',
} as const satisfies Record<string, PilotResultTone>;

export function pilotResultPresentation(code: string): {
  tone: PilotResultTone;
  key: string;
} {
  if (Object.prototype.hasOwnProperty.call(homeworkResultTones, code))
    return {
      tone: homeworkResultTones[code as keyof typeof homeworkResultTones],
      key: `pilot.messages.${code}`,
    };
  if (code === 'notifications_submitted' || code === 'draft_saved')
    return { tone: 'success', key: `pilot.messages.${code}` };
  if (code === 'notification_ambiguous' || code === 'notification_in_progress')
    return { tone: 'warning', key: `pilot.messages.${code}` };
  if (code === 'notification_partial') return { tone: 'warning', key: `pilot.messages.${code}` };
  if (
    code === 'notification_failed' ||
    code === 'notification_preparation_failed' ||
    code === 'notification_request_failed' ||
    code === 'saveError'
  )
    return { tone: 'error', key: `pilot.messages.${code}` };
  if (code === 'submitted') return { tone: 'success', key: 'pilot.notification.submitted' };
  if (code === 'ambiguous') return { tone: 'warning', key: 'pilot.notification.ambiguous' };
  if (code === 'failed') return { tone: 'error', key: 'pilot.notification.failed' };
  if (code === 'preparationFailed')
    return { tone: 'error', key: 'pilot.notification.preparationFailed' };
  return {
    tone: 'info',
    key:
      code === 'noRecipients' || code === 'alreadyNotified'
        ? `pilot.notification.${code}`
        : `pilot.messages.${code}`,
  };
}

export async function requestNotificationAction(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  try {
    const response = await fetcher(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
    });
    const value = (await response.json().catch(() => null)) as {
      ok?: boolean;
      aggregate?: { code?: unknown };
    } | null;
    return response.ok && value?.ok === true && typeof value.aggregate?.code === 'string'
      ? value.aggregate.code
      : 'notification_request_failed';
  } catch {
    return 'notification_request_failed';
  }
}
