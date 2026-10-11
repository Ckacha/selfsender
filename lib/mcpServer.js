const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');
const { parseRecipients, sendToRecipients } = require('./slack');
const emojis = require('./emojis');
const allowlist = require('./allowlist');

function text(value) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

function errorText(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function formatResults(results, testRun) {
  const lines = results.details.map((d) => {
    if (d.status === 'failed') return `FAILED -> ${d.identifier}: ${d.error}`;
    if (d.status === 'dry-run') return `[test run] would message ${d.identifier} (${d.userId})`;
    return `sent -> ${d.identifier} (${d.userId})`;
  });
  lines.push('', `${testRun ? 'Test run, nothing sent. ' : ''}Sent: ${results.sent}, Failed: ${results.failed}`);
  return lines.join('\n');
}

function createMcpServer(user, { resolveSendToken }) {
  const server = new McpServer({ name: 'selfsender', version: '1.0.0' });
  const isOwner = user.role === 'owner';

  server.registerTool('whoami', {
    title: 'Who am I',
    description: 'Shows which selfsender account you are signed in as and how your messages will be sent.',
    annotations: { readOnlyHint: true },
  }, async () => {
    const info = { role: user.role, email: user.email, hackClubSlackId: user.hcSlackId || null };
    if (isOwner) {
      info.canSendAs = ['bot', 'user'];
    } else {
      const { slackUserId } = resolveSendToken(user, 'user');
      info.connectedSlackId = slackUserId || null;
      info.canSendAs = slackUserId ? ['yourself'] : [];
      if (!slackUserId) info.note = 'Connect Slack once on the website at /team before sending.';
    }
    return text(info);
  });

  server.registerTool('send_message', {
    title: 'Send Slack message',
    description: 'Sends the exact same Slack message to a list of people, as separate DMs or one group DM. '
      + 'Recipients can be Slack user IDs (U0123ABCD) or emails. Defaults to a test run that sends nothing; '
      + 'set test_run to false to actually send. Supports Slack emoji like :sk: in the message.',
    inputSchema: {
      recipients: z.union([z.string(), z.array(z.string())]).describe('Slack IDs or emails, as a list or a comma/newline separated string'),
      message: z.string().min(1).describe('The message text, Slack formatting and :emoji: allowed'),
      test_run: z.boolean().default(true).describe('true = only check recipients, send nothing'),
      group_dm: z.boolean().default(false).describe('true = one group DM with everyone (max 8 people) instead of separate DMs'),
      ...(isOwner ? {
        send_as: z.enum(['bot', 'user']).default('bot').describe('bot = the selfsender app, user = your own Slack account'),
        bot_name: z.string().optional().describe('Display name override, bot only'),
        bot_icon: z.string().optional().describe('Icon override, an :emoji: or image URL, bot only'),
      } : {}),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async (args) => {
    const recipients = Array.isArray(args.recipients)
      ? args.recipients.map((r) => r.trim()).filter(Boolean)
      : parseRecipients(args.recipients);
    if (!recipients.length) return errorText('No valid recipients.');

    const sendAs = isOwner ? args.send_as : 'user';
    const { token, error } = resolveSendToken(user, sendAs);
    if (!token) return errorText(error);

    const icon = (sendAs === 'bot' && args.bot_icon) || '';
    try {
      const results = await sendToRecipients({
        token,
        recipients,
        message: args.message.trim(),
        dryRun: args.test_run,
        groupDm: args.group_dm,
        username: (sendAs === 'bot' && args.bot_name) || undefined,
        iconEmoji: icon.startsWith(':') ? icon : undefined,
        iconUrl: icon && !icon.startsWith(':') ? icon : undefined,
      });
      return text(formatResults(results, args.test_run));
    } catch (err) {
      return errorText(err.message);
    }
  });

  server.registerTool('search_emoji', {
    title: 'Search emoji',
    description: 'Finds Hack Club Slack emoji (custom and standard) by name, to use as :name: in a message.',
    inputSchema: { query: z.string().min(1).describe('Part of the emoji name, e.g. "sk"') },
    annotations: { readOnlyHint: true },
  }, async ({ query }) => {
    const found = await emojis.search(query.replace(/:/g, ''), 20);
    return text(found.length ? found.map((e) => `:${e.name}:`).join('\n') : 'No matches.');
  });

  if (isOwner) {
    server.registerTool('list_invites', {
      title: 'List invites',
      description: 'Lists the emails and Slack IDs invited to use selfsender.',
      annotations: { readOnlyHint: true },
    }, async () => {
      const ids = allowlist.list();
      return text(ids.length ? ids.join('\n') : 'Nobody invited yet.');
    });
  }

  return server;
}

module.exports = { createMcpServer };
