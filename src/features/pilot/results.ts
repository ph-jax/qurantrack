export function pilotResultPresentation(code: string): {
  tone: 'success' | 'warning' | 'error' | 'info';
  key: string;
} {
  if (code === 'notifications_submitted' || code === 'draft_saved')
    return { tone: 'success', key: `pilot.messages.${code}` };
  if (code === 'notification_ambiguous') return { tone: 'warning', key: `pilot.messages.${code}` };
  if (
    code === 'notification_failed' ||
    code === 'notification_preparation_failed' ||
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
