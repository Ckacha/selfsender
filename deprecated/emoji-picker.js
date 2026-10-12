(function () {
  const style = document.createElement('style');
  style.textContent = `
    .emoji-editor { width: 100%; box-sizing: border-box; padding: 8px; margin-top: 4px; min-height: 9em; max-height: 400px; overflow-y: auto;
      border: 1px solid #767676; border-radius: 2px; font-family: inherit; font-size: 0.95rem; line-height: 1.5;
      white-space: pre-wrap; word-wrap: break-word; background: #fff; cursor: text; }
    .emoji-editor:focus { outline: 2px solid #4a90e2; outline-offset: -1px; }
    .emoji-editor:empty::before { content: attr(data-placeholder); color: #888; pointer-events: none; }
    .emoji-editor img { width: 22px; height: 22px; object-fit: contain; vertical-align: -6px; }
    .emoji-picker { position: absolute; z-index: 10; background: #fff; border: 1px solid #ccc; border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.12); max-height: 260px; overflow-y: auto; min-width: 240px; font-size: 0.9rem; }
    .emoji-picker div { display: flex; align-items: center; gap: 8px; padding: 4px 8px; cursor: pointer; }
    .emoji-picker div.active { background: #e8f0fe; }
    .emoji-picker img { width: 22px; height: 22px; object-fit: contain; }
  `;
  document.head.appendChild(style);

  const NAME = "[a-z0-9_+'-]";

  window.attachEmojiEditor = function (textarea) {
    const editor = document.createElement('div');
    editor.className = 'emoji-editor';
    editor.contentEditable = 'true';
    editor.dataset.placeholder = textarea.placeholder || '';
    textarea.style.display = 'none';
    textarea.after(editor);

    const list = document.createElement('div');
    list.className = 'emoji-picker';
    list.style.display = 'none';
    document.body.appendChild(list);

    let items = [];
    let active = 0;
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
      textarea.value = serialize(editor).replace(/\n$/, '');
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
      list.style.display = 'none';
      items = [];
    }

    function render() {
      list.innerHTML = '';
      items.forEach((e, i) => {
        const row = document.createElement('div');
        if (i === active) row.className = 'active';
        const img = document.createElement('img');
        img.src = e.imageUrl;
        img.loading = 'lazy';
        const label = document.createElement('span');
        label.textContent = `:${e.name}:`;
        row.append(img, label);
        row.addEventListener('mousedown', (ev) => {
          ev.preventDefault();
          choose(i);
        });
        list.appendChild(row);
      });
      const rect = editor.getBoundingClientRect();
      list.style.left = `${rect.left + window.scrollX}px`;
      list.style.top = `${rect.bottom + window.scrollY + 2}px`;
      list.style.display = items.length ? 'block' : 'none';
      const activeRow = list.children[active];
      if (activeRow) activeRow.scrollIntoView({ block: 'nearest' });
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

    editor.addEventListener('input', async () => {
      sync();
      const ctx = caretText();
      if (!ctx) return hide();
      if (await convertTyped(ctx)) return hide();

      const match = ctx.before.match(new RegExp(`(^|\\s):(${NAME}{2,})$`, 'i'));
      if (!match) return hide();
      token = { node: ctx.node, query: match[2], start: ctx.offset - match[2].length - 1 };
      const id = ++requestId;
      try {
        const res = await fetch(`/api/emojis?q=${encodeURIComponent(token.query)}`);
        const data = await res.json();
        if (id !== requestId) return;
        items = data.emojis || [];
        active = 0;
        render();
      } catch (err) {
        hide();
      }
    });

    editor.addEventListener('keydown', (ev) => {
      if (list.style.display !== 'none') {
        if (ev.key === 'ArrowDown') {
          ev.preventDefault();
          active = (active + 1) % items.length;
          return render();
        }
        if (ev.key === 'ArrowUp') {
          ev.preventDefault();
          active = (active - 1 + items.length) % items.length;
          return render();
        }
        if (ev.key === 'Enter' || ev.key === 'Tab') {
          ev.preventDefault();
          return choose(active);
        }
        if (ev.key === 'Escape') return hide();
      }
      if (ev.key === 'Enter') {
        ev.preventDefault();
        document.execCommand('insertLineBreak');
      }
    });

    editor.addEventListener('paste', (ev) => {
      ev.preventDefault();
      document.execCommand('insertText', false, ev.clipboardData.getData('text/plain'));
    });

    editor.addEventListener('blur', hide);
  };
})();
