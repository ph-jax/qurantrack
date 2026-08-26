const NONCE_TTL_SECONDS = 300;
const LIMITS = { recipient: 254, subject: 200, body: 50000, senderName: 120 };
const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function doPost(e) {
  let stage = 'static_config';
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
      return relayResponse_({ ok: false, error: 'missing_auth' }, function () {
        stage = 'response_generation';
      });
    stage = 'authentication';
    if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > NONCE_TTL_SECONDS)
      return relayResponse_({ ok: false, error: 'expired' }, function () {
        stage = 'response_generation';
      });
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(nonce))
      return relayResponse_({ ok: false, error: 'invalid_nonce' }, function () {
        stage = 'response_generation';
      });
    const expected = Utilities.base64EncodeWebSafe(
      Utilities.computeHmacSha256Signature(
        `${timestampText}.${nonce}.${body}`,
        staticConfig.secret,
        Utilities.Charset.UTF_8,
      ),
    ).replace(/=+$/, '');
    if (!constantTimeEqual_(expected, signature))
      return relayResponse_({ ok: false, error: 'bad_signature' }, function () {
        stage = 'response_generation';
      });

    stage = 'nonce_claim';
    const nonceError = claimAuthenticatedNonce_(nonce);
    if (nonceError)
      return relayResponse_({ ok: false, error: nonceError }, function () {
        stage = 'response_generation';
      });

    stage = 'message_parse';
    let message;
    try {
      message = JSON.parse(body);
    } catch (_error) {
      return relayResponse_({ ok: false, error: 'malformed_json' }, function () {
        stage = 'response_generation';
      });
    }
    stage = 'message_validation';
    const validationError = validateMessage_(message);
    if (validationError)
      return relayResponse_({ ok: false, error: validationError }, function () {
        stage = 'response_generation';
      });

    stage = 'sender_config';
    const senderConfig = getSenderConfig_(staticConfig.approved);
    stage = 'sender_authorization';
    const sender = normalizeEmail_(message.fromAlias);
    const senderError = authorizeSender_(sender, senderConfig);
    if (senderError)
      return relayResponse_({ ok: false, error: senderError }, function () {
        stage = 'response_generation';
      });

    const options = buildGmailOptions_(message, sender, senderConfig);
    stage = 'gmail_send';
    GmailApp.sendEmail(normalizeEmail_(message.to), message.subject, message.text, options);
    return relayResponse_({ ok: true }, function () {
      stage = 'response_generation';
    });
  } catch (error) {
    logRelayFailure_('mail_relay_failure', stage, classifyRelayError_(error));
    // This remains ambiguous when Gmail send was entered, preventing unsafe retries.
    stage = 'response_generation';
    return json_({ ok: false, error: 'relay_unavailable' });
  }
}

function relayResponse_(value, beforeResponse) {
  beforeResponse();
  return json_(value);
}

function buildGmailOptions_(message, sender, senderConfig) {
  const options = {
    replyTo: normalizeEmail_(message.replyTo),
    name: message.senderName.trim(),
  };
  if (typeof message.html === 'string' && message.html) options.htmlBody = message.html;
  if (sender !== senderConfig.primarySender) options.from = sender;
  return options;
}

function classifyRelayError_(error) {
  const text = String((error && error.message) || error || '').toLowerCase();
  if (/authoriz|permission|scope|access denied/.test(text)) return 'gmail_authorization';
  if (/quota|daily limit|limit exceeded/.test(text)) return 'gmail_quota';
  if (/rate|too many|try again later/.test(text)) return 'gmail_rate_limit';
  if (/from address|sender|alias/.test(text)) return 'gmail_sender';
  if (/recipient|invalid (email|address)|no recipient/.test(text)) return 'gmail_recipient';
  if (/invalid argument|parameter|argument/.test(text)) return 'gmail_invalid_argument';
  if (/service unavailable|internal error|backend error|temporar/.test(text))
    return 'gmail_service_unavailable';
  return 'unknown';
}

function logRelayFailure_(event, stage, category) {
  console.error(JSON.stringify({ event, stage, category }));
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
  if (
    message.html !== undefined &&
    (typeof message.html !== 'string' || !message.html || message.html.length > LIMITS.body)
  )
    return 'invalid_html_body';
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

/**
 * Exercises the production sender and options path, but can only email the executing account.
 * Optional RELAY_TEST_FROM_ALIAS and RELAY_TEST_REPLY_TO script properties select the paths to
 * test; neither value is logged or returned.
 */
function sendControlledRelayTest() {
  let stage = 'static_config';
  try {
    const props = PropertiesService.getScriptProperties();
    const staticConfig = getStaticRelayConfig_();
    stage = 'sender_config';
    const config = getSenderConfig_(staticConfig.approved);
    const sender = normalizeEmail_(
      props.getProperty('RELAY_TEST_FROM_ALIAS') || config.primarySender,
    );
    const replyTo = normalizeEmail_(
      props.getProperty('RELAY_TEST_REPLY_TO') || config.primarySender,
    );
    stage = 'message_validation';
    const message = {
      to: config.primarySender,
      fromAlias: sender,
      replyTo,
      senderName: 'QuranTrack',
      subject: 'QuranTrack controlled relay test',
      text: 'This is a harmless controlled QuranTrack relay test.',
    };
    const validationError = validateMessage_(message);
    if (validationError) throw new Error('invalid argument');
    stage = 'sender_authorization';
    const senderError = authorizeSender_(sender, config);
    if (senderError) throw new Error('sender alias');
    const options = buildGmailOptions_(message, sender, config);
    stage = 'gmail_send';
    GmailApp.sendEmail(config.primarySender, message.subject, message.text, options);
    return { ok: true };
  } catch (error) {
    const category = classifyRelayError_(error);
    logRelayFailure_('controlled_mail_relay_test_failure', stage, category);
    throw new Error(`controlled_mail_relay_test_failed:${stage}:${category}`);
  }
}
