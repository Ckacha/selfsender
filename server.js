require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const { WebClient } = require('@slack/web-api');
const { parseRecipients, sendToRecipients, isSlackUserId } = require('./lib/slack');
const tokenStore = require('./lib/tokenStore');
const allowlist = require('./lib/allowlist');
const emojis = require('./lib/emojis');

const app = express();
app.use(express.json({ limit: '15mb' }));

const port = process.env.PORT || 3000;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
const REDIRECT_URI = `${PUBLIC_BASE_URL}/slack/oauth/callback`;
const BOT_SCOPES = 'chat:write,users:read,users:read.email,im:write,mpim:write,files:write,chat:write.customize';
const USER_SCOPES = 'chat:write,users:read,users:read.email,im:write,mpim:write,files:write';
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function parseFile(file) {
  if (!file) return undefined;
  if (typeof file.name !== 'string' || typeof file.data !== 'string') {
    throw new Error('file must be { name, data } with base64 data.');
  }
  const data = Buffer.from(file.data, 'base64');
  if (data.length > MAX_FILE_BYTES) throw new Error('File is too big (10 MB max).');
  return { name: file.name.slice(0, 200), data };
}

// hc login
const HACKCLUB_CLIENT_ID = process.env.HACKCLUB_CLIENT_ID;
const HACKCLUB_CLIENT_SECRET = process.env.HACKCLUB_CLIENT_SECRET;
const ALLOWED_HACKCLUB_EMAIL = (process.env.ALLOWED_HACKCLUB_EMAIL || '').toLowerCase();
const HACKCLUB_AUTH_BASE = 'https://auth.hackclub.com';
const HC_REDIRECT_URI = `${PUBLIC_BASE_URL}/auth/callback`;
const LOGIN_STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_SECURE = PUBLIC_BASE_URL.startsWith('https://');

const pendingLogins = new Map();
const sessions = new Map();

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function getCookie(req, name) {
  const header = req.headers.cookie || '';
  const match = header.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

function buildSessionCookie(sid) {
  const parts = [`sid=${sid}`, 'HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${SESSION_TTL_MS / 1000}`];
  if (COOKIE_SECURE) parts.push('Secure');
  return parts.join('; ');
}

function clearSessionCookie() {
  const parts = ['sid=', 'HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=0'];
  if (COOKIE_SECURE) parts.push('Secure');
  return parts.join('; ');
}

function getSession(req) {
  const sid = getCookie(req, 'sid');
  const session = sid && sessions.get(sid);
  if (!session || Date.now() - session.createdAt >= SESSION_TTL_MS) return null;
  return session;
}

function requireOwner(req, res, next) {
  const session = getSession(req);
  if (session && session.role === 'owner') {
    req.session = session;
    return next();
  }

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Not authenticated. Refresh and log in again.' });
  }
  return res.redirect('/login');
}

function requireMember(req, res, next) {
  const session = getSession(req);
  if (session && session.role === 'member' && isMemberInvited(session)) {
    req.session = session;
    return next();
  }

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Not authenticated. Refresh and log in again.' });
  }
  return res.redirect('/login');
}

function isMemberInvited(session) {
  return allowlist.isInvited(session.email, session.hcSlackId, session.slackUserId);
}

app.get('/login', (req, res) => {
  if (!HACKCLUB_CLIENT_ID) {
    return res.status(500).send('HACKCLUB_CLIENT_ID is not set on the server. See README for setup.');
  }
  const state = crypto.randomBytes(16).toString('hex');
  pendingLogins.set(state, { createdAt: Date.now() });
  const url = new URL(`${HACKCLUB_AUTH_BASE}/oauth/authorize`);
  url.searchParams.set('client_id', HACKCLUB_CLIENT_ID);
  url.searchParams.set('redirect_uri', HC_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'profile email slack_id');
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

app.get('/auth/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).send(`Hack Club Auth returned an error: ${error}`);
  }
  const pending = state && pendingLogins.get(state);
  if (!pending || Date.now() - pending.createdAt > LOGIN_STATE_TTL_MS) {
    return res.status(400).send('Login link expired or invalid. Go back to <a href="/login">/login</a> and try again.');
  }
  pendingLogins.delete(state);
  if (!code) {
    return res.status(400).send('Missing code.');
  }

  if (!HACKCLUB_CLIENT_ID || !HACKCLUB_CLIENT_SECRET) {
    return res.status(500).send('HACKCLUB_CLIENT_ID/HACKCLUB_CLIENT_SECRET are not set on the server.');
  }

  try {
    const tokenResp = await fetch(`${HACKCLUB_AUTH_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: HACKCLUB_CLIENT_ID,
        client_secret: HACKCLUB_CLIENT_SECRET,
        redirect_uri: HC_REDIRECT_URI,
        code,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenResp.json();
    if (!tokenResp.ok || !tokenData.access_token) {
      return res.status(400).send("Hack Club Auth didn't confirm your identity. Please try again.");
    }

    const meResp = await fetch(`${HACKCLUB_AUTH_BASE}/api/v1/me`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const me = await meResp.json();
    const email = ((me.identity && me.identity.primary_email) || '').toLowerCase();
    const hcSlackId = (me.identity && me.identity.slack_id) || null;

    if (ALLOWED_HACKCLUB_EMAIL && email && email === ALLOWED_HACKCLUB_EMAIL) {
      const sid = crypto.randomBytes(24).toString('hex');
      sessions.set(sid, { role: 'owner', email, createdAt: Date.now() });
      res.setHeader('Set-Cookie', buildSessionCookie(sid));
      return res.redirect('/home');
    }

    if (allowlist.isInvited(email, hcSlackId)) {
      const sid = crypto.randomBytes(24).toString('hex');
      const slackUserId = hcSlackId && tokenStore.get(hcSlackId) ? hcSlackId : null;
      sessions.set(sid, { role: 'member', email, hcSlackId, slackUserId, createdAt: Date.now() });
      res.setHeader('Set-Cookie', buildSessionCookie(sid));
      return res.redirect('/team');
    }

    console.warn(`Rejected selfsender login attempt from ${email || '(no email returned)'} / ${hcSlackId || '(no slack id)'}`);
    return res.status(403).send(
      `Not invited. Ask the admin to invite your email <strong>${escapeHtml(email || '(none)')}</strong>`
      + (hcSlackId ? ` or Slack ID <strong>${escapeHtml(hcSlackId)}</strong>.` : '.')
    );
  } catch (err) {
    res.status(500).send(`Login failed: ${err.message}`);
  }
});

app.get('/logout', (req, res) => {
  const sid = getCookie(req, 'sid');
  if (sid) sessions.delete(sid);
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.redirect('/');
});

// -team login but honestly just make it slack user gated
const TEAM_REDIRECT_URI = `${PUBLIC_BASE_URL}/team/oauth/callback`;
const pendingTeamLogins = new Map();

app.get('/team/login', (req, res) => {
  res.redirect('/login');
});

app.get('/team/connect', requireMember, (req, res) => {
  if (!process.env.SLACK_CLIENT_ID) {
    return res.status(500).send('SLACK_CLIENT_ID is not set on the server. See README for setup.');
  }
  const state = crypto.randomBytes(16).toString('hex');
  pendingTeamLogins.set(state, { createdAt: Date.now() });
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', process.env.SLACK_CLIENT_ID);
  url.searchParams.set('user_scope', USER_SCOPES);
  url.searchParams.set('redirect_uri', TEAM_REDIRECT_URI);
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

app.get('/team/oauth/callback', requireMember, async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).send(`Slack returned an error: ${escapeHtml(error)}`);
  }
  const pending = state && pendingTeamLogins.get(state);
  if (!pending || Date.now() - pending.createdAt > LOGIN_STATE_TTL_MS) {
    return res.status(400).send('Link expired or invalid. Go back to <a href="/team/connect">/team/connect</a> and try again.');
  }
  pendingTeamLogins.delete(state);
  if (!code) {
    return res.status(400).send('Missing code.');
  }

  if (!process.env.SLACK_CLIENT_ID || !process.env.SLACK_CLIENT_SECRET) {
    return res.status(500).send('SLACK_CLIENT_ID/SLACK_CLIENT_SECRET are not set on the server.');
  }

  try {
    const client = new WebClient();
    const result = await client.oauth.v2.access({
      client_id: process.env.SLACK_CLIENT_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: TEAM_REDIRECT_URI,
    });

    const slackUserId = result.authed_user && result.authed_user.id;
    const userToken = result.authed_user && result.authed_user.access_token;
    if (!slackUserId || !userToken) {
      return res.status(400).send("Slack didn't return a user token. Try again.");
    }

    if (req.session.hcSlackId && req.session.hcSlackId !== slackUserId) {
      return res.status(403).send(
        `That Slack account (${escapeHtml(slackUserId)}) isn't the one linked to your Hack Club account (${escapeHtml(req.session.hcSlackId)}). `
        + '<a href="/team/connect">Try again</a> with the right account.'
      );
    }

    tokenStore.set(slackUserId, userToken);
    req.session.slackUserId = slackUserId;
    res.redirect('/team');
  } catch (err) {
    res.status(500).send(`Slack connect failed: ${escapeHtml(err.data?.error || err.message)}`);
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

app.get('/home', requireOwner, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.get('/message', requireOwner, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'message.html'));
});

app.get('/access', requireOwner, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'access.html'));
});

app.get('/style.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'style.css'));
});

app.get('/api/status', requireOwner, (req, res) => {
  res.json({
    email: req.session.email,
    botToken: Boolean(process.env.SLACK_BOT_TOKEN),
    userToken: Boolean(process.env.SLACK_USER_TOKEN),
    invites: allowlist.list().length,
  });
});

app.get('/team', requireMember, (req, res) => {
  if (!req.session.slackUserId || !tokenStore.get(req.session.slackUserId)) {
    return res.redirect('/team/connect');
  }
  res.sendFile(path.join(__dirname, 'public', 'team.html'));
});

function requireAnyUser(req, res, next) {
  const session = getSession(req);
  const ok = session && (session.role === 'owner'
    || (session.role === 'member' && isMemberInvited(session)));
  if (ok) return next();
  return res.status(401).json({ error: 'Not authenticated. Refresh and log in again.' });
}

app.get('/emoji-picker.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'emoji-picker.js'));
});

app.get('/api/emojis', requireAnyUser, async (req, res) => {
  try {
    res.json({ emojis: await emojis.search(String(req.query.q || '')) });
  } catch (err) {
    res.status(502).json({ error: `Couldn't load emojis: ${err.message}` });
  }
});

app.get('/api/emojis/lookup', requireAnyUser, async (req, res) => {
  const names = String(req.query.names || '').split(',').filter(Boolean).slice(0, 200);
  try {
    res.json({ emojis: await emojis.lookup(names) });
  } catch (err) {
    res.status(502).json({ error: `Couldn't load emojis: ${err.message}` });
  }
});

app.get('/api/allowlist', requireOwner, (req, res) => {
  res.json({ ids: allowlist.list() });
});

app.post('/api/allowlist', requireOwner, (req, res) => {
  const { id } = req.body || {};
  if (typeof id !== 'string' || !id.trim()) {
    return res.status(400).json({ error: 'An email or Slack ID is required.' });
  }
  try {
    const ids = allowlist.add(id);
    res.json({ ids });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/allowlist/:id', requireOwner, (req, res) => {
  const ids = allowlist.remove(req.params.id);
  if (isSlackUserId(req.params.id.toUpperCase())) tokenStore.remove(req.params.id.toUpperCase());
  res.json({ ids });
});

app.post('/api/team/send', requireMember, async (req, res) => {
  const { recipients: recipientsRaw, message, dryRun, delayMs, groupDm } = req.body || {};

  const token = tokenStore.get(req.session.slackUserId);
  if (!token) {
    return res.status(401).json({ error: 'No stored Slack token for your account. Connect Slack again at /team/connect.' });
  }

  if (typeof recipientsRaw !== 'string' || !recipientsRaw.trim()) {
    return res.status(400).json({ error: 'recipients is required (comma-separated Slack IDs or emails).' });
  }
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required.' });
  }

  const recipients = parseRecipients(recipientsRaw);
  if (recipients.length === 0) {
    return res.status(400).json({ error: 'No valid recipients found.' });
  }

  let file;
  try {
    file = parseFile(req.body.file);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const results = await sendToRecipients({
      token,
      recipients,
      message: message.trim(),
      delayMs: Number(delayMs) > 0 ? Number(delayMs) : 1200,
      dryRun: Boolean(dryRun),
      groupDm: Boolean(groupDm),
      file,
    });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// install for each user
let pendingState = null;

app.get('/slack/install', requireOwner, (req, res) => {
  if (!process.env.SLACK_CLIENT_ID) {
    return res.status(500).send('SLACK_CLIENT_ID is not set on the server. See README for setup.');
  }
  pendingState = crypto.randomBytes(16).toString('hex');
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', process.env.SLACK_CLIENT_ID);
  url.searchParams.set('scope', BOT_SCOPES);
  url.searchParams.set('user_scope', USER_SCOPES);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('state', pendingState);
  res.redirect(url.toString());
});

function updateEnvFile(updates) {
  const envPath = path.join(__dirname, '.env');
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = existing.split(/\r?\n/);
  const seen = new Set();

  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (match && Object.prototype.hasOwnProperty.call(updates, match[1])) {
      seen.add(match[1]);
      return `${match[1]}=${updates[match[1]]}`;
    }
    return line;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) nextLines.push(`${key}=${value}`);
  }

  fs.writeFileSync(envPath, nextLines.join('\n'));
}

app.get('/slack/oauth/callback', requireOwner, async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).send(`Slack returned an error: ${error}`);
  }
  if (!pendingState || state !== pendingState) {
    return res.status(400).send('Invalid or expired state. Start over at /slack/install.');
  }
  pendingState = null;

  if (!process.env.SLACK_CLIENT_ID || !process.env.SLACK_CLIENT_SECRET) {
    return res.status(500).send('SLACK_CLIENT_ID/SLACK_CLIENT_SECRET are not set on the server.');
  }

  try {
    const client = new WebClient();
    const result = await client.oauth.v2.access({
      client_id: process.env.SLACK_CLIENT_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
    });

    const botToken = result.access_token;
    const userToken = result.authed_user && result.authed_user.access_token;

    updateEnvFile({
      ...(botToken ? { SLACK_BOT_TOKEN: botToken } : {}),
      ...(userToken ? { SLACK_USER_TOKEN: userToken } : {}),
    });

    res.send(`
      <p>Installed to <strong>${result.team && result.team.name}</strong>.</p>
      <p>Bot token: ${botToken ? 'saved to .env' : 'not granted'}</p>
      <p>User token: ${userToken ? 'saved to .env' : 'not granted'}</p>
      <p><strong>Restart the server</strong> for the new tokens to take effect (dotenv only loads at startup), then close this tab.</p>
    `);
  } catch (err) {
    res.status(500).send(`OAuth exchange failed: ${err.data?.error || err.message}`);
  }
});

app.post('/api/send', requireOwner, async (req, res) => {
  const { recipients: recipientsRaw, message, dryRun, delayMs, tokenType, username, iconEmoji, iconUrl, groupDm } = req.body || {};

  const asUser = tokenType === 'user';
  const token = asUser ? process.env.SLACK_USER_TOKEN : process.env.SLACK_BOT_TOKEN;
  if (!token) {
    const varName = asUser ? 'SLACK_USER_TOKEN' : 'SLACK_BOT_TOKEN';
    return res.status(500).json({ error: `${varName} is not set on the server.` });
  }

  if (typeof recipientsRaw !== 'string' || !recipientsRaw.trim()) {
    return res.status(400).json({ error: 'recipients is required (comma-separated Slack IDs or emails).' });
  }
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required.' });
  }

  const recipients = parseRecipients(recipientsRaw);
  if (recipients.length === 0) {
    return res.status(400).json({ error: 'No valid recipients found.' });
  }

  let file;
  try {
    file = parseFile(req.body.file);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if ((username || iconEmoji || iconUrl) && asUser) {
    return res.status(400).json({ error: 'username/iconEmoji/iconUrl require tokenType "bot" (Slack only allows per-message name/icon overrides for bot tokens with chat:write.customize).' });
  }

  try {
    const results = await sendToRecipients({
      token,
      recipients,
      message: message.trim(),
      delayMs: Number(delayMs) > 0 ? Number(delayMs) : 1200,
      dryRun: Boolean(dryRun),
      username: username || undefined,
      iconEmoji: iconEmoji || undefined,
      iconUrl: iconUrl || undefined,
      groupDm: Boolean(groupDm),
      file,
    });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`selfsender web UI running at http://localhost:${port}`);
  emojis.ensureLoaded().catch((err) => console.error(`Emoji preload failed: ${err.message}`));
});
