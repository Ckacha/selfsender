<script>
  import { onMount } from 'svelte';
  import Nav from '../lib/Nav.svelte';
  import SendForm from '../lib/SendForm.svelte';
  import AiConnect from '../lib/AiConnect.svelte';
  import { loadProfile } from '../lib/session.js';

  let connected = $state(null);

  onMount(async () => {
    const profile = await loadProfile();
    connected = Boolean(profile?.me);
  });
</script>

<svelte:head><title>selfsender: home</title></svelte:head>

<div class="page wide">
  <Nav />
  <h1>Message</h1>
  <p class="hint">
    Send a Slack DM to a list of recipients, as your own Slack account.
    {#if connected === true}
      <span class="status ok">Slack already connected</span>
    {:else if connected === false}
      <span class="status missing">Slack not connected.</span> <a href="/team/connect">Connect Slack</a>
    {/if}
  </p>

  <SendForm endpoint="/api/team/send" />

  <h2>Connect your AI</h2>
  <AiConnect />
</div>

<style>
  h2 { margin-top: 40px; }
  .status { font-weight: 600; }
  .status::before { content: ''; display: inline-block; width: 8px; height: 8px; margin: 0 6px 1px 4px; border-radius: 50%; }
  .status.ok { color: #1e8e3e; }
  .status.ok::before { background: #1e8e3e; }
  .status.missing { color: #d93025; }
  .status.missing::before { background: #d93025; }
</style>
