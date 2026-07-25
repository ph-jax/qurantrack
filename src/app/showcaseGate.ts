export const isUiPreviewEnabled = (development: boolean, explicitFlag?: string) =>
  development || explicitFlag === 'true';

export const showcasePaths = (enabled: boolean) =>
  enabled ? ['/ui-preview', '/ui-preview/login'] : [];
