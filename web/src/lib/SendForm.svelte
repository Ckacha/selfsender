<script>
  import EmojiEditor from './EmojiEditor.svelte';
  import MessagePreview from './MessagePreview.svelte';

  let { endpoint, owner = false } = $props();

  const MAX_FILE_BYTES = 10 * 1024 * 1024;

  let recipients = $state('');
  let message = $state('');
  let sendMode = $state('separate');
  let picked = $state(null);
  let dragging = $state(false);
  let fileInput;
  let tokenType = $state('user');
  let username = $state('');
  let icon = $state('');
  let delayMs = $state(1200);
  let dryRun = $state(true);
  let results = $state(null);

  const asBot = $derived(owner && tokenType === 'bot');
  const tooBig = $derived(Boolean(picked) && picked.size > MAX_FILE_BYTES);

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function pick(fileList) {
    if (fileList && fileList[0]) picked = fileList[0];
  }

  function drop(e) {
    e.preventDefault();
    dragging = false;
    pick(e.dataTransfer.files);
  }

  function clearFile() {
    picked = null;
    fileInput.value = '';
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function send(e) {
    e.preventDefault();
    if (tooBig) {
      results = 'Error: File is too big (10 MB max).';
      return;
    }

    results = 'Sending...';
    const body = { recipients, message, dryRun, delayMs, groupDm: sendMode === 'group' };
    if (picked) body.file = { name: picked.name, data: await readFileAsBase64(picked) };
    if (owner) {
      const trimmedIcon = asBot ? icon.trim() : '';
      body.tokenType = tokenType;
      body.username = asBot ? username.trim() : '';
      body.iconEmoji = trimmedIcon.startsWith(':') ? trimmedIcon : '';
      body.iconUrl = trimmedIcon && !trimmedIcon.startsWith(':') ? trimmedIcon : '';
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        results = `Error: ${data.error}`;
        return;
      }

      const lines = data.details.map((d) => {
        if (d.status === 'failed') return `FAILED -> ${d.identifier}: ${d.error}`;
        if (d.status === 'dry-run') return `[test run] would message ${d.identifier} (${d.userId})`;
        return `sent -> ${d.identifier} (${d.userId})`;
      });
      lines.push('', `Done. Sent: ${data.sent}, Failed: ${data.failed}`);
      results = lines.join('\n');
    } catch (err) {
      results = `Error: ${err.message}`;
    }

  }
</script>

<div class="layout">
<div>
<form onsubmit={send}>
  <label for="recipients">Slack ID/email</label>
  <textarea id="recipients" rows="3" placeholder="U01ABCDEF2, someone@company.com, another.person@company.com" bind:value={recipients}></textarea>
  <div class="hint">Make sure the IDs/emails are comma separated!</div>

  <label for="message">Message</label>
  <EmojiEditor id="message" placeholder="What should be sent to these people?" bind:value={message} />
  <div class="hint">Slack emojis are supported (use <code>:</code>).</div>

  <label for="file">Attachment (optional)</label>
  <input type="file" id="file" class="file-input" bind:this={fileInput} onchange={(e) => pick(e.target.files)}>
  {#if picked}
    <div class="file-picked" class:too-big={tooBig}>
      <span class="file-name">{picked.name}</span>
      <span class="hint">{formatSize(picked.size)}{tooBig ? ', too big (10 MB max)' : ''}</span>
      <button type="button" onclick={clearFile}>Remove</button>
    </div>
  {:else}
    <label
      for="file"
      class="dropzone"
      class:dragging
      ondragover={(e) => { e.preventDefault(); dragging = true; }}
      ondragleave={() => { dragging = false; }}
      ondrop={drop}
    >
      <strong>Drop a file here</strong> or click to choose one
    </label>
  {/if}
  <div class="hint">Sent along with the message. 10 MB max.</div>

  <label for="sendMode">Send to</label>
  <select id="sendMode" bind:value={sendMode}>
    <option value="separate">Separate DMs (each person gets their own)</option>
    <option value="group">One group DM with everyone (max 8 people)</option>
  </select>

  {#if owner}
    <label for="tokenType">Send as</label>
    <select id="tokenType" bind:value={tokenType}>
      <option value="user">User account (SLACK_USER_TOKEN)</option>
      <option value="bot">Bot (SLACK_BOT_TOKEN)</option>
    </select>
  {/if}

  {#if asBot}
    <label for="username">Bot display name (optional)</label>
    <input type="text" id="username" placeholder="Leave blank to use your Slack name" bind:value={username}>
    <div class="hint">The bot posts under your Slack name and picture unless you set something else here. Requires the bot token to have the <code>chat:write.customize</code> scope.</div>

    <label for="icon">Bot icon (optional)</label>
    <input type="text" id="icon" placeholder="Leave blank to use your Slack picture, or :loudspeaker: / an image URL" bind:value={icon}>
    <div class="hint">
      Warning: this site only sends messages. It cannot show you replies. If a
      recipient responds, that reply lands in the bot's own DM with them
      inside Slack (visible to whoever has access to the bot/app there),
      not here. Check the bot's messages directly in Slack to see or answer replies.
    </div>
  {/if}

  <div class="send-options">
    <div class="delay">
      <label for="delayMs">Delay between sends (ms)</label>
      <input type="number" id="delayMs" min="0" bind:value={delayMs}>
    </div>
    <label class="test-run" for="dryRun">
      <input type="checkbox" id="dryRun" bind:checked={dryRun}>
      Test run (don't actually send)
    </label>
  </div>

  <button type="submit">Send</button>
</form>

{#if results !== null}
  <pre class="results">{results}</pre>
{/if}
</div>

<MessagePreview {message} {asBot} {username} {icon} file={picked} groupDm={sendMode === 'group'} />
</div>

<style>
  .layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 32px; align-items: start; }
  .layout > :global(aside) { position: sticky; top: 16px; margin-top: 16px; }
  @media (max-width: 860px) {
    .layout { grid-template-columns: minmax(0, 1fr); }
    .layout > :global(aside) { position: static; }
  }
  .send-options { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
  .delay { flex: 1; min-width: 180px; }
  .test-run { display: flex; align-items: center; gap: 10px; margin-top: 0; padding: 8px 0; cursor: pointer; }
  .test-run input { appearance: none; -webkit-appearance: none; width: 26px; height: 26px; margin: 0; padding: 0; flex: none;
    border: 2px solid #767676; border-radius: 50%; cursor: pointer; display: grid; place-content: center; }
  .test-run input:checked { border-color: #1a73e8; background: #1a73e8; }
  .test-run input:checked::after { content: ''; width: 10px; height: 10px; border-radius: 50%; background: #fff; }
  .test-run input:focus-visible { outline: 2px solid #1a73e8; outline-offset: 2px; }
  .file-input { position: absolute; width: 1px; height: 1px; padding: 0; border: 0; opacity: 0; overflow: hidden; }
  .dropzone { display: block; margin-top: 0; padding: 22px 16px; border: 2px dashed #bbb; border-radius: 8px; text-align: center;
    font-weight: normal; color: #555; cursor: pointer; }
  .dropzone:hover, .dropzone.dragging { border-color: #1a73e8; background: #f3f8ff; }
  .file-input:focus-visible + .dropzone { outline: 2px solid #1a73e8; outline-offset: 2px; }
  .file-picked { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid #ccc; border-radius: 8px; }
  .file-picked.too-big { border-color: #c00; }
  .file-picked .file-name { flex: 1; min-width: 0; overflow-wrap: anywhere; font-weight: 600; }
  .file-picked .hint { margin: 0; flex: none; }
  .file-picked button { margin-top: 0; }
  .results { margin-top: 24px; white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 0.85rem; background: #f5f5f5; padding: 12px; border-radius: 6px; }

</style>
