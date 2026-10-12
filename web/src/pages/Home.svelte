<script>
  import { onMount } from 'svelte';
  import Nav from '../lib/Nav.svelte';

  let status = $state(null);

  onMount(async () => {
    const res = await fetch('/api/status');
    status = await res.json();
  });
</script>

<svelte:head><title>selfsender: home</title></svelte:head>

<div class="page">
  <Nav active="/home" />
  <h1>Home</h1>
  <p class="hint">Logged in via Hack Club as <strong>{status ? status.email : '...'}</strong></p>

  <ul class="status">
    <li>
      <span class="dot" class:ok={status?.botToken} class:missing={status && !status.botToken}></span>
      <span>Bot token (<code>SLACK_BOT_TOKEN</code>): {status ? (status.botToken ? 'set' : 'missing') : 'checking...'}</span>
    </li>
    <li>
      <span class="dot" class:ok={status?.userToken} class:missing={status && !status.userToken}></span>
      <span>Your user token (<code>SLACK_USER_TOKEN</code>): {status ? (status.userToken ? 'set' : 'missing') : 'checking...'}</span>
    </li>
    <li>
      <span class="dot ok"></span>
      <span>Team invites: {status ? (status.invites === 1 ? '1 person' : `${status.invites} people`) : '...'}</span>
    </li>
  </ul>

  {#if status && (!status.botToken || !status.userToken)}
    <p class="hint">
      Missing a token? <a href="/slack/install">Install to Slack</a> to get them written to <code>.env</code>, then restart the server.
    </p>
  {/if}

  <div class="cards">
    <a class="card" href="/message">
      <strong>Message</strong>
      <span class="hint">Send DMs to a list of people, as the bot or as you.</span>
    </a>
    <a class="card" href="/access">
      <strong>Access</strong>
      <span class="hint">Invite people by email or Slack ID so they can send as themselves.</span>
    </a>
  </div>
</div>

<style>
  .status { list-style: none; padding: 0; margin: 16px 0; }
  .status li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #ccc; flex: none; }
  .dot.ok { background: #1e8e3e; }
  .dot.missing { background: #d93025; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 20px; }
  .card { display: block; padding: 16px; border: 1px solid #e3e3e3; border-radius: 8px; color: inherit; text-decoration: none; }
  .card:hover { border-color: #1a1a1a; }
  .card strong { display: block; margin-bottom: 4px; }
</style>
