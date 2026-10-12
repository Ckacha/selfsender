<script>
  let { value = $bindable(''), placeholder = '', id = undefined } = $props();

  const NAME = "[a-z0-9_+'-]";

  let editor;
  let items = $state([]);
  let active = $state(0);
  let listEl = $state();
  let token = null;
  let requestId = 0;

  function serialize(node) {
    let out = '';
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) out += child.data.replace(/ /g, ' ');
      else if (child.nodeName === 'IMG' && child.dataset.emoji) out += `:${child.dataset.emoji}:`;
      else if (child.nodeName === 'BR') out += '\n';
      else if (child.nodeName === 'DIV' || child.nodeName === 'P') out += (out ? '\n' : '') + serialize(child);
      else out += serialize(child);
    });
    return out;
  }

  function sync() {
    value = serialize(editor).replace(/\n$/, '');
    if (!editor.textContent && !editor.querySelector('img')) editor.innerHTML = '';
  }

  function emojiImg(name, url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = `:${name}:`;
    img.title = `:${name}:`;
    img.dataset.emoji = name;
    return img;
  }

  function caretText() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (range.startContainer.nodeType !== Node.TEXT_NODE || !editor.contains(range.startContainer)) return null;
    return { node: range.startContainer, offset: range.startOffset, before: range.startContainer.data.slice(0, range.startOffset) };
  }

  function replaceWithEmoji(node, start, end, name, url, addSpace) {
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    range.deleteContents();
    const img = emojiImg(name, url);
    const space = document.createTextNode(addSpace ? ' ' : '');
    range.insertNode(space);
    range.insertNode(img);
    const sel = window.getSelection();
    sel.removeAllRanges();
    const after = document.createRange();
    after.setStart(space, space.length);
    sel.addRange(after);
    sync();
  }

  function hide() {
    items = [];
  }

  function setActive(i) {
    active = i;
    queueMicrotask(() => listEl?.children[i]?.scrollIntoView({ block: 'nearest' }));
  }

  function choose(i) {
    const e = items[i];
    if (!e || !token) return;
    const end = token.start + token.query.length + 1;
    if (token.node.isConnected && token.node.data.slice(token.start, end) === `:${token.query}`) {
      replaceWithEmoji(token.node, token.start, end, e.name, e.imageUrl, true);
    }
    hide();
    editor.focus();
  }

  async function convertTyped(ctx) {
    const match = ctx.before.match(new RegExp(`:(${NAME}+):$`, 'i'));
    if (!match) return false;
    const name = match[1];
    const start = ctx.offset - match[0].length;
    try {
      const res = await fetch(`/api/emojis/lookup?names=${encodeURIComponent(name)}`);
      const url = ((await res.json()).emojis || {})[name];
      if (url && ctx.node.isConnected && ctx.node.data.slice(start, ctx.offset) === match[0]) {
        replaceWithEmoji(ctx.node, start, ctx.offset, name, url, false);
      }
    } catch (err) {}
    return true;
  }

  async function onInput() {
    sync();
    const ctx = caretText();
    if (!ctx) return hide();
    if (await convertTyped(ctx)) return hide();

    const match = ctx.before.match(new RegExp(`(^|\\s):(${NAME}{2,})$`, 'i'));
    if (!match) return hide();
    token = { node: ctx.node, query: match[2], start: ctx.offset - match[2].length - 1 };
    const requested = ++requestId;
    try {
      const res = await fetch(`/api/emojis?q=${encodeURIComponent(token.query)}`);
      const data = await res.json();
      if (requested !== requestId) return;
      items = data.emojis || [];
      active = 0;
    } catch (err) {
      hide();
    }
  }

  function onKeydown(ev) {
    if (items.length) {
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        return setActive((active + 1) % items.length);
      }
      if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        return setActive((active - 1 + items.length) % items.length);
      }
      if (ev.key === 'Enter' || ev.key === 'Tab') {
        ev.preventDefault();
        return choose(active);
      }
      if (ev.key === 'Escape') return hide();
    }
  }

</script>

<div class="wrap">
  <div
    {id}
    class="emoji-editor"
    contenteditable="plaintext-only"
    role="textbox"
    aria-multiline="true"
    tabindex="0"
    data-placeholder={placeholder}
    bind:this={editor}
    oninput={onInput}
    onkeydown={onKeydown}
    onblur={hide}
  ></div>

  {#if items.length}
    <div class="emoji-picker" bind:this={listEl}>
      {#each items as e, i (e.name)}
        <div
          class="option"
          class:active={i === active}
          role="option"
          tabindex="-1"
          aria-selected={i === active}
          onmousedown={(ev) => { ev.preventDefault(); choose(i); }}
        >
          <img src={e.imageUrl} alt="" loading="lazy">
          <span>:{e.name}:</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>

  .wrap { position: relative; }
  .emoji-editor { width: 100%; box-sizing: border-box; padding: 8px; margin-top: 4px; min-height: 9em; max-height: 400px; overflow-y: auto;
    border: 1px solid #767676; border-radius: 2px; font-family: inherit; font-size: 0.95rem; line-height: 1.5;
    white-space: pre-wrap; word-wrap: break-word; background: #fff; cursor: text; }
  .emoji-editor:focus { outline: 2px solid #4a90e2; outline-offset: -1px; }
  .emoji-editor:empty::before { content: attr(data-placeholder); color: #888; pointer-events: none; }
  .emoji-editor :global(img) { width: 22px; height: 22px; object-fit: contain; vertical-align: -6px; }
  .emoji-picker { position: absolute; top: calc(100% + 2px); left: 0; z-index: 10; background: #fff; border: 1px solid #ccc; border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.12); max-height: 260px; overflow-y: auto; min-width: 240px; font-size: 0.9rem; }
  .option { display: flex; align-items: center; gap: 8px; padding: 4px 8px; cursor: pointer; }
  .option.active { background: #e8f0fe; }
  .option img { width: 22px; height: 22px; object-fit: contain; }
  
</style>
