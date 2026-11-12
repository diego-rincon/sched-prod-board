import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000;

const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const panel = document.querySelector('[data-testid="incident-panel"]');

const acked = new Set();
const rows = new Map();
const incidents = new Map();
let selectedId = null;

const timeFormat = new Intl.DateTimeFormat(navigator.languages?.[0] ?? navigator.language, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
});

const buildSha = document.querySelector('meta[name="build"]')?.content ?? 'unknown';
document.querySelector('[data-testid="build-sha"]').textContent = buildSha;

function localTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : timeFormat.format(d);
}

function ackedMark() {
  const mark = document.createElement('span');
  mark.dataset.testid = 'acked';
  mark.className = 'acked';
  mark.textContent = 'acked';
  return mark;
}

function createRow(incident) {
  const li = document.createElement('li');
  li.dataset.testid = 'incident-row';
  li.dataset.id = incident.id;
  li.tabIndex = 0;
  li.setAttribute('role', 'button');
  li.innerHTML = `<span class="id"></span><span class="sev"></span><span class="what"></span><time></time><span class="state"></span>`;
  li.querySelector('.id').textContent = incident.id;
  if (acked.has(incident.id)) li.querySelector('.state').append(ackedMark());
  li.addEventListener('click', () => openPanel(incident.id));
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPanel(incident.id);
    }
  });
  return li;
}

function updateRow(li, incident) {
  li.className = `row ${incident.severity}${incident.id === selectedId ? ' selected' : ''}`;
  li.setAttribute('aria-pressed', String(incident.id === selectedId));
  li.querySelector('.sev').textContent = incident.severity;
  li.querySelector('.what').textContent = `${incident.service} · ${incident.region} · ${incident.summary}`;
  const time = li.querySelector('time');
  time.dateTime = incident.openedAt;
  time.title = incident.openedAt;
  time.textContent = localTime(incident.openedAt);
}

function markRowAcked(id) {
  const state = rows.get(id)?.querySelector('.state');
  if (state && !state.querySelector('[data-testid="acked"]')) state.append(ackedMark());
}

// The panel acks the incident it names, never whatever row is under the pointer.
function renderPanel() {
  const incident = incidents.get(selectedId);
  if (!incident) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  panel.dataset.id = incident.id;
  panel.querySelector('.panel-id').textContent = incident.id;
  panel.querySelector('.panel-sev').textContent = incident.severity;
  panel.querySelector('.panel-service').textContent = `${incident.service} · ${incident.region}`;
  panel.querySelector('.panel-summary').textContent = incident.summary;
  const time = panel.querySelector('time');
  time.dateTime = incident.openedAt;
  time.title = incident.openedAt;
  time.textContent = localTime(incident.openedAt);
  const button = panel.querySelector('[data-testid="panel-ack"]');
  const isAcked = acked.has(incident.id);
  button.hidden = isAcked;
  button.textContent = `Ack ${incident.id}`;
  panel.querySelector('.panel-acked').hidden = !isAcked;
}

function openPanel(id) {
  const previous = rows.get(selectedId);
  if (previous) {
    previous.classList.remove('selected');
    previous.setAttribute('aria-pressed', 'false');
  }
  selectedId = id;
  const row = rows.get(id);
  row?.classList.add('selected');
  row?.setAttribute('aria-pressed', 'true');
  renderPanel();
}

const panelAck = panel.querySelector('[data-testid="panel-ack"]');
panelAck.addEventListener('click', async () => {
  const id = panel.dataset.id;
  if (!id || acked.has(id)) return;
  panelAck.disabled = true;
  try {
    await ack(id);
    acked.add(id);
    markRowAcked(id);
  } catch (err) {
    console.error(err);
  } finally {
    panelAck.disabled = false;
    renderPanel();
  }
});
panel.querySelector('.panel-close').addEventListener('click', () => openPanel(null));

// Keyed by incident id: existing rows are kept, new ones go on top in API order.
function render(list_) {
  const seen = new Set();
  let previous = null;
  for (const incident of list_) {
    seen.add(incident.id);
    incidents.set(incident.id, incident);
    let li = rows.get(incident.id);
    if (!li) {
      li = createRow(incident);
      rows.set(incident.id, li);
    }
    updateRow(li, incident);
    const expectedPosition = previous ? previous.nextSibling : list.firstChild;
    if (li !== expectedPosition) list.insertBefore(li, expectedPosition);
    previous = li;
  }
  for (const [id, li] of rows) {
    if (!seen.has(id)) {
      li.remove();
      rows.delete(id);
      incidents.delete(id);
    }
  }
  empty.hidden = list_.length > 0;
  renderPanel();
}

async function refresh() {
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    board.dataset.updatedAt = page.updatedAt;
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

async function loop() {
  await refresh();
  setTimeout(loop, REFRESH_MS);
}

while (!(await refresh())) {
  await new Promise((r) => setTimeout(r, REFRESH_MS));
}
loader.remove();
list.hidden = false;
setTimeout(loop, REFRESH_MS);