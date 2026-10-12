const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebClient } = require('@slack/web-api');
const { resolveUserId } = require('./slack');

const INVITES_FILE = path.join(__dirname, '..', 'team-invites.json');
const DECLINE_ACTION = 'invite_decline';
const ACCEPT_ACTION = 'invite_accept';

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(INVITES_FILE, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch (err) {
    return {};
  }
}

function save() {
  fs.writeFileSync(INVITES_FILE, JSON.stringify(invites, null, 2));
}

let invites = load();
let ownerSlackId = process.env.OWNER_SLACK_ID || null;

function get(token) {
  return typeof token === 'string' && Object.hasOwn(invites, token) ? invites[token] : null;
}

function removeForEntry(entry) {
  const before = Object.keys(invites).length;
  for (const [token, invite] of Object.entries(invites)) {
    if (invite.entry === entry) delete invites[token];
  }
  if (Object.keys(invites).length !== before) save();
}

function inviteBlocks(token, baseUrl) {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: "You've been invited to use *selfsender*. Press the button below to log in." },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          style: 'primary',
          text: { type: 'plain_text', text: 'Accept' },
          action_id: ACCEPT_ACTION,
          url: `${baseUrl}/invite/accept/${token}`,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Decline' },
          action_id: DECLINE_ACTION,
          value: token,
        },
      ],
    },
  ];
}

async function send(entry, baseUrl) {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) throw new Error('SLACK_BOT_TOKEN is not set on the server.');

  const client = new WebClient(botToken);
  const slackUserId = await resolveUserId(client, entry, new Map());
  const im = await client.conversations.open({ users: slackUserId });
  const token = crypto.randomBytes(24).toString('hex');
  const posted = await client.chat.postMessage({
    channel: im.channel.id,
    text: `You've been invited to use selfsender. Log in at ${baseUrl}/login`,
    blocks: inviteBlocks(token, baseUrl),
  });

  removeForEntry(entry);
  invites[token] = { entry, slackUserId, channel: im.channel.id, ts: posted.ts, status: 'pending', createdAt: Date.now() };
  save();
  return slackUserId;
}

async function findOwnerSlackId() {
  if (ownerSlackId) return ownerSlackId;
  if (!process.env.SLACK_USER_TOKEN) return null;
  const me = await new WebClient(process.env.SLACK_USER_TOKEN).auth.test();
  ownerSlackId = me.user_id;
  return ownerSlackId;
}

async function respond(token, status, baseUrl) {
  const invite = get(token);
  if (!invite || invite.status !== 'pending') return invite;

  invite.status = status;
  save();

  const client = new WebClient(process.env.SLACK_BOT_TOKEN);
  const accepted = status === 'accepted';
  const text = accepted
    ? `You accepted the invite to selfsender. Log in any time at ${baseUrl}/login`
    : 'Okay, no worries.';

  try {
    await client.chat.update({ channel: invite.channel, ts: invite.ts, text, blocks: [] });
  } catch (err) {
    console.error(`Couldn't update the invite message: ${err.data?.error || err.message}`);
  }

  try {
    const owner = await findOwnerSlackId();
    if (owner) {
      const im = await client.conversations.open({ users: owner });
      await client.chat.postMessage({
        channel: im.channel.id,
        text: `<@${invite.slackUserId}> (${invite.entry}) ${accepted ? 'accepted' : 'declined'} your selfsender invite.`,
      });
    }
  } catch (err) {
    console.error(`Couldn't tell the owner about the invite reply: ${err.data?.error || err.message}`);
  }

  return invite;
}

function verifySignature(signingSecret, timestamp, signature, rawBody) {
  if (!signingSecret || !timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = `v0=${crypto.createHmac('sha256', signingSecret).update(`v0:${timestamp}:${rawBody}`).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { send, respond, get, removeForEntry, verifySignature, DECLINE_ACTION };
