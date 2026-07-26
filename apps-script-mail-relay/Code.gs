const NONCE_TTL_SECONDS = 300;
const LIMITS = { recipient: 254, subject: 200, body: 50000, senderName: 120 };
const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function doPost(e) {
  try {
    // Do not access Google account or Gmail APIs until the request is authenticated.
    const staticConfig = getStaticRelayConfig_();
    const parameter = (e && e.parameter) || {};
    const timestampText = String(parameter.timestamp || '');
    const timestamp = Number(timestampText);
    const nonce = String(parameter.nonce || '');
    const signature = String(parameter.signature || '');
    const body = e && e.postData && e.postData.contents ? e.postData.contents : '';
    if (
      !staticConfig.secret ||
      !timestampText ||
      !Number.isFinite(timestamp) ||
      !nonce ||
      !signature ||
      !body
    )
      return json_({ ok: false, error: 'missing_auth' });
    if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > NONCE_TTL_SECONDS)
      return json_({ ok: false, error: 'expired' });
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(nonce)) return json_({ ok: false, error: 'invalid_nonce' });
    const expected = Utilities.base64EncodeWebSafe(
      Utilities.computeHmacSha256Signature(
        `${timestampText}.${nonce}.${body}`,
        staticConfig.secret,
      ),
    ).replace(/=+$/, '');
    if (!constantTimeEqual_(expected, signature))
      return json_({ ok: false, error: 'bad_signature' });

    const nonceError = claimAuthenticatedNonce_(nonce);
    if (nonceError) return json_({ ok: false, error: nonceError });

    let message;
    try {
      message = JSON.parse(body);
    } catch (_error) {
      return json_({ ok: false, error: 'malformed_json' });
    }
    const validationError = validateMessage_(message);
    if (validationError) return json_({ ok: false, error: validationError });

    const senderConfig = getSenderConfig_(staticConfig.approved);
    const sender = normalizeEmail_(message.fromAlias);
    const senderError = authorizeSender_(sender, senderConfig);
    if (senderError) return json_({ ok: false, error: senderError });

    const options = {
      replyTo: normalizeEmail_(message.replyTo),
      name: message.senderName.trim(),
    };
    if (sender !== senderConfig.primarySender) options.from = sender;
    GmailApp.sendEmail(normalizeEmail_(message.to), message.subject, message.text, options);
    return json_({ ok: true });
  } catch (_error) {
    // Never include message/configuration details in responses or logs.
    return json_({ ok: false, error: 'relay_unavailable' });
  }
}

function claimAuthenticatedNonce_(nonce) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return 'relay_busy';
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get(nonce)) return 'replay';
    cache.put(nonce, '1', NONCE_TTL_SECONDS);
    return null;
  } finally {
    lock.releaseLock();
  }
}

function getStaticRelayConfig_() {
  const props = PropertiesService.getScriptProperties();
  return {
    secret: props.getProperty('MAIL_RELAY_SECRET') || '',
    approved: parseEmailList_(props.getProperty('APPROVED_SENDER_ALIASES') || ''),
  };
}

function getSenderConfig_(approved) {
  return {
    primarySender: normalizeEmail_(Session.getEffectiveUser().getEmail()),
    approved,
    gmailAliases: GmailApp.getAliases().map(normalizeEmail_).filter(Boolean),
  };
}

function authorizeSender_(sender, config) {
  if (!sender) return 'invalid_from';
  // The executing account is a valid Gmail sender even though getAliases() omits it.
  if (sender === config.primarySender)
    return config.approved.indexOf(sender) >= 0 ? null : 'alias_not_allowed';
  return config.approved.indexOf(sender) >= 0 && config.gmailAliases.indexOf(sender) >= 0
    ? null
    : 'alias_not_allowed';
}

function validateMessage_(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return 'invalid_message';
  if (!validEmail_(message.to)) return 'invalid_recipient';
  if (!validEmail_(message.fromAlias)) return 'invalid_from';
  if (!validEmail_(message.replyTo)) return 'invalid_reply_to';
  if (
    typeof message.senderName !== 'string' ||
    !message.senderName.trim() ||
    message.senderName.trim().length > LIMITS.senderName
  )
    return 'invalid_sender_name';
  if (
    typeof message.subject !== 'string' ||
    !message.subject.trim() ||
    message.subject.length > LIMITS.subject
  )
    return 'invalid_subject';
  if (typeof message.text !== 'string' || !message.text || message.text.length > LIMITS.body)
    return 'invalid_body';
  return null;
}

function validEmail_(value) {
  return (
    typeof value === 'string' &&
    value.trim().length <= LIMITS.recipient &&
    EMAIL_ADDRESS.test(value.trim())
  );
}
function normalizeEmail_(value) {
  return typeof value === 'string' && validEmail_(value) ? value.trim().toLowerCase() : '';
}
function parseEmailList_(value) {
  return value.split(',').map(normalizeEmail_).filter(Boolean);
}
function constantTimeEqual_(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}
function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/** Sends a configuration test only to the deploying/executing account. Run manually in the editor. */
function sendTestEmail() {
  const staticConfig = getStaticRelayConfig_();
  const config = getSenderConfig_(staticConfig.approved);
  if (!config.primarySender || authorizeSender_(config.primarySender, config))
    throw new Error('Primary sender is not safely configured');
  GmailApp.sendEmail(
    config.primarySender,
    'QuranTrack relay configuration test',
    'The QuranTrack mail relay sender configuration is working.',
    {
      name: 'QuranTrack',
      replyTo: config.primarySender,
    },
  );
}
