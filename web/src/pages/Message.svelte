<script>
  import Nav from '../lib/Nav.svelte';
  import SendForm from '../lib/SendForm.svelte';
</script>

<svelte:head><title>selfsender: message</title></svelte:head>

<div class="page wide">
  <Nav active="/message" />
  <h1>Message</h1>
  <p class="hint">Send a Slack DM to a list of recipients, as the bot or as your own (user-token) account.</p>
  <SendForm endpoint="/api/send" owner />
</div>
