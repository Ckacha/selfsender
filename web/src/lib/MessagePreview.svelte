<script>
  import { onMount } from 'svelte';

  let { message = '', asBot = false, username = '', icon = '', file = null, groupDm = false } = $props();

  const TOKEN = /(:[a-z0-9_+'-]+:|(?<![\w*])\*[^*\n]+\*(?![\w*])|(?<![\w_])_[^_\n]+_(?![\w_])|(?<![\w~])~[^~\n]+~(?![\w~])|`[^`\n]+`)/gi;
  const EMOJI = /:([a-z0-9_+'-]+):/gi;
  const STYLES = { '*': 'bold', _: 'italic', '~': 'strike', '`': 'code' };

  let emojiUrls = $state({});
  let profile = $state({ me: null, bot: null });

  onMount(async () => {
    try {
      const res = await fetch('/api/profile');
      if (res.ok) profile = await res.json();
    } catch (err) {}
  });

  const iconEmoji = $derived(asBot && /^:[^:\s]+:$/.test(icon.trim()) ? icon.trim().slice(1, -1) : '');
  const iconUrl = $derived(asBot && /^https?:\/\//i.test(icon.trim()) ? icon.trim() : '');
  const sender = $derived(asBot ? profile.bot : profile.me);
  const name = $derived((asBot && username.trim()) || sender?.name || (asBot ? 'selfsender' : 'You'));
  const emojiNames = $derived([...new Set([...[...message.matchAll(EMOJI)].map((m) => m[1]), ...(iconEmoji ? [iconEmoji] : [])])]);
  const fileUrl = $derived(file && file.type.startsWith('image/') ? URL.createObjectURL(file) : '');

  const segments = $derived(
    message.split(TOKEN).map((part, i) => {
      if (i % 2 === 0) return { type: 'text', text: part };
      if (part[0] !== ':') return { type: STYLES[part[0]], text: part.slice(1, -1) };
      const emojiName = part.slice(1, -1);
      return emojiUrls[emojiName] ? { type: 'emoji', name: emojiName, url: emojiUrls[emojiName] } : { type: 'text', text: part };
    }).filter((s) => s.type === 'emoji' || s.text)
  );

  $effect(() => {
    const missing = emojiNames.filter((n) => !(n in emojiUrls));
    if (!missing.length) return;
    const timer = setTimeout(async () => {
      let found = {};
      try {
        const res = await fetch(`/api/emojis/lookup?names=${encodeURIComponent(missing.join(','))}`);
        found = (await res.json()).emojis || {};
      } catch (err) {}
      emojiUrls = { ...emojiUrls, ...Object.fromEntries(missing.map((n) => [n, found[n] || null])) };
    }, 250);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    const url = fileUrl;
    return () => { if (url) URL.revokeObjectURL(url); };
  });
</script>

<aside class="preview">
  <h2>Users receive:</h2>
  <div class="slack">
    <div class="avatar">
      {#if iconUrl}
        <img src={iconUrl} alt="">
      {:else if iconEmoji && emojiUrls[iconEmoji]}
        <img class="emoji-avatar" src={emojiUrls[iconEmoji]} alt="">
      {:else if sender?.image}
        <img src={sender.image} alt="">
      {:else}
        {name[0].toUpperCase()}
      {/if}
    </div>
    <div class="body">
      <div class="meta">
        <strong>{name}</strong>
        {#if asBot}<span class="badge">APP</span>{/if}
        <span class="time">now</span>
      </div>
      {#if message}
        <div class="text">
          {#each segments as s}
            {#if s.type === 'emoji'}<img class="emoji" src={s.url} alt=":{s.name}:" title=":{s.name}:">
            {:else if s.type === 'bold'}<strong>{s.text}</strong>
            {:else if s.type === 'italic'}<em>{s.text}</em>
            {:else if s.type === 'strike'}<s>{s.text}</s>
            {:else if s.type === 'code'}<code>{s.text}</code>
            {:else}{s.text}{/if}
          {/each}
        </div>
      {:else if !file}
        <div class="text empty">Your message will show up here.</div>
      {/if}
      {#if file}
        {#if fileUrl}
          <img class="attachment-image" src={fileUrl} alt={file.name}>
        {:else}
          <div class="attachment">{file.name}</div>
        {/if}
      {/if}
    </div>
  </div>
  <p class="hint">
    {groupDm ? 'Sent once, in a group DM with everyone on the list.' : 'Each person gets this in their own DM.'}
    {asBot ? 'It comes from the bot.' : 'It comes from your own Slack account.'}
  </p>
</aside>

<style>
  h2 { font-size: 1rem; margin: 0 0 8px; }
  .slack { display: flex; gap: 10px; padding: 12px; border: 1px solid #ddd; border-radius: 8px; background: #fff; }
  .avatar { width: 36px; height: 36px; flex: none; border-radius: 6px; background: #4a154b; color: #fff; font-weight: 700;
    display: grid; place-items: center; overflow: hidden; }
  .avatar img { width: 100%; height: 100%; object-fit: cover; }
  .avatar .emoji-avatar { width: 26px; height: 26px; object-fit: contain; }
  .avatar:has(.emoji-avatar) { background: #f0f0f0; }
  .body { flex: 1; min-width: 0; }
  .meta { display: flex; align-items: baseline; gap: 6px; }
  .badge { font-size: 0.6rem; font-weight: 700; padding: 1px 3px; border-radius: 2px; background: #e8e8e8; color: #555; }
  .time { font-size: 0.75rem; color: #777; }
  .text { margin-top: 2px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 0.95rem; line-height: 1.45; }
  .text.empty { color: #999; }
  .text code { padding: 1px 4px; border: 1px solid #ddd; border-radius: 3px; background: #f6f6f6; color: #c0143c; font-size: 0.85em; }
  .emoji { width: 22px; height: 22px; object-fit: contain; vertical-align: -5px; }
  .attachment { display: inline-block; margin-top: 8px; padding: 8px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 0.9rem;
    overflow-wrap: anywhere; }
  .attachment-image { display: block; margin-top: 8px; max-width: 100%; max-height: 220px; border-radius: 8px; border: 1px solid #ddd; }
</style>
