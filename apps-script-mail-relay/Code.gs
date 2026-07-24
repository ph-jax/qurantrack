const NONCE_TTL_SECONDS = 300;

function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  const secret = props.getProperty('MAIL_RELAY_SECRET');
  const aliases = (props.getProperty('APPROVED_SENDER_ALIASES') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const timestamp = Number((e.parameter && e.parameter.timestamp) || '');
  const nonce = (e.parameter && e.parameter.nonce) || '';
  const signature = (e.parameter && e.parameter.signature) || '';
  const body = e.postData && e.postData.contents ? e.postData.contents : '';
  if (!secret || !timestamp || !nonce || !signature || !body)
    return json({ ok: false, error: 'missing_auth' });
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > NONCE_TTL_SECONDS)
    return json({ ok: false, error: 'expired' });
  const cache = CacheService.getScriptCache();
  if (cache.get(nonce)) return json({ ok: false, error: 'replay' });
  const expected = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(`${timestamp}.${nonce}.${body}`, secret),
  ).replace(/=+$/, '');
  if (expected !== signature) return json({ ok: false, error: 'bad_signature' });
  const message = JSON.parse(body);
  if (aliases.indexOf(message.fromAlias) === -1)
    return json({ ok: false, error: 'alias_not_allowed' });
  cache.put(nonce, '1', NONCE_TTL_SECONDS);
  GmailApp.sendEmail(message.to, message.subject, message.text, {
    from: message.fromAlias,
    replyTo: message.replyTo,
    name: 'QuranTrack',
  });
  return json({ ok: true });
}
function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
