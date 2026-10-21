// Kanban-Pipeline: Bewerber per Drag & Drop zwischen Phasen verschieben.
(function () {
  const board = document.querySelector('.board');
  if (!board) return;
  const csrf = board.dataset.csrf;
  let dragged = null;

  board.querySelectorAll('.cand').forEach((card) => {
    card.addEventListener('dragstart', () => { dragged = card; card.classList.add('dragging'); });
    card.addEventListener('dragend', () => { card.classList.remove('dragging'); dragged = null; });
  });

  function updateCounts() {
    board.querySelectorAll('.column').forEach((col) => {
      col.querySelector('.count').textContent = col.querySelectorAll('.cand').length;
    });
  }

  board.querySelectorAll('.column').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
    col.addEventListener('dragleave', () => col.classList.remove('drop'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drop');
      if (!dragged || dragged.closest('.column') === col) return;
      const kind = col.dataset.kind;
      let sendMail = false;
      if (kind === 'rejected') sendMail = confirm('Absage-E-Mail an die Person senden?');
      if (kind === 'hired') sendMail = confirm('Angebots-E-Mail an die Person senden?');
      const source = dragged.parentElement;
      col.querySelector('.list').prepend(dragged);
      updateCounts();
      const res = await fetch(`/app/bewerber/${dragged.dataset.id}/phase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ stage_id: Number(col.dataset.stage), send_mail: sendMail }),
      });
      if (!res.ok) {
        source.prepend(dragged);
        updateCounts();
        const data = await res.json().catch(() => ({}));
        alert(data.detail || 'Verschieben fehlgeschlagen.');
      }
    });
  });
})();

// Vorlagen-Auswahl im E-Mail-Formular übernimmt Betreff und Text.
(function () {
  const select = document.getElementById('tpl-select');
  if (!select) return;
  const tpls = JSON.parse(document.getElementById('tpl-data').textContent);
  select.addEventListener('change', () => {
    const t = tpls.find((x) => x.key === select.value);
    if (!t) return;
    document.getElementById('mail-subject').value = t.subject;
    document.getElementById('mail-body').value = t.body;
  });
})();
