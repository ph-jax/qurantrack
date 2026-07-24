const NONCE_TTL_SECONDS = 300;

function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  const secret = props.getProperty('MAIL_RELAY_SECRET');
  const aliases = (props.getProperty('APPROVED_SENDER_ALIASES') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const timestamp = Number(e.parameter.timestamp || header(e, 'x-qurantrack-timestamp'));
  const nonce = e.parameter.nonce || header(e, 'x-qurantrack-nonce');
  const signature = e.parameter.signature || header(e, 'x-qurantrack-signature');
  const body = e.postData.contents;
  if (!secret || !timestamp || !nonce || !signature) return json(401, { ok: false });
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > NONCE_TTL_SECONDS)
    return json(401, { ok: false, error: 'expired' });
  const cache = CacheService.getScriptCache();
  if (cache.get(nonce)) return json(409, { ok: false, error: 'replay' });
  const expected = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(`${timestamp}.${nonce}.${body}`, secret),
  ).replace(/=+$/, '');
  if (expected !== signature) return json(401, { ok: false, error: 'bad_signature' });
  const message = JSON.parse(body);
  if (aliases.indexOf(message.fromAlias) === -1)
    return json(403, { ok: false, error: 'alias_not_allowed' });
  cache.put(nonce, '1', NONCE_TTL_SECONDS);
  GmailApp.sendEmail(message.to, message.subject, message.text, {
    from: message.fromAlias,
    replyTo: message.replyTo,
    name: 'QuranTrack',
  });
  return json(200, { ok: true });
}
function header(e, name) {
  return (e && e.headers && (e.headers[name] || e.headers[name.toLowerCase()])) || '';
}
function json(status, value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
