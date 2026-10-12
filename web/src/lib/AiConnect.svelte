<script>
  const mcpUrl = 'https://selfsender.ckacha.dev/api/mcp';
  const prompt = `Add a new MCP server called "selfsender" pointing at ${mcpUrl} and connect to it. `
    + 'It is OAuth-protected, so open the sign-in link it returns and I will log in with my Hack Club account. '
    + 'Once connected you will have tools to send the same Slack message to a list of people (as a test run unless I say otherwise), '
    + 'search Hack Club Slack emoji, and check which account I am signed in as. '
    + 'After connecting, list the tools you now have.';
  const command = `claude mcp add --transport http --scope user selfsender ${mcpUrl}`;

  let promptEl;
  let buttonText = $state('Copy');

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      buttonText = 'Copied';
    } catch (err) {
      const range = document.createRange();
      range.selectNodeContents(promptEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      buttonText = 'Press Ctrl+C';
    }
    setTimeout(() => { buttonText = 'Copy'; }, 2000);
  }
</script>

<div class="ai-connect">
  <p class="hint">Paste this into your AI's prompt window (Claude Code, Claude Desktop, or any app that supports MCP):</p>
  <div class="prompt"><span bind:this={promptEl}>{prompt}</span><button type="button" class="copy" onclick={copy}>{buttonText}</button></div>
  <p class="hint second">Or add it yourself in a terminal with Claude Code, then run <code>/mcp</code> and pick Authenticate:</p>
  <code class="cmd">{command}</code>
</div>

<style>
  .ai-connect { margin-top: 16px; }
  .prompt { position: relative; margin-top: 8px; padding: 12px 12px 48px; background: #f5f5f5; border: 1px solid #e3e3e3;
    border-radius: 6px; font-size: 0.9rem; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
  .copy { position: absolute; right: 8px; bottom: 8px; margin: 0; padding: 6px 12px; font-size: 0.85rem; }
  .second { margin-top: 12px; }
  .cmd { display: block; margin-top: 8px; padding: 8px 12px; background: #f5f5f5; border-radius: 6px;
    font-size: 0.8rem; white-space: pre-wrap; word-break: break-all; }
</style>
 