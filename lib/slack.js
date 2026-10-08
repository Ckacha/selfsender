const { WebClient } = require('@slack/web-api');

function isSlackUserId(value) {
  return /^[UW][A-Z0-9]{6,}$/.test(value);
}

async function resolveUserId(client, identifier, cache) {
  if (isSlackUserId(identifier)) return identifier;
  if (cache.has(identifier)) return cache.get(identifier);

  const result = await client.users.lookupByEmail({ email: identifier });
  const userId = result.user.id;
  cache.set(identifier, userId);
  return userId;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRecipients(raw) {
  return raw
    .split(/[,\n\r]+/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

const MAX_GROUP_DM_RECIPIENTS = 8;

async function postToChannel(client, channel, { message, file, username, iconEmoji, iconUrl }) {
  const customIdentity = Boolean(username || iconEmoji || iconUrl);
  if (!file || customIdentity) {
    const postArgs = { channel, text: message };
    if (username) postArgs.username = username;
    if (iconEmoji) postArgs.icon_emoji = iconEmoji;
    else if (iconUrl) postArgs.icon_url = iconUrl;
    await client.chat.postMessage(postArgs);
  }
  if (file) {
    const uploadArgs = { channel_id: channel, file: file.data, filename: file.name };
    if (!customIdentity) uploadArgs.initial_comment = message;
    await client.files.uploadV2(uploadArgs);
  }
}

async function sendToRecipients({ token, recipients, message, delayMs = 1200, dryRun = false, onResult, username, iconEmoji, iconUrl, file, groupDm = false }) {
  const client = new WebClient(token);
  const cache = new Map();
  const results = { sent: 0, failed: 0, details: [] };
  const content = { message, file, username, iconEmoji, iconUrl };

  function record(entry) {
    if (entry.status === 'failed') results.failed += 1;
    else results.sent += 1;
    results.details.push(entry);
    if (onResult) onResult(entry);
  }

  if (groupDm) {
    if (recipients.length > MAX_GROUP_DM_RECIPIENTS) {
      throw new Error(`A group DM can have at most ${MAX_GROUP_DM_RECIPIENTS} people (you listed ${recipients.length}). Use separate DMs instead.`);
    }
    const resolved = [];
    const failures = [];
    for (const identifier of recipients) {
      try {
        resolved.push({ identifier, userId: await resolveUserId(client, identifier, cache) });
      } catch (err) {
        failures.push({ identifier, status: 'failed', error: err.data?.error || err.message });
      }
    }
    if (resolved.length && !dryRun) {
      try {
        const group = await client.conversations.open({ users: resolved.map((r) => r.userId).join(',') });
        await postToChannel(client, group.channel.id, content);
      } catch (err) {
        const error = err.data?.error || err.message;
        for (const r of resolved) failures.push({ identifier: r.identifier, status: 'failed', error });
        resolved.length = 0;
      }
    }
    for (const r of resolved) record({ ...r, status: dryRun ? 'dry-run' : 'sent' });
    for (const f of failures) record(f);
    return results;
  }

  for (const identifier of recipients) {
    let entry;
    try {
      const userId = await resolveUserId(client, identifier, cache);

      if (!dryRun) {
        const im = await client.conversations.open({ users: userId });
        await postToChannel(client, im.channel.id, content);
      }

      entry = { identifier, userId, status: dryRun ? 'dry-run' : 'sent' };
    } catch (err) {
      entry = { identifier, status: 'failed', error: err.data?.error || err.message };
    }

    record(entry);

    if (!dryRun) await sleep(delayMs);
  }

  return results;
}

module.exports = { isSlackUserId, resolveUserId, sleep, parseRecipients, sendToRecipients };
