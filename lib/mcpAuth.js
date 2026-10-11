const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { InvalidGrantError, InvalidTokenError } = require('@modelcontextprotocol/sdk/server/auth/errors.js');

const STORE_FILE = path.join(__dirname, '..', 'mcp-auth.json');
const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const PENDING_TTL_MS = 10 * 60 * 1000;

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    return { clients: data.clients || {}, accessTokens: data.accessTokens || {}, refreshTokens: data.refreshTokens || {} };
  } catch (err) {
    return { clients: {}, accessTokens: {}, refreshTokens: {} };
  }
}

let store = load();

function save() {
  const now = Date.now();
  for (const table of [store.accessTokens, store.refreshTokens]) {
    for (const [key, value] of Object.entries(table)) {
      if (value.expiresAt < now) delete table[key];
    }
  }
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

const pendingAuthorizations = new Map();
const authorizationCodes = new Map();

function createProvider({ isAllowed }) {
  function issueTokens(clientId, user, scopes) {
    const accessToken = randomToken();
    const refreshToken = randomToken();
    const now = Date.now();
    store.accessTokens[hash(accessToken)] = { clientId, user, scopes, expiresAt: now + ACCESS_TTL_MS };
    store.refreshTokens[hash(refreshToken)] = { clientId, user, scopes, expiresAt: now + REFRESH_TTL_MS };
    save();
    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: ACCESS_TTL_MS / 1000,
      refresh_token: refreshToken,
      scope: scopes.join(' '),
    };
  }

  return {
    clientsStore: {
      getClient(clientId) {
        return store.clients[clientId];
      },
      registerClient(client) {
        const full = { ...client, client_id: crypto.randomUUID(), client_id_issued_at: Math.floor(Date.now() / 1000) };
        store.clients[full.client_id] = full;
        save();
        return full;
      },
    },

    async authorize(client, params, res) {
      const pendingId = crypto.randomBytes(16).toString('hex');
      pendingAuthorizations.set(pendingId, { clientId: client.client_id, params, createdAt: Date.now() });
      res.redirect(`/login?mcp=${pendingId}`);
    },

    async challengeForAuthorizationCode(client, code) {
      const entry = authorizationCodes.get(code);
      if (!entry || entry.clientId !== client.client_id) throw new InvalidGrantError('Invalid authorization code');
      return entry.params.codeChallenge;
    },

    async exchangeAuthorizationCode(client, code, codeVerifier, redirectUri) {
      const entry = authorizationCodes.get(code);
      authorizationCodes.delete(code);
      if (!entry || entry.clientId !== client.client_id || Date.now() - entry.createdAt > PENDING_TTL_MS) {
        throw new InvalidGrantError('Invalid or expired authorization code');
      }
      if (redirectUri && redirectUri !== entry.params.redirectUri) {
        throw new InvalidGrantError('redirect_uri does not match');
      }
      return issueTokens(client.client_id, entry.user, entry.params.scopes || []);
    },

    async exchangeRefreshToken(client, refreshToken) {
      const key = hash(refreshToken);
      const entry = store.refreshTokens[key];
      if (!entry || entry.clientId !== client.client_id || entry.expiresAt < Date.now()) {
        throw new InvalidGrantError('Invalid or expired refresh token');
      }
      if (!isAllowed(entry.user)) {
        delete store.refreshTokens[key];
        save();
        throw new InvalidGrantError('Access was removed');
      }
      delete store.refreshTokens[key];
      return issueTokens(client.client_id, entry.user, entry.scopes);
    },

    async verifyAccessToken(token) {
      const entry = store.accessTokens[hash(token)];
      if (!entry || entry.expiresAt < Date.now()) throw new InvalidTokenError('Invalid or expired token');
      if (!isAllowed(entry.user)) throw new InvalidTokenError('Access was removed');
      return {
        token,
        clientId: entry.clientId,
        scopes: entry.scopes,
        expiresAt: Math.floor(entry.expiresAt / 1000),
        extra: { user: entry.user },
      };
    },

    async revokeToken(client, { token }) {
      const key = hash(token);
      delete store.accessTokens[key];
      delete store.refreshTokens[key];
      save();
    },
  };
}

function hasPending(pendingId) {
  const pending = pendingAuthorizations.get(pendingId);
  return Boolean(pending && Date.now() - pending.createdAt < PENDING_TTL_MS);
}

function completeAuthorization(pendingId, user) {
  const pending = pendingAuthorizations.get(pendingId);
  pendingAuthorizations.delete(pendingId);
  if (!pending || Date.now() - pending.createdAt > PENDING_TTL_MS) return null;

  const code = randomToken();
  authorizationCodes.set(code, { clientId: pending.clientId, params: pending.params, user, createdAt: Date.now() });

  const url = new URL(pending.params.redirectUri);
  url.searchParams.set('code', code);
  if (pending.params.state) url.searchParams.set('state', pending.params.state);
  return url.toString();
}

module.exports = { createProvider, hasPending, completeAuthorization };
