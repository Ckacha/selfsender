(function () {
  const style = document.createElement('style');
  style.textContent = `
    .ai-connect { margin-top: 16px; }
    .ai-connect .prompt { position: relative; margin-top: 8px; padding: 12px 12px 48px; background: #f5f5f5; border: 1px solid #e3e3e3;
      border-radius: 6px; font-size: 0.9rem; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
    .ai-connect .copy { position: absolute; right: 8px; bottom: 8px; margin: 0; padding: 6px 12px; font-size: 0.85rem; }
    .ai-connect code.cmd { display: block; margin-top: 8px; padding: 8px 12px; background: #f5f5f5; border-radius: 6px;
      font-size: 0.8rem; white-space: pre-wrap; word-break: break-all; }
  `;
  document.head.appendChild(style);

  window.renderAiConnect = function (container) {
    const mcpUrl = 'https://selfsender.ckacha.dev/api/mcp';
    const prompt = `Add a new MCP server called "selfsender" pointing at ${mcpUrl} and connect to it. `
      + 'It is OAuth-protected, so open the sign-in link it returns and I will log in with my Hack Club account. '
      + 'Once connected you will have tools to send the same Slack message to a list of people (as a test run unless I say otherwise), '
      + 'search Hack Club Slack emoji, and check which account I am signed in as. '
      + 'After connecting, list the tools you now have.';

    container.className = 'ai-connect';
    container.innerHTML = `
      <p class="hint">Paste this into your AI's prompt window (Claude Code, Claude Desktop, or any app that supports MCP):</p>
      <div class="prompt"><span class="prompt-text"></span><button type="button" class="copy">Copy</button></div>
      <p class="hint" style="margin-top: 12px;">Or add it yourself in a terminal with Claude Code, then run <code>/mcp</code> and pick Authenticate:</p>
      <code class="cmd"></code>
    `;
    container.querySelector('.prompt-text').textContent = prompt;
    container.querySelector('.cmd').textContent = `claude mcp add --transport http --scope user selfsender ${mcpUrl}`;

    const button = container.querySelector('.copy');
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(prompt);
        button.textContent = 'Copied';
      } catch (err) {
        const range = document.createRange();
        range.selectNodeContents(container.querySelector('.prompt-text'));
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        button.textContent = 'Press Ctrl+C';
      }
      setTimeout(() => { button.textContent = 'Copy'; }, 2000);
    });
  };
})();
