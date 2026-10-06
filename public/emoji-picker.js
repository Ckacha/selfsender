(function () {
  const style = document.createElement('style');
  style.textContent = `
    .emoji-picker { position: absolute; z-index: 10; background: #fff; border: 1px solid #ccc; border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.12); max-height: 260px; overflow-y: auto; min-width: 240px; font-size: 0.9rem; }
    .emoji-picker div { display: flex; align-items: center; gap: 8px; padding: 4px 8px; cursor: pointer; }
    .emoji-picker div.active { background: #e8f0fe; }
    .emoji-picker img { width: 22px; height: 22px; object-fit: contain; }
  `;
  document.head.appendChild(style);

  window.attachEmojiPicker = function (field) {
    const list = document.createElement('div');
    list.className = 'emoji-picker';
    list.style.display = 'none';
    document.body.appendChild(list);

    let items = [];
    let active = 0;
    let tokenStart = -1;
    let requestId = 0;

    function hide() {
      list.style.display = 'none';
      items = [];
    }

    function currentToken() {
      const before = field.value.slice(0, field.selectionStart);
      const match = before.match(/(^|\s):([a-z0-9_+\-']{2,})$/i);
      if (!match) return null;
      return { query: match[2], start: before.length - match[2].length - 1 };
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
      const rect = field.getBoundingClientRect();
      list.style.left = `${rect.left + window.scrollX}px`;
      list.style.top = `${rect.bottom + window.scrollY + 2}px`;
      list.style.display = items.length ? 'block' : 'none';
      const activeRow = list.children[active];
      if (activeRow) activeRow.scrollIntoView({ block: 'nearest' });
    }

    function choose(i) {
      const e = items[i];
      if (!e) return;
      const insert = `:${e.name}: `;
      const end = field.selectionStart;
      field.value = field.value.slice(0, tokenStart) + insert + field.value.slice(end);
      const caret = tokenStart + insert.length;
      field.setSelectionRange(caret, caret);
      field.focus();
      hide();
    }

    field.addEventListener('input', async () => {
      const token = currentToken();
      if (!token) return hide();
      tokenStart = token.start;
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

    field.addEventListener('keydown', (ev) => {
      if (list.style.display === 'none') return;
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        active = (active + 1) % items.length;
        render();
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        active = (active - 1 + items.length) % items.length;
        render();
      } else if (ev.key === 'Enter' || ev.key === 'Tab') {
        ev.preventDefault();
        choose(active);
      } else if (ev.key === 'Escape') {
        hide();
      }
    });

    field.addEventListener('blur', hide);
  };
})();
