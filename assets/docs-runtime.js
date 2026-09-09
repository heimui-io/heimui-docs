/*
 * The documentation runtime: authoring helpers, rendering, navigation, search.
 *
 * Shared by every section of this site. It used to live inside `sdk/docs.js`, which was fine while
 * there was one section; a second one would have meant a second copy of it, and a copy is a thing
 * that drifts. Content files declare `SECTIONS` and nothing else.
 *
 * Load this BEFORE the content file: it defines the helpers the content is written with, and the
 * `renderDocs()` the content calls once it has declared `SECTIONS`.
 */

/* ---------- languages ---------- */
const K = 'kotlin', J = 'json', G = 'gradle', P = 'python', JS = 'javascript', SH = 'bash', GO = 'go';

/* ---------- authoring helpers ---------- */

/** A fenced block. `tabs` renders several languages behind switchable pills. */
const code = (lang, src) => ({ kind: 'code', lang, src });
const tabs = (...blocks) => ({ kind: 'tabs', blocks });
const note = (variant, body) => ({ kind: 'note', variant, body });
const table = (head, rows) => ({ kind: 'table', head, rows });
const html = (body) => ({ kind: 'html', body });

/** Renders SECTIONS. Called by the content file, which declares it. */
function renderDocs() {
  /* ---------- rendering ---------- */

  const esc = (s) => s.replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));

  const NOTE_STYLES = {
    note:     { border:'border-cyan/40',   bg:'bg-cyan/5',   label:'NOTE',     color:'text-cyan' },
    tip:      { border:'border-ok/40',     bg:'bg-ok/5',     label:'TIP',      color:'text-ok' },
    warning:  { border:'border-warn/40',   bg:'bg-warn/5',   label:'WARNING',  color:'text-warn' },
    security: { border:'border-violet/40', bg:'bg-violet/5', label:'SECURITY', color:'text-violet' },
  };

  let blockSeq = 0;

  function renderCode(lang, src) {
    const id = `code-${blockSeq++}`;
    return `<div class="group relative my-4 overflow-hidden rounded-xl border border-edge bg-[#0d1220]">
      <div class="flex items-center justify-between border-b border-edge px-4 py-2">
        <span class="font-mono text-[11px] uppercase tracking-wider text-muted">${lang}</span>
        <button data-copy="${id}" class="rounded-md px-2 py-1 text-xs text-muted transition hover:bg-surfaceHover hover:text-cyan">Copy</button>
      </div>
      <pre class="overflow-x-auto p-4 text-[13px] leading-relaxed"><code id="${id}" class="language-${lang}">${esc(src)}</code></pre>
    </div>`;
  }

  function renderBlock(b) {
    switch (b.kind) {
      case 'html': return b.body;
      case 'code': return renderCode(b.lang, b.src);
      case 'tabs': {
        const gid = `tabs-${blockSeq++}`;
        const pills = b.blocks.map((blk, i) =>
          `<button data-tab="${gid}" data-idx="${i}" class="rounded-md px-3 py-1 text-xs font-medium transition ${i===0?'bg-cyan/15 text-cyan':'text-muted hover:text-ink'}">${blk.lang.toUpperCase()}</button>`).join('');
        const panes = b.blocks.map((blk, i) =>
          `<div data-pane="${gid}" data-idx="${i}" class="${i===0?'':'hidden'}">${renderCode(blk.lang, blk.src)}</div>`).join('');
        return `<div class="my-4"><div class="mb-2 flex gap-1">${pills}</div>${panes}</div>`;
      }
      case 'note': {
        const s = NOTE_STYLES[b.variant];
        return `<div class="my-5 rounded-xl border ${s.border} ${s.bg} p-4">
          <div class="mb-1.5 font-mono text-[11px] font-semibold tracking-wider ${s.color}">${s.label}</div>
          <div class="text-sm leading-relaxed text-muted">${b.body}</div>
        </div>`;
      }
      case 'table': {
        const head = b.head.some(h => h) ? `<thead><tr>${b.head.map(h=>`<th>${h}</th>`).join('')}</tr></thead>` : '';
        return `<div class="my-4 overflow-x-auto rounded-xl border border-edge">
          <table>${head}<tbody>${b.rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>
        </div>`;
      }
    }
    return '';
  }

  const content = document.getElementById('content');
  const nav = document.getElementById('nav');

  content.innerHTML = SECTIONS.map(g => g.items.map(s => `
    <section id="${s.id}" data-search="${esc((s.title + ' ' + g.group).toLowerCase())}" class="mb-16 scroll-mt-24">
      <p class="mb-1 font-mono text-[11px] uppercase tracking-wider text-violet">${g.group}</p>
      <h2>${s.title}</h2>
      ${s.blocks.map(renderBlock).join('')}
    </section>`).join('')).join('');

  nav.innerHTML = SECTIONS.map(g => `
    <div>
      <p class="mb-2 px-3 font-mono text-[11px] uppercase tracking-wider text-muted">${g.group}</p>
      <ul class="space-y-0.5">
        ${g.items.map(s => `<li><a href="#${s.id}" data-nav="${s.id}"
          class="nav-link block border-l-2 border-transparent py-1.5 pl-3 text-muted transition hover:text-ink">${s.title}</a></li>`).join('')}
      </ul>
    </div>`).join('');

  hljs.highlightAll();

  /* ---------- copy ---------- */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const el = document.getElementById(btn.dataset.copy);
    navigator.clipboard.writeText(el.textContent).then(() => {
      const was = btn.textContent;
      btn.textContent = 'Copied';
      btn.classList.add('text-ok');
      setTimeout(() => { btn.textContent = was; btn.classList.remove('text-ok'); }, 1400);
    });
  });

  /* ---------- tabs ---------- */
  document.addEventListener('click', (e) => {
    const pill = e.target.closest('[data-tab]');
    if (!pill) return;
    const { tab, idx } = pill.dataset;
    document.querySelectorAll(`[data-tab="${tab}"]`).forEach(p => {
      const on = p.dataset.idx === idx;
      p.classList.toggle('bg-cyan/15', on);
      p.classList.toggle('text-cyan', on);
      p.classList.toggle('text-muted', !on);
    });
    document.querySelectorAll(`[data-pane="${tab}"]`).forEach(p =>
      p.classList.toggle('hidden', p.dataset.idx !== idx));
  });

  /* ---------- scroll spy ---------- */
  const links = new Map([...document.querySelectorAll('[data-nav]')].map(a => [a.dataset.nav, a]));
  const spy = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      links.forEach(a => a.classList.remove('active'));
      links.get(en.target.id)?.classList.add('active');
    });
  }, { rootMargin: '-72px 0px -70% 0px' });
  document.querySelectorAll('section[id]').forEach(s => spy.observe(s));

  /* ---------- search ---------- */
  const search = document.getElementById('search');
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    document.querySelectorAll('#content section').forEach(sec => {
      const hit = !q || sec.dataset.search.includes(q) || sec.textContent.toLowerCase().includes(q);
      sec.classList.toggle('hidden', !hit);
      links.get(sec.id)?.parentElement.classList.toggle('hidden', !hit);
    });
  });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { search.value=''; search.dispatchEvent(new Event('input')); } });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); search.focus(); }
  });

  /* ---------- mobile nav ---------- */
  const sidebar = document.getElementById('sidebar');
  document.getElementById('menuBtn').addEventListener('click', () => sidebar.classList.toggle('hidden'));
  sidebar.addEventListener('click', (e) => {
    if (e.target.closest('a') && window.innerWidth < 1024) sidebar.classList.add('hidden');
  });

}
