<script>
  import Title from '../lib/Title.svelte';
</script>

<svelte:head><title>selfsender</title></svelte:head>

<main>
  <h1>selfsender</h1>
  <Title />
  <a class="button" href="/login">Log in</a>
  <p class="hint">dm @iamalive on slack if ya want to use this :p</p>
</main>

<style>
  main { max-width: 480px; margin: 0 auto; padding: 64px 16px; text-align: center; }
  h1 { font-size: 3rem; letter-spacing: -1px; margin: 0 0 8px; }
  .button { display: inline-block; margin-top: 16px; padding: 12px 28px; font-size: 1.05rem; background: #1a1a1a; color: #fff;
    text-decoration: none; border-radius: 8px; }
  .button:hover { background: #333; }
  .hint { margin-top: 24px; }
</style>
