<script>
  import Nav from '../lib/Nav.svelte';
  import SendForm from '../lib/SendForm.svelte';
  import AiConnect from '../lib/AiConnect.svelte';
</script>

<svelte:head><title>selfsender: home</title></svelte:head>

<div class="page wide">
  <Nav />
  <h1>Message</h1>
  <p class="hint">
    Send a Slack DM to a list of recipients, as your own Slack account or through the bot under your name.
    <a href="/team/connect">Reconnect Slack</a>
  </p>

  <SendForm endpoint="/api/team/send" />

  <h2>Connect your AI</h2>
  <AiConnect />
</div>

<style>
  h2 { margin-top: 40px; }
</style>
