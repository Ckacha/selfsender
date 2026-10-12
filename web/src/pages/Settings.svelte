<script>
  import Nav from '../lib/Nav.svelte';
  import AiConnect from '../lib/AiConnect.svelte';
</script>

<svelte:head><title>selfsender: settings</title></svelte:head>

<div class="page">
  <Nav active="/settings" />
  <h1>Settings</h1>
  <h2>Connect your AI</h2>
  <AiConnect />
</div>

<style>
  h2 { margin-top: 24px; }
</style>
