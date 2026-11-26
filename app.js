/*
 * Job Tracker
 * Local-first job application tracker. Data lives in this browser (localStorage), and
 * sync.js copies it between devices through a private GitHub repo once a key is entered.
 * No build step, no dependencies.
 */
(function () {
  'use strict';

  // ---------- Constants ----------
  const STORE_KEY = 'jobtracker.v1';
  const FOLLOW_UP_DAYS = 7;
  const BACKUP_NUDGE_DAYS = 7;
  const STAGES = [
    { id: 'lead', name: 'Lead' },
    { id: 'applied', name: 'Applied' },
    { id: 'screening', name: 'Screening' },
    { id: 'interviewing', name: 'Interviewing' },
    { id: 'offer', name: 'Offer' },
    { id: 'closed', name: 'Closed' }
  ];
  const STAGE_IDS = STAGES.map((s) => s.id);
  const CLOSE_REASONS = [
    { id: 'Won', hint: 'Offer accepted' },
    { id: 'Rejected', hint: 'The company said no, at any stage' },
    { id: 'Withdrew', hint: 'You stepped out of the process' },
    { id: 'Ghosted', hint: 'No reply after follow-ups' }
  ];
  const CLOSE_IDS = CLOSE_REASONS.map((r) => r.id);
  const PRIORITIES = ['High', 'Medium', 'Low'];
  const CONTACT_TYPES = ['Recruiter', 'Hiring manager', 'Introducer', 'Network', 'Other'];
  const ENTRY_TYPES = ['Email', 'Call', 'Interview', 'Application', 'Note'];
  const DOC_KINDS = ['Resume', 'Cover letter', 'Interview prep', 'Job description', 'Other'];
  const FIELDS = [
    ['company', 'Company'], ['role', 'Role'], ['location', 'Location'], ['source', 'Source'],
    ['jdUrl', 'Job post'], ['priority', 'Priority'], ['salary', 'Salary band'], ['notes', 'Scope and notes'],
    ['fitScore', 'Profile fit'], ['shortlist', 'Shortlist odds'], ['fitSummary', 'Fit summary']
  ];
  const ODDS = ['High', 'Medium', 'Low'];
  // Normalises one field value from a record or form; '' means "no value".
  function fieldVal(key, v) {
    if (key === 'jdUrl') return safeUrl(v);
    if (key === 'priority') return pickCase(v, PRIORITIES);
    if (key === 'shortlist') return pickCase(v, ODDS);
    if (key === 'fitScore') {
      const s = str(v).replace('%', '');
      if (s === '') return '';
      const n = Math.round(Number(s));
      return isFinite(n) && n >= 0 && n <= 100 ? String(n) : '';
    }
    return str(v);
  }

  // ---------- Small helpers ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const str = (v) => (v === null || v === undefined ? '' : String(v)).trim();
  const arr = (v) => (Array.isArray(v) ? v : []);
  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

  function isoDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  const today = () => isoDate(new Date());
  function parseISO(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
    const p = iso.split('-').map(Number);
    const d = new Date(p[0], p[1] - 1, p[2]);
    return isNaN(d) ? null : d;
  }
  const validDate = (v) => (parseISO(str(v)) ? str(v) : '');
  function addDays(iso, n) {
    const d = parseISO(iso) || new Date();
    d.setDate(d.getDate() + n);
    return isoDate(d);
  }
  function fmtDate(iso, withDay) {
    const d = parseISO(iso);
    if (!d) return iso || '';
    const opts = withDay ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('en-GB', opts);
  }
  function daysFrom(iso) {
    const d = parseISO(iso);
    const t = parseISO(today());
    if (!d) return null;
    return Math.round((d - t) / 86400000);
  }
  function dueLabel(iso) {
    const n = daysFrom(iso);
    if (n === null) return '';
    if (n < 0) return plural(-n, 'day') + ' late';
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    return fmtDate(iso, n <= 7);
  }
  function safeUrl(v) {
    const s = str(v);
    if (!s) return '';
    try {
      const u = new URL(s);
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
    } catch (e) {
      return '';
    }
  }
  const stageId = (v) => {
    const s = str(v).toLowerCase();
    const hit = STAGES.find((x) => x.id === s || x.name.toLowerCase() === s);
    return hit ? hit.id : '';
  };
  const stageName = (id) => (STAGES.find((s) => s.id === id) || { name: id }).name;
  const pickCase = (v, list) => list.find((x) => x.toLowerCase() === str(v).toLowerCase()) || '';

  const ICON = {
    x: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    xs: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    paste: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/></svg>',
    file: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none;margin-top:2px;color:var(--muted)"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>'
  };

  // ---------- State ----------
  function normEntry(e) {
    e = e || {};
    return { id: str(e.id) || uid('ev'), date: validDate(e.date) || today(), type: str(e.type) || 'Note', text: str(e.text) };
  }
  function normDoc(d) {
    d = d || {};
    return { id: str(d.id) || uid('doc'), kind: str(d.kind) || 'Other', name: str(d.name), url: safeUrl(d.url) };
  }
  function normNext(n) {
    if (!n || !str(n.text)) return null;
    return { text: str(n.text), due: validDate(n.due) };
  }
  function normApp(a) {
    a = a || {};
    const t = a.tailoring || {};
    const now = new Date().toISOString();
    return {
      id: str(a.id) || uid('app'),
      company: str(a.company),
      role: str(a.role),
      location: str(a.location),
      source: str(a.source),
      jdUrl: safeUrl(a.jdUrl),
      priority: pickCase(a.priority, PRIORITIES) || 'Medium',
      fitScore: fieldVal('fitScore', a.fitScore),
      shortlist: fieldVal('shortlist', a.shortlist),
      fitSummary: str(a.fitSummary),
      salary: str(a.salary),
      notes: str(a.notes),
      stage: stageId(a.stage) || 'lead',
      closedReason: pickCase(a.closedReason, CLOSE_IDS),
      closedNote: str(a.closedNote),
      contactIds: arr(a.contactIds).map(String),
      timeline: arr(a.timeline).map(normEntry).filter((e) => e.text),
      next: normNext(a.next),
      documents: arr(a.documents).map(normDoc).filter((d) => d.name || d.url),
      tailoring: {
        resume: arr(t.resume).map(str).filter(Boolean),
        cover: arr(t.cover).map(str).filter(Boolean)
      },
      createdAt: str(a.createdAt) || now,
      updatedAt: str(a.updatedAt) || now
    };
  }
  function normContact(c) {
    c = c || {};
    return {
      id: str(c.id) || uid('ct'),
      name: str(c.name),
      company: str(c.company),
      title: str(c.title),
      type: pickCase(c.type, CONTACT_TYPES) || 'Other',
      email: str(c.email),
      lang: str(c.lang).toUpperCase().slice(0, 5),
      notes: str(c.notes)
    };
  }
  function normalize(d) {
    d = d || {};
    const contacts = arr(d.contacts).map(normContact).filter((c) => c.name);
    const ids = new Set(contacts.map((c) => c.id));
    const applications = arr(d.applications).map(normApp);
    applications.forEach((a) => { a.contactIds = a.contactIds.filter((id) => ids.has(id)); });
    return { version: 1, applications, contacts, lastExport: str(d.lastExport) };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* storage unavailable or corrupt */ }
    return normalize({});
  }
  let state = load();
  const ui = { q: '', contactFilter: 'All', contactQ: '' };

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Could not save. Browser storage is unavailable or full.');
    }
  }
  const appById = (id) => state.applications.find((a) => a.id === id);
  const contactById = (id) => state.contacts.find((c) => c.id === id);
  const touch = (a) => { a.updatedAt = new Date().toISOString(); };
  const entry = (type, text, date) => normEntry({ type, text, date: date || today() });
  const appsForContact = (cid) => state.applications.filter((a) => a.contactIds.includes(cid));
  const appLabel = (a) => (a.company || 'Untitled') + (a.role ? ', ' + a.role : '');

  // ---------- Domain actions ----------
  function setStage(a, stage, autoFollowUp) {
    const from = a.stage;
    if (from === stage) return;
    a.stage = stage;
    if (stage !== 'closed') { a.closedReason = ''; a.closedNote = ''; }
    a.timeline.push(entry('Stage', 'Moved from ' + stageName(from) + ' to ' + stageName(stage)));
    if (autoFollowUp !== false && stage === 'applied' && !a.next) {
      a.next = { text: 'Follow up on application', due: addDays(today(), FOLLOW_UP_DAYS) };
    }
    touch(a);
  }
  function closeApp(a, reason, note) {
    const from = a.stage;
    a.stage = 'closed';
    a.closedReason = reason;
    a.closedNote = note || '';
    a.next = null;
    a.timeline.push(entry('Closed', reason + (note ? ': ' + note : '') + ' (from ' + stageName(from) + ')'));
    touch(a);
  }
  function completeNext(a) {
    if (!a.next) return;
    a.timeline.push(entry('Done', a.next.text));
    a.next = null;
    touch(a);
  }
  function findContact(name, company) {
    const n = str(name).toLowerCase();
    const c = str(company).toLowerCase();
    const same = state.contacts.filter((x) => x.name.toLowerCase() === n);
    if (!same.length) return null;
    return same.find((x) => !c || !x.company || x.company.toLowerCase() === c) || same[0];
  }
  function linkContact(a, cid) {
    if (!a.contactIds.includes(cid)) a.contactIds.push(cid);
  }

  // ---------- Paste from Claude ----------
  function parseRecords(text) {
    let t = str(text).replace(/```[a-zA-Z]*/g, '').trim();
    if (!t) throw new Error('Paste the record block from your Claude job chat first.');
    let blocks = t.split(/JOBTRACKER\s+v\d+/i).map((s) => s.trim()).filter(Boolean);
    if (!blocks.length) blocks = [t];
    const out = [];
    blocks.forEach((b) => {
      const start = b.search(/[[{]/);
      const end = Math.max(b.lastIndexOf('}'), b.lastIndexOf(']'));
      if (start < 0 || end < start) throw new Error('No record found. Copy the whole block that starts with JOBTRACKER v1.');
      let data;
      try { data = JSON.parse(b.slice(start, end + 1)); } catch (e) {
        throw new Error('The record is not valid JSON. Copy the whole block again, including the last brace.');
      }
      (Array.isArray(data) ? data : [data]).forEach((r) => out.push(r));
    });
    out.forEach((r, i) => {
      if (!r || typeof r !== 'object' || !str(r.id)) throw new Error('Record ' + (i + 1) + ' has no "id".');
    });
    return out;
  }

  function planRecord(r) {
    const id = str(r.id);
    const a = appById(id);
    const isNew = !a;
    if (isNew && str(r.action).toLowerCase() === 'update') {
      throw new Error('No application with id "' + id + '" yet. Paste the first record from that chat before this update.');
    }
    if (isNew && !str(r.company)) throw new Error('New record "' + id + '" needs a company.');
    const lines = [];
    FIELDS.forEach(([key, label]) => {
      if (r[key] === undefined) return;
      const v = fieldVal(key, r[key]);
      if (!v) return;
      const old = a ? a[key] : '';
      if (v === old) return;
      const pct = key === 'fitScore' ? '%' : '';
      lines.push(isNew || !old ? label + ': ' + v + pct : label + ': ' + old + pct + ' → ' + v + pct);
    });
    const st = r.stage !== undefined ? stageId(r.stage) : '';
    if (r.stage !== undefined && !st) throw new Error('Unknown stage "' + str(r.stage) + '".');
    if (st === 'closed' && !pickCase(r.closedReason, CLOSE_IDS)) throw new Error('Closing needs a closedReason: Won, Rejected, Withdrew or Ghosted.');
    if (isNew) lines.push('Stage: ' + stageName(st || 'lead'));
    else if (st && st !== a.stage) lines.push('Stage: ' + stageName(a.stage) + ' → ' + stageName(st) + (st === 'closed' ? ' (' + pickCase(r.closedReason, CLOSE_IDS) + ')' : ''));
    arr(r.contacts).forEach((c) => {
      if (!str(c && c.name)) return;
      const hit = findContact(c.name, c.company || r.company || (a && a.company));
      if (hit && a && a.contactIds.includes(hit.id)) return;
      lines.push((hit ? 'Link contact: ' : 'New contact: ') + str(c.name) + (str(c.title) ? ' (' + str(c.title) + ')' : ''));
    });
    const tr = r.tailoring || {};
    const nRes = arr(tr.resume).filter((x) => str(x)).length;
    const nCov = arr(tr.cover).filter((x) => str(x)).length;
    if (nRes) lines.push('Resume adjustments: +' + nRes);
    if (nCov) lines.push('Cover letter adjustments: +' + nCov);
    arr(r.documents).forEach((d) => { if (str(d && (d.name || d.url))) lines.push('Document: ' + (str(d.kind) || 'Other') + ', ' + (str(d.name) || str(d.url))); });
    const logs = Array.isArray(r.log) ? r.log : r.log ? [r.log] : [];
    logs.forEach((l) => { if (str(l && l.text)) lines.push('Timeline: ' + fmtDate(validDate(l.date) || today()) + ', ' + str(l.text)); });
    if (r.next === null) lines.push('Next action: cleared');
    else if (r.next && str(r.next.text)) {
      lines.push('Next action: ' + str(r.next.text) + (validDate(r.next.due) ? ', due ' + fmtDate(r.next.due, true) : '') +
        (a && a.next ? ' (replaces "' + a.next.text + '")' : ''));
    } else if (st === 'applied' && (!a || !a.next)) {
      lines.push('Next action: Follow up on application, due ' + fmtDate(addDays(today(), FOLLOW_UP_DAYS), true) + ' (default)');
    }
    if (!lines.length) lines.push('No changes: this record is already applied.');
    return { id, isNew, name: (str(r.company) || (a && a.company) || 'Untitled') + ' · ' + (str(r.role) || (a && a.role) || ''), lines };
  }

  function applyRecord(r) {
    const id = str(r.id);
    let a = appById(id);
    if (!a) {
      a = normApp({ id, stage: 'lead' });
      a.timeline.push(entry('Note', 'Added from a Claude job chat'));
      state.applications.push(a);
    }
    FIELDS.forEach(([key]) => {
      if (r[key] === undefined) return;
      const v = fieldVal(key, r[key]);
      if (v) a[key] = v;
    });
    arr(r.contacts).forEach((c) => {
      if (!str(c && c.name)) return;
      let hit = findContact(c.name, c.company || a.company);
      if (!hit) {
        hit = normContact(Object.assign({}, c, { company: str(c.company) || a.company }));
        state.contacts.push(hit);
      } else {
        ['title', 'email', 'lang'].forEach((k) => { if (!hit[k] && str(c[k])) hit[k] = k === 'lang' ? str(c[k]).toUpperCase().slice(0, 5) : str(c[k]); });
        if (hit.type === 'Other' && pickCase(c.type, CONTACT_TYPES)) hit.type = pickCase(c.type, CONTACT_TYPES);
      }
      linkContact(a, hit.id);
    });
    const tr = r.tailoring || {};
    arr(tr.resume).map(str).filter(Boolean).forEach((x) => { if (!a.tailoring.resume.includes(x)) a.tailoring.resume.push(x); });
    arr(tr.cover).map(str).filter(Boolean).forEach((x) => { if (!a.tailoring.cover.includes(x)) a.tailoring.cover.push(x); });
    arr(r.documents).map(normDoc).filter((d) => d.name || d.url).forEach((d) => a.documents.push(d));
    const logs = Array.isArray(r.log) ? r.log : r.log ? [r.log] : [];
    logs.map(normEntry).filter((e) => e.text).forEach((e) => a.timeline.push(e));
    const hasNext = Object.prototype.hasOwnProperty.call(r, 'next');
    if (hasNext) a.next = normNext(r.next);
    const st = stageId(r.stage);
    if (st === 'closed') {
      if (a.stage !== 'closed') closeApp(a, pickCase(r.closedReason, CLOSE_IDS), str(r.closedNote));
    } else if (st) {
      setStage(a, st, !hasNext);
    }
    touch(a);
    return a;
  }

  // ---------- Rendering: shared ----------
  const view = $('#view');
  const dlg = $('#dlg');

  function setActiveNav(name) {
    $$('[data-nav]').forEach((el) => {
      if (el.dataset.nav === name) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
    const n = state.applications.filter((a) => a.stage !== 'closed' && a.next && a.next.due && daysFrom(a.next.due) < 0).length;
    $$('[data-due-badge]').forEach((b) => { b.hidden = !n; b.textContent = n; b.setAttribute('aria-label', plural(n, 'overdue action')); });
  }

  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const i = h.indexOf('/');
    const v = i < 0 ? h : h.slice(0, i);
    const id = i < 0 ? '' : decodeURIComponent(h.slice(i + 1));
    return { v: v || 'board', id };
  }

  function render() {
    const r = route();
    setActiveNav(r.v === 'app' ? 'board' : r.v);
    if (r.v === 'due') renderDue();
    else if (r.v === 'contacts') renderContacts();
    else if (r.v === 'app') renderDetail(r.id);
    else renderBoard();
  }

  // ---------- Board ----------
  function matches(a, q) {
    if (!q) return true;
    const names = a.contactIds.map((id) => (contactById(id) || {}).name || '').join(' ');
    return [a.company, a.role, a.location, a.source, names].join(' ').toLowerCase().includes(q);
  }
  function sortCards(list, stage) {
    if (stage === 'closed') return list.slice().sort((x, y) => (y.updatedAt > x.updatedAt ? 1 : -1));
    return list.slice().sort((x, y) => {
      const dx = x.next && x.next.due ? x.next.due : '9999';
      const dy = y.next && y.next.due ? y.next.due : '9999';
      if (dx !== dy) return dx < dy ? -1 : 1;
      return PRIORITIES.indexOf(x.priority) - PRIORITIES.indexOf(y.priority);
    });
  }
  function prioBadge(p) {
    if (p === 'High') return '<span class="badge badge-accent">High</span>';
    if (p === 'Low') return '<span class="badge">Low</span>';
    return '<span class="badge">Medium</span>';
  }
  function reasonBadge(r) {
    if (r === 'Won') return '<span class="badge badge-ok">Won</span>';
    return '<span class="badge">' + esc(r || 'Closed') + '</span>';
  }
  function cardHTML(a) {
    const closed = a.stage === 'closed';
    const late = !closed && a.next && a.next.due && daysFrom(a.next.due) < 0;
    const meta = [a.location, a.source, a.fitScore ? 'Fit ' + a.fitScore + '%' : '', a.shortlist ? 'Shortlist: ' + a.shortlist : '']
      .filter(Boolean).map((m) => '<span>' + esc(m) + '</span>').join('');
    return '<a class="card" href="#/app/' + encodeURIComponent(a.id) + '" draggable="true" data-id="' + esc(a.id) + '">' +
      '<div class="card-top"><div class="card-title"><span class="card-company">' + esc(a.company || 'Untitled') + '</span>' +
      (a.role ? '<span class="card-role">' + esc(a.role) + '</span>' : '') + '</div>' +
      (closed ? reasonBadge(a.closedReason) : prioBadge(a.priority)) + '</div>' +
      '<div class="card-meta">' + meta + '</div>' +
      (!closed && a.next ? '<div class="next' + (late ? ' is-late' : '') + '"><span class="eyebrow">Next' +
        (a.next.due ? ' · ' + esc(dueLabel(a.next.due)) : '') + '</span><span class="next-text">' + esc(a.next.text) + '</span></div>' : '') +
      '</a>';
  }
  function columnsHTML() {
    const q = ui.q.toLowerCase().trim();
    return STAGES.map((s) => {
      const list = sortCards(state.applications.filter((a) => a.stage === s.id && matches(a, q)), s.id);
      return '<section class="column" data-stage="' + s.id + '" aria-label="' + s.name + '">' +
        '<div class="column-head"><h2>' + s.name + '</h2><span class="count">' + list.length + '</span></div>' +
        (list.length ? list.map(cardHTML).join('') : '<div class="column-empty">' + (q ? 'No match' : 'Drop a card here') + '</div>') +
        '</section>';
    }).join('');
  }
  function statsHTML() {
    const active = state.applications.filter((a) => a.stage !== 'closed');
    const withDue = active.filter((a) => a.next && a.next.due);
    const overdue = withDue.filter((a) => daysFrom(a.next.due) < 0).length;
    const week = withDue.filter((a) => { const d = daysFrom(a.next.due); return d >= 0 && d <= 7; }).length;
    const interviews = active.filter((a) =>
      a.timeline.some((e) => /interview/i.test(e.type) && e.date >= today()) ||
      (a.next && /interview/i.test(a.next.text) && (!a.next.due || a.next.due >= today()))).length;
    return '<div class="stats" aria-label="Summary">' +
      '<div class="stat"><span>Active applications</span><strong>' + active.length + '</strong></div>' +
      '<div class="stat"><span>Actions due this week</span><strong>' + week + '</strong></div>' +
      '<div class="stat' + (overdue ? ' is-warn' : '') + '"><span>Overdue</span><strong>' + overdue + '</strong></div>' +
      '<div class="stat"><span>Upcoming interviews</span><strong>' + interviews + '</strong></div>' +
      '</div>';
  }
  function backupNotice() {
    if (!state.applications.length) return '';
    const last = state.lastExport ? Math.floor((Date.now() - Date.parse(state.lastExport)) / 86400000) : null;
    if (last !== null && last < BACKUP_NUDGE_DAYS) return '';
    return '<div class="notice"><span>' + (last === null ? 'No backup yet.' : 'Last backup ' + plural(last, 'day') + ' ago.') +
      ' Your data lives only in this browser.</span><button type="button" class="btn btn-sm" data-action="export">Export JSON</button></div>';
  }
  function renderBoard() {
    const empty = !state.applications.length;
    view.innerHTML =
      '<div class="board-wrap">' +
      '<div class="toolbar">' +
      '<label class="search">' + ICON.search + '<span class="sr">Search applications</span>' +
      '<input type="search" id="board-search" placeholder="Search company, role, contact" value="' + esc(ui.q) + '"></label>' +
      '<div class="toolbar-actions">' +
      '<button type="button" class="btn btn-soft" data-action="paste">' + ICON.paste + 'Paste from Claude</button>' +
      '<button type="button" class="btn" data-action="import">Import</button>' +
      '<button type="button" class="btn" data-action="export">Export JSON</button>' +
      '</div></div>' +
      backupNotice() +
      (empty ? '<div class="notice"><span>No applications yet. Paste a record from a Claude job chat, or add one with New application.</span></div>' : statsHTML()) +
      '<div class="columns" id="board-cols">' + columnsHTML() + '</div>' +
      '</div>';
  }

  // ---------- Detail ----------
  function stepperHTML(a) {
    const cur = STAGE_IDS.indexOf(a.stage);
    return '<ol class="stepper" aria-label="Stage progress">' + STAGES.map((s, i) => {
      const cls = i < cur ? 'done' : i === cur ? 'current' : '';
      return '<li class="' + cls + '"' + (i === cur ? ' aria-current="step"' : '') + '><span class="bar"></span><span>' + s.name + '</span></li>';
    }).join('') + '</ol>';
  }
  function nextCardHTML(a) {
    if (a.stage === 'closed') return '';
    if (!a.next) {
      return '<section class="panel next-card is-empty" aria-label="Next action"><div><span class="eyebrow">Next action</span><div class="muted">None set</div></div>' +
        '<button type="button" class="btn" data-action="set-next" data-id="' + esc(a.id) + '">Set next action</button></section>';
    }
    const late = a.next.due && daysFrom(a.next.due) < 0;
    return '<section class="panel next-card' + (late ? ' is-late' : '') + '" aria-label="Next action">' +
      '<div style="display:flex;flex-direction:column;gap:4px;min-width:0"><span class="eyebrow">Next action' +
      (a.next.due ? ' · ' + esc(fmtDate(a.next.due, true)) + (late ? ' (' + esc(dueLabel(a.next.due)) + ')' : '') : '') + '</span>' +
      '<span class="what">' + esc(a.next.text) + '</span></div>' +
      '<div class="row-actions"><button type="button" class="btn" data-action="set-next" data-id="' + esc(a.id) + '">Edit</button>' +
      '<button type="button" class="btn btn-primary" data-action="next-done" data-id="' + esc(a.id) + '">Mark done</button></div></section>';
  }
  function timelineHTML(a) {
    const t = today();
    const items = a.timeline.map((e, i) => ({ e, i })).sort((x, y) => (x.e.date === y.e.date ? y.i - x.i : x.e.date < y.e.date ? 1 : -1));
    return '<section class="panel"><h2>Timeline</h2>' +
      '<form class="quick-form" data-form="log" data-id="' + esc(a.id) + '">' +
      '<div class="qf-row"><label class="field">Type<select name="type">' + ENTRY_TYPES.map((x) => '<option>' + x + '</option>').join('') + '</select></label>' +
      '<label class="field">Date<input type="date" name="date" value="' + t + '" required></label>' +
      '<label class="field grow">What happened<input type="text" name="text" required placeholder="e.g. Sent thank-you email"></label></div>' +
      '<div class="qf-row"><label class="field grow">Then set next action (optional)<input type="text" name="next" placeholder="e.g. Chase for feedback"></label>' +
      '<label class="field">Due<input type="date" name="due"></label>' +
      '<button type="submit" class="btn btn-primary">Add</button></div></form>' +
      (items.length ? '<ol class="timeline">' + items.map(({ e }) =>
        '<li class="' + (e.date > t ? 'future' : '') + '"><span class="date">' + esc(fmtDate(e.date)) + '</span><span class="dot" aria-hidden="true"></span>' +
        '<div class="body"><span class="eyebrow">' + esc(e.type) + (e.date > t ? ' · upcoming' : '') + '</span><span class="text">' + esc(e.text) + '</span></div>' +
        '<button type="button" class="icon-btn sm" aria-label="Delete entry" data-action="del-entry" data-id="' + esc(a.id) + '" data-entry="' + esc(e.id) + '">' + ICON.xs + '</button></li>'
      ).join('') + '</ol>' : '<p class="muted" style="margin:0">Nothing logged yet.</p>') +
      '</section>';
  }
  function detailsHTML(a) {
    const rows = [
      ['Location', esc(a.location)], ['Source', esc(a.source)], ['Priority', esc(a.priority)],
      ['Profile fit', a.fitScore ? esc(a.fitScore) + '%' : ''], ['Shortlist odds', esc(a.shortlist)],
      ['Fit summary', esc(a.fitSummary)],
      ['Salary band', esc(a.salary)], ['Scope', esc(a.notes)],
      ['Job post', a.jdUrl ? '<a href="' + esc(a.jdUrl) + '" target="_blank" rel="noopener noreferrer">Open job post</a>' : '']
    ];
    return '<section class="panel"><div class="panel-head"><h2>Details</h2><button type="button" class="btn-link" data-action="edit-app" data-id="' + esc(a.id) + '">Edit</button></div>' +
      '<dl class="dl">' + rows.map(([k, v]) => '<dt>' + k + '</dt><dd' + (v ? '' : ' class="muted"') + '>' + (v || 'Not set') + '</dd>').join('') + '</dl></section>';
  }
  function contactsPanelHTML(a) {
    const list = a.contactIds.map(contactById).filter(Boolean);
    return '<section class="panel"><div class="panel-head"><h2>Contacts</h2><button type="button" class="btn-link" data-action="link-contact" data-id="' + esc(a.id) + '">+ Add</button></div>' +
      '<ul class="list">' + (list.length ? list.map((c) =>
        '<li><div class="grow"><button type="button" class="name-btn" data-action="edit-contact" data-contact="' + esc(c.id) + '">' + esc(c.name) + '</button>' +
        '<span class="sub">' + esc([c.title, c.company].filter(Boolean).join(', ')) + '</span>' +
        '<span class="sub">' + esc(c.type) + (c.email ? ' · <a href="mailto:' + esc(encodeURIComponent(c.email).replace(/%40/g, '@')) + '">' + esc(c.email) + '</a>' : '') + '</span></div>' +
        (c.lang ? '<span class="lang">' + esc(c.lang) + '</span>' : '') +
        '<button type="button" class="icon-btn sm" aria-label="Unlink ' + esc(c.name) + '" data-action="unlink-contact" data-id="' + esc(a.id) + '" data-contact="' + esc(c.id) + '">' + ICON.xs + '</button></li>'
      ).join('') : '<li class="empty">No contacts linked.</li>') + '</ul></section>';
  }
  function docsHTML(a) {
    return '<section class="panel"><div class="panel-head"><h2>Documents</h2><button type="button" class="btn-link" data-action="add-doc" data-id="' + esc(a.id) + '">+ Add</button></div>' +
      '<ul class="list">' + (a.documents.length ? a.documents.map((d) =>
        '<li>' + ICON.file + '<div class="grow"><span class="sub">' + esc(d.kind) + '</span>' +
        (d.url ? '<a href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">' + esc(d.name || d.url) + '</a>' : '<span>' + esc(d.name) + '</span>') + '</div>' +
        '<button type="button" class="icon-btn sm" aria-label="Remove document" data-action="del-doc" data-id="' + esc(a.id) + '" data-doc="' + esc(d.id) + '">' + ICON.xs + '</button></li>'
      ).join('') : '<li class="empty">No documents yet.</li>') + '</ul></section>';
  }
  function tailoringHTML(a) {
    const group = (kind, title) => {
      const items = a.tailoring[kind];
      return '<div class="notes-group"><span class="eyebrow">' + title + '</span>' +
        (items.length ? '<ul>' + items.map((t, i) => '<li><span>' + esc(t) + '</span><button type="button" class="icon-btn sm" aria-label="Remove note" data-action="del-tailor" data-id="' + esc(a.id) + '" data-kind="' + kind + '" data-index="' + i + '">' + ICON.xs + '</button></li>').join('') + '</ul>' : '<span class="muted" style="font-size:14px">None yet.</span>') +
        '<form class="notes-add" data-form="tailor" data-id="' + esc(a.id) + '" data-kind="' + kind + '"><label class="sr" for="t-' + kind + '">Add ' + title.toLowerCase() + '</label>' +
        '<input class="input" id="t-' + kind + '" name="text" placeholder="Add a note" required><button type="submit" class="btn btn-sm">Add</button></form></div>';
    };
    return '<section class="panel"><h2>Tailoring notes</h2>' + group('resume', 'Resume adjustments') + group('cover', 'Cover letter adjustments') + '</section>';
  }
  function renderDetail(id) {
    const a = appById(id);
    if (!a) {
      view.innerHTML = '<div class="page"><a class="back" href="#/board">' + ICON.back + 'Back to board</a><div class="panel empty-state"><strong>Application not found</strong><span>It may have been deleted or the data was replaced by an import.</span></div></div>';
      return;
    }
    const meta = [a.location, a.source ? 'Source: ' + a.source : ''].filter(Boolean).join(' · ');
    view.innerHTML =
      '<div class="page">' +
      '<a class="back" href="#/board">' + ICON.back + 'Back to board</a>' +
      '<section class="panel hero"><div class="hero-top"><div class="hero-title">' +
      '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px"><h1>' + esc(a.company || 'Untitled') + '</h1>' + (a.stage === 'closed' ? reasonBadge(a.closedReason) : prioBadge(a.priority)) + '</div>' +
      (a.role ? '<span class="role">' + esc(a.role) + '</span>' : '') + (meta ? '<span class="meta">' + esc(meta) + '</span>' : '') + '</div>' +
      '<div class="hero-actions"><label class="stage-select">Move stage<select class="input" data-change="stage" data-id="' + esc(a.id) + '">' +
      STAGES.map((s) => '<option value="' + s.id + '"' + (s.id === a.stage ? ' selected' : '') + '>' + s.name + '</option>').join('') + '</select></label>' +
      '<button type="button" class="btn" data-action="edit-app" data-id="' + esc(a.id) + '">Edit</button>' +
      (a.stage !== 'closed' ? '<button type="button" class="btn" data-action="close-app" data-id="' + esc(a.id) + '">Close application</button>' : '') +
      '</div></div>' + stepperHTML(a) +
      (a.stage === 'closed' ? '<div class="closed-banner"><span>Closed: <strong>' + esc(a.closedReason || 'No reason') + '</strong>' + (a.closedNote ? '. ' + esc(a.closedNote) : '') + '</span>' +
        '<button type="button" class="btn btn-sm" data-action="reopen" data-id="' + esc(a.id) + '">Reopen</button></div>' : '') +
      '</section>' +
      '<div class="split"><div class="split-main">' + nextCardHTML(a) + timelineHTML(a) + '</div>' +
      '<aside class="split-side">' + detailsHTML(a) + contactsPanelHTML(a) + docsHTML(a) + tailoringHTML(a) + '</aside></div>' +
      '</div>';
  }

  // ---------- Due ----------
  function renderDue() {
    const active = state.applications.filter((a) => a.stage !== 'closed');
    const withNext = active.filter((a) => a.next);
    const by = (fn) => withNext.filter(fn).sort((x, y) => ((x.next.due || '9999') < (y.next.due || '9999') ? -1 : 1));
    const groups = [
      ['Overdue', by((a) => a.next.due && daysFrom(a.next.due) < 0)],
      ['This week', by((a) => a.next.due && daysFrom(a.next.due) >= 0 && daysFrom(a.next.due) <= 7)],
      ['Later', by((a) => !a.next.due || daysFrom(a.next.due) > 7)]
    ];
    const none = active.filter((a) => !a.next);
    const row = (a) => {
      const late = a.next.due && daysFrom(a.next.due) < 0;
      return '<div class="due-row"><button type="button" class="check" aria-label="Mark done: ' + esc(a.next.text) + '" data-action="next-done" data-id="' + esc(a.id) + '"><span></span></button>' +
        '<a class="grow" href="#/app/' + encodeURIComponent(a.id) + '"><span class="what">' + esc(a.next.text) + '</span><span class="who">' + esc(appLabel(a)) + '</span></a>' +
        (a.next.due ? (late ? '<span class="badge badge-warn">' + esc(dueLabel(a.next.due)) + '</span>' : '<span class="when">' + esc(dueLabel(a.next.due)) + '</span>') : '<span class="when">No date</span>') + '</div>';
    };
    const total = withNext.length;
    view.innerHTML = '<div class="page" style="max-width:760px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap"><div><span class="muted" style="font-size:13px">' + esc(fmtDate(today(), true)) + '</span><h1 style="font-size:26px;font-weight:600">Due</h1></div>' +
      '<span class="muted" style="font-size:13px">' + plural(total, 'open action') + '</span></div>' +
      (total ? groups.filter((g) => g[1].length).map((g) => '<section class="due-group"><h2>' + g[0] + '</h2>' + g[1].map(row).join('') + '</section>').join('') :
        '<div class="panel empty-state"><strong>Nothing due</strong><span>Next actions you set on applications appear here.</span></div>') +
      (none.length ? '<section class="due-group"><h2>No next action set</h2>' + none.map((a) =>
        '<div class="due-row" style="padding-left:14px"><a class="grow" href="#/app/' + encodeURIComponent(a.id) + '"><span class="what">' + esc(appLabel(a)) + '</span><span class="who">' + esc(stageName(a.stage)) + '</span></a>' +
        '<button type="button" class="btn btn-sm" data-action="set-next" data-id="' + esc(a.id) + '">Set</button></div>').join('') + '</section>' : '') +
      '</div>';
  }

  // ---------- Contacts ----------
  function contactRowsHTML() {
    const q = ui.contactQ.toLowerCase().trim();
    const typeMap = { Recruiters: 'Recruiter', 'Hiring managers': 'Hiring manager', Introducers: 'Introducer', Network: 'Network', Other: 'Other' };
    const list = state.contacts
      .filter((c) => ui.contactFilter === 'All' || c.type === typeMap[ui.contactFilter])
      .filter((c) => !q || [c.name, c.company, c.title, c.email].join(' ').toLowerCase().includes(q))
      .sort((x, y) => x.name.localeCompare(y.name));
    if (!list.length) return '<tr><td colspan="5" class="muted">No contacts' + (q || ui.contactFilter !== 'All' ? ' match.' : ' yet.') + '</td></tr>';
    return list.map((c) => {
      const apps = appsForContact(c.id);
      return '<tr><td><button type="button" class="name-btn" data-action="edit-contact" data-contact="' + esc(c.id) + '">' + esc(c.name) + '</button>' +
        (c.email ? '<div class="sub"><a href="mailto:' + esc(encodeURIComponent(c.email).replace(/%40/g, '@')) + '">' + esc(c.email) + '</a></div>' : '') + '</td>' +
        '<td>' + esc(c.company) + (c.title ? '<div class="sub">' + esc(c.title) + '</div>' : '') + '</td>' +
        '<td><span class="badge">' + esc(c.type) + '</span></td>' +
        '<td>' + (apps.length ? '<div class="app-links">' + apps.map((a) => '<a href="#/app/' + encodeURIComponent(a.id) + '">' + esc(appLabel(a)) + '</a>').join('') + '</div>' : '<span class="muted">None yet</span>') + '</td>' +
        '<td>' + (c.lang ? '<span class="lang">' + esc(c.lang) + '</span>' : '') + '</td></tr>';
    }).join('');
  }
  function renderContacts() {
    const filters = ['All', 'Recruiters', 'Hiring managers', 'Introducers', 'Network', 'Other'];
    view.innerHTML = '<div class="page">' +
      '<div class="toolbar"><h1 style="font-size:24px;font-weight:600">Contacts <span class="muted" style="font-weight:400;font-size:18px">' + state.contacts.length + '</span></h1>' +
      '<div class="toolbar-actions"><label class="search">' + ICON.search + '<span class="sr">Search contacts</span><input type="search" id="contact-search" placeholder="Search name or company" value="' + esc(ui.contactQ) + '"></label>' +
      '<button type="button" class="btn btn-primary" data-action="new-contact">+ New contact</button></div></div>' +
      '<div class="chips" role="group" aria-label="Filter by type">' + filters.map((f) => '<button type="button" class="chip-btn" data-action="contact-filter" data-filter="' + f + '" aria-pressed="' + (ui.contactFilter === f) + '">' + f + '</button>').join('') + '</div>' +
      '<div class="table-box"><table><thead><tr><th scope="col">Name</th><th scope="col">Company and title</th><th scope="col">Type</th><th scope="col">Linked applications</th><th scope="col">Lang</th></tr></thead>' +
      '<tbody id="contacts-body">' + contactRowsHTML() + '</tbody></table></div>' +
      '<p class="muted" style="margin:0;font-size:13px">One person, one record. Link a contact to several applications and their history stays in one place.</p>' +
      '</div>';
  }

  // ---------- Dialogs ----------
  function shell(title, sub, body, foot) {
    return '<form class="dlg-form" method="dialog">' +
      '<header class="dlg-head"><div><h2 id="dlg-title">' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' +
      '<button type="button" class="icon-btn" data-close aria-label="Close">' + ICON.x + '</button></header>' +
      '<div class="dlg-body">' + body + '</div><footer class="dlg-foot">' + foot + '</footer></form>';
  }
  function openDialog(html, onSubmit) {
    dlg.innerHTML = html;
    const form = $('form', dlg);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = e.submitter;
      const keepOpen = onSubmit(new FormData(form), btn ? btn.value : '', form) === false;
      if (!keepOpen) dlg.close();
    });
    $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
    if (!dlg.open) dlg.showModal();
    const focus = $('[autofocus]', dlg);
    if (focus) focus.focus();
  }
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  const opt = (list, cur) => list.map((x) => '<option' + (x === cur ? ' selected' : '') + '>' + esc(x) + '</option>').join('');
  const fld = (label, name, val, extra) => '<label class="field"><span' + ((extra || '').includes('required') ? ' class="req"' : '') + '>' + label + '</span><input name="' + name + '" value="' + esc(val || '') + '" ' + (extra || '') + '></label>';

  function appDialog(a) {
    const isNew = !a;
    a = a || normApp({});
    const body =
      '<div class="grid-2">' + fld('Company', 'company', a.company, 'required autofocus') + fld('Role', 'role', a.role, 'required') + '</div>' +
      '<div class="grid-2">' + fld('Location', 'location', a.location) + fld('Source', 'source', a.source, 'placeholder="e.g. Referral: name, LinkedIn, Direct"') + '</div>' +
      fld('Job post link', 'jdUrl', a.jdUrl, 'type="url" placeholder="https://"') +
      '<div class="grid-2"><label class="field">Priority<select name="priority">' + opt(PRIORITIES, a.priority) + '</select></label>' +
      (isNew ? '<label class="field">Stage<select name="stage">' + STAGES.filter((s) => s.id !== 'closed').map((s) => '<option value="' + s.id + '">' + s.name + '</option>').join('') + '</select></label>' : fld('Salary band', 'salary', a.salary)) + '</div>' +
      (isNew ? fld('Salary band', 'salary', a.salary) : '') +
      '<label class="field">Scope and notes<textarea name="notes">' + esc(a.notes) + '</textarea></label>' +
      '<div class="grid-2">' + fld('Profile fit (%)', 'fitScore', a.fitScore, 'type="number" min="0" max="100" step="1"') +
      '<label class="field">Shortlist odds<select name="shortlist"><option value="">Not assessed</option>' + opt(ODDS, a.shortlist) + '</select></label></div>' +
      '<label class="field">Fit summary<textarea name="fitSummary">' + esc(a.fitSummary) + '</textarea></label>';
    const foot = (isNew ? '' : '<button type="submit" class="btn btn-danger" value="delete" formnovalidate>Delete</button><span class="spacer"></span>') +
      '<button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn-primary" value="save">' + (isNew ? 'Add application' : 'Save') + '</button>';
    openDialog(shell(isNew ? 'New application' : 'Edit application', isNew ? '' : appLabel(a), body, foot), (fd, action) => {
      if (action === 'delete') {
        if (!confirm('Delete ' + appLabel(a) + '? This cannot be undone.')) return false;
        state.applications = state.applications.filter((x) => x.id !== a.id);
        save();
        toast('Application deleted');
        location.hash = '#/board';
        render();
        return;
      }
      ['company', 'role', 'location', 'source', 'salary', 'notes', 'fitSummary'].forEach((k) => { a[k] = str(fd.get(k)); });
      a.fitScore = fieldVal('fitScore', fd.get('fitScore'));
      a.shortlist = fieldVal('shortlist', fd.get('shortlist'));
      a.jdUrl = safeUrl(fd.get('jdUrl'));
      a.priority = pickCase(fd.get('priority'), PRIORITIES) || 'Medium';
      if (isNew) {
        a.id = uid('app');
        const st = stageId(fd.get('stage')) || 'lead';
        a.timeline.push(entry('Note', 'Added manually'));
        state.applications.push(a);
        if (st !== 'lead') setStage(a, st, true);
      }
      touch(a);
      save();
      toast(isNew ? 'Application added' : 'Saved');
      if (isNew) location.hash = '#/app/' + encodeURIComponent(a.id);
      render();
    });
  }

  function closeDialog(a) {
    const body = '<fieldset><legend>Reason</legend>' + CLOSE_REASONS.map((r, i) =>
      '<label class="radio-card"><input type="radio" name="reason" value="' + r.id + '"' + (i === 0 ? ' required' : '') + '><span><strong>' + r.id + '</strong><small>' + r.hint + '</small></span></label>').join('') + '</fieldset>' +
      '<label class="field">Note <span class="hint">(optional)</span><input name="note" placeholder="e.g. Feedback received, offer terms"></label>';
    const foot = '<button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn-primary" value="ok">Move to Closed</button>';
    openDialog(shell('Close application', appLabel(a), body, foot), (fd) => {
      const reason = pickCase(fd.get('reason'), CLOSE_IDS);
      if (!reason) return false;
      closeApp(a, reason, str(fd.get('note')));
      save();
      toast('Closed as ' + reason);
      render();
    });
  }

  function nextDialog(a) {
    const n = a.next || { text: '', due: '' };
    const body = '<label class="field"><span class="req">Action</span><input name="text" value="' + esc(n.text) + '" required autofocus placeholder="e.g. Follow up with the recruiter"></label>' +
      '<label class="field">Due date<input type="date" name="due" value="' + esc(n.due) + '"></label>';
    const foot = (a.next ? '<button type="submit" class="btn btn-danger" value="clear" formnovalidate>Clear</button><span class="spacer"></span>' : '') +
      '<button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn-primary" value="save">Save</button>';
    openDialog(shell('Next action', appLabel(a), body, foot), (fd, action) => {
      a.next = action === 'clear' ? null : normNext({ text: fd.get('text'), due: fd.get('due') });
      touch(a);
      save();
      render();
    });
  }

  function contactDialog(c, linkTo) {
    const isNew = !c;
    c = c || normContact({ company: linkTo ? linkTo.company : '' });
    const apps = isNew ? [] : appsForContact(c.id);
    const body =
      '<div class="grid-2">' + fld('Name', 'name', c.name, 'required autofocus') + fld('Company', 'company', c.company) + '</div>' +
      '<div class="grid-2">' + fld('Title', 'title', c.title) + '<label class="field">Type<select name="type">' + opt(CONTACT_TYPES, c.type) + '</select></label></div>' +
      '<div class="grid-2">' + fld('Email', 'email', c.email, 'type="email"') + fld('Preferred language', 'lang', c.lang, 'placeholder="EN, FR, ZH"') + '</div>' +
      '<label class="field">Notes<textarea name="notes">' + esc(c.notes) + '</textarea></label>' +
      (apps.length ? '<div class="field">Linked applications<div class="app-links">' + apps.map((a) => '<a href="#/app/' + encodeURIComponent(a.id) + '" data-close>' + esc(appLabel(a)) + '</a>').join('') + '</div></div>' : '');
    const foot = (isNew ? '' : '<button type="submit" class="btn btn-danger" value="delete" formnovalidate>Delete</button><span class="spacer"></span>') +
      '<button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn-primary" value="save">' + (isNew ? 'Add contact' : 'Save') + '</button>';
    openDialog(shell(isNew ? 'New contact' : 'Edit contact', linkTo ? 'Will be linked to ' + appLabel(linkTo) : '', body, foot), (fd, action) => {
      if (action === 'delete') {
        if (!confirm('Delete ' + c.name + '? They will be unlinked from all applications.')) return false;
        state.contacts = state.contacts.filter((x) => x.id !== c.id);
        state.applications.forEach((a) => { a.contactIds = a.contactIds.filter((id) => id !== c.id); });
        save();
        toast('Contact deleted');
        render();
        return;
      }
      const upd = normContact({ id: c.id, name: fd.get('name'), company: fd.get('company'), title: fd.get('title'), type: fd.get('type'), email: fd.get('email'), lang: fd.get('lang'), notes: fd.get('notes') });
      if (isNew) state.contacts.push(upd);
      else Object.assign(c, upd);
      if (linkTo) { linkContact(linkTo, upd.id); touch(linkTo); }
      save();
      toast(isNew ? 'Contact added' : 'Saved');
      render();
    });
  }

  function linkContactDialog(a) {
    const avail = state.contacts.filter((c) => !a.contactIds.includes(c.id)).sort((x, y) => x.name.localeCompare(y.name));
    if (!avail.length) { contactDialog(null, a); return; }
    const body = '<label class="field">Existing contact<select name="cid" autofocus>' + avail.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.name + (c.company ? ' (' + c.company + ')' : '')) + '</option>').join('') + '</select></label>' +
      '<p class="muted" style="margin:0;font-size:14px">Not in your contacts yet? Create a new one instead.</p>';
    const foot = '<button type="submit" class="btn" value="new" formnovalidate>New contact</button><span class="spacer"></span><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn-primary" value="link">Link</button>';
    openDialog(shell('Add contact', appLabel(a), body, foot), (fd, action) => {
      if (action === 'new') { contactDialog(null, a); return false; }
      const c = contactById(str(fd.get('cid')));
      if (c) { linkContact(a, c.id); touch(a); save(); render(); }
    });
  }

  function docDialog(a) {
    const body = '<label class="field">Kind<select name="kind">' + opt(DOC_KINDS, 'Resume') + '</select></label>' +
      fld('Name', 'name', '', 'required autofocus placeholder="e.g. Resume, tailored v2"') +
      fld('Link', 'url', '', 'type="url" placeholder="https:// (Google Drive, OneDrive...)"') +
      '<p class="muted" style="margin:0;font-size:13px">Files themselves stay where they are. The tracker keeps the name and a link.</p>';
    const foot = '<button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn-primary" value="save">Add</button>';
    openDialog(shell('Add document', appLabel(a), body, foot), (fd) => {
      a.documents.push(normDoc({ kind: fd.get('kind'), name: fd.get('name'), url: fd.get('url') }));
      touch(a);
      save();
      render();
    });
  }

  function pasteDialog() {
    let planned = null;
    const draw = (text, previewHTML) => {
      const body = '<label class="field">Tracker record<textarea class="paste-area" name="text" required autofocus spellcheck="false" placeholder="JOBTRACKER v1&#10;{ &quot;id&quot;: &quot;...&quot;, ... }">' + esc(text) + '</textarea></label>' + (previewHTML || '');
      const foot = '<button type="button" class="btn" data-close>Cancel</button>' +
        (planned ? '<button type="submit" class="btn" value="preview">Preview again</button><button type="submit" class="btn btn-primary" value="apply">Apply changes</button>' :
          '<button type="submit" class="btn btn-primary" value="preview">Preview</button>');
      openDialog(shell('Paste from Claude', 'Paste the tracker record from a job chat. Nothing changes until you confirm.', body, foot), (fd, action) => {
        const t = String(fd.get('text') || '');
        if (action === 'apply' && planned && planned.text === t) {
          let last = null;
          planned.records.forEach((r) => { last = applyRecord(r); });
          save();
          toast(plural(planned.records.length, 'record') + ' applied');
          if (planned.records.length === 1 && last) location.hash = '#/app/' + encodeURIComponent(last.id);
          render();
          return;
        }
        try {
          const records = parseRecords(t);
          const plans = records.map(planRecord);
          planned = { text: t, records };
          draw(t, '<div class="preview">' + plans.map((p) =>
            '<div class="preview-item"><div class="head"><span class="badge ' + (p.isNew ? 'badge-ok">Create new' : 'badge-accent">Update existing') + '</span><strong>' + esc(p.name) + '</strong></div>' +
            '<ul>' + p.lines.map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul></div>').join('') + '</div>');
        } catch (err) {
          planned = null;
          draw(t, '<div class="error" role="alert">' + esc(err.message) + '</div>');
        }
        return false;
      });
    };
    draw('', '');
    // Offer clipboard contents if the browser allows it
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then((clip) => {
        const ta = $('textarea[name="text"]', dlg);
        if (ta && !ta.value && /JOBTRACKER\s+v\d+/i.test(clip || '')) ta.value = clip;
      }).catch(() => {});
    }
  }

  // ---------- Import / export ----------
  function exportData() {
    state.lastExport = new Date().toISOString();
    save();
    const data = Object.assign({ app: 'job-tracker', exportedAt: state.lastExport }, state);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'job-tracker-export-' + today() + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Exported');
    render();
  }
  const fileInput = $('#import-file');
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!f) return;
    f.text().then((text) => {
      let data;
      try { data = JSON.parse(text); } catch (e) { toast('That file is not valid JSON.'); return; }
      if (!data || !Array.isArray(data.applications)) { toast('That file is not a Job Tracker export.'); return; }
      const n = data.applications.length;
      if (!confirm('Replace all current data with this file (' + plural(n, 'application') + ', ' + plural(arr(data.contacts).length, 'contact') + ')? Export first if you want to keep what is here.')) return;
      state = normalize(data);
      save();
      toast('Imported ' + plural(n, 'application'));
      location.hash = '#/board';
      render();
    });
  });

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ---------- Events ----------
  function requestStage(a, stage) {
    if (!a || stage === a.stage || !STAGE_IDS.includes(stage)) return;
    if (stage === 'closed') { closeDialog(a); return; }
    setStage(a, stage, true);
    save();
    toast('Moved to ' + stageName(stage));
    render();
  }

  const actions = {
    'new-app': () => appDialog(null),
    'edit-app': (el) => appDialog(appById(el.dataset.id)),
    'paste': () => pasteDialog(),
    'export': () => exportData(),
    'import': () => fileInput.click(),
    'close-app': (el) => closeDialog(appById(el.dataset.id)),
    'reopen': (el) => {
      const a = appById(el.dataset.id);
      const from = a.closedReason;
      a.stage = 'lead';
      a.closedReason = '';
      a.closedNote = '';
      a.timeline.push(entry('Stage', 'Reopened' + (from ? ' (was ' + from + ')' : '') + ', moved to Lead'));
      touch(a); save(); render();
    },
    'set-next': (el) => nextDialog(appById(el.dataset.id)),
    'next-done': (el) => { const a = appById(el.dataset.id); completeNext(a); save(); toast('Done'); render(); },
    'del-entry': (el) => {
      const a = appById(el.dataset.id);
      a.timeline = a.timeline.filter((e) => e.id !== el.dataset.entry);
      touch(a); save(); render();
    },
    'link-contact': (el) => linkContactDialog(appById(el.dataset.id)),
    'unlink-contact': (el) => {
      const a = appById(el.dataset.id);
      a.contactIds = a.contactIds.filter((id) => id !== el.dataset.contact);
      touch(a); save(); render();
    },
    'new-contact': () => contactDialog(null),
    'edit-contact': (el) => contactDialog(contactById(el.dataset.contact)),
    'contact-filter': (el) => { ui.contactFilter = el.dataset.filter; render(); },
    'add-doc': (el) => docDialog(appById(el.dataset.id)),
    'del-doc': (el) => {
      const a = appById(el.dataset.id);
      a.documents = a.documents.filter((d) => d.id !== el.dataset.doc);
      touch(a); save(); render();
    },
    'del-tailor': (el) => {
      const a = appById(el.dataset.id);
      a.tailoring[el.dataset.kind].splice(Number(el.dataset.index), 1);
      touch(a); save(); render();
    }
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !actions[el.dataset.action]) return;
    e.preventDefault();
    actions[el.dataset.action](el);
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.change === 'stage') {
      const a = appById(el.dataset.id);
      const want = el.value;
      el.value = a.stage;
      requestStage(a, want);
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'board-search') {
      ui.q = e.target.value;
      const cols = $('#board-cols');
      if (cols) cols.innerHTML = columnsHTML();
    } else if (e.target.id === 'contact-search') {
      ui.contactQ = e.target.value;
      const body = $('#contacts-body');
      if (body) body.innerHTML = contactRowsHTML();
    }
  });

  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.closest('dialog') || !f.dataset.form) return;
    e.preventDefault();
    const a = appById(f.dataset.id);
    if (!a) return;
    const fd = new FormData(f);
    if (f.dataset.form === 'log') {
      a.timeline.push(normEntry({ type: fd.get('type'), date: fd.get('date'), text: fd.get('text') }));
      if (str(fd.get('next'))) a.next = normNext({ text: fd.get('next'), due: fd.get('due') });
      toast('Logged');
    } else if (f.dataset.form === 'tailor') {
      const t = str(fd.get('text'));
      if (t && !a.tailoring[f.dataset.kind].includes(t)) a.tailoring[f.dataset.kind].push(t);
    }
    touch(a);
    save();
    render();
  });

  // Drag and drop on the board (desktop)
  const elOf = (t) => (t && t.nodeType === 1 ? t : t && t.parentElement);
  document.addEventListener('dragstart', (e) => {
    const card = elOf(e.target) && elOf(e.target).closest('.card');
    if (!card) return;
    e.dataTransfer.setData('text/plain', card.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => card.classList.add('dragging'));
  });
  document.addEventListener('dragend', () => {
    $$('.dragging, .drop-target').forEach((x) => x.classList.remove('dragging', 'drop-target'));
  });
  document.addEventListener('dragover', (e) => {
    const col = elOf(e.target) && elOf(e.target).closest('.column');
    if (!col) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    $$('.drop-target').forEach((x) => { if (x !== col) x.classList.remove('drop-target'); });
    col.classList.add('drop-target');
  });
  document.addEventListener('drop', (e) => {
    const col = elOf(e.target) && elOf(e.target).closest('.column');
    if (!col) return;
    e.preventDefault();
    col.classList.remove('drop-target');
    requestStage(appById(e.dataTransfer.getData('text/plain')), col.dataset.stage);
  });

  // Keep tabs in sync if the app is open in two tabs
  window.addEventListener('storage', (e) => {
    if (e.key === STORE_KEY) { state = load(); if (!dlg.open) render(); }
  });

  window.addEventListener('hashchange', () => {
    if (dlg.open) dlg.close();
    render();
    window.scrollTo(0, 0);
    view.focus({ preventScroll: true });
  });

  render();
})();
