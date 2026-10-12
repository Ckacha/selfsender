<script>
  import SendForm from '../lib/SendForm.svelte';
  import AiConnect from '../lib/AiConnect.svelte';
</script>

<svelte:head><title>selfsender: team</title></svelte:head>

<div class="page wide">
  <h1>selfsender: team</h1>
  <p class="hint">Send a Slack DM to a list of recipients, as your own Slack account.</p>
  <p class="hint">
    Logged in via Hack Club, sending through your connected Slack.
    <a href="/team/connect">Reconnect Slack</a> · <a href="/logout">Log out</a>
  </p>

  <SendForm endpoint="/api/team/send" />

  <h2>Connect your AI</h2>
  <AiConnect />
</div>

<style>
  h2 { margin-top: 40px; }
</style>
