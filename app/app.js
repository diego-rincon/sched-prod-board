import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000;

const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');

const acked = new Set();
const rows = new Map();

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

function createRow(incident) {
  const li = document.createElement('li');
  li.dataset.testid = 'incident-row';
  li.dataset.id = incident.id;
  li.innerHTML = `<span class="id"></span><span class="sev"></span><span class="what"></span><time></time><span class="action"></span>`;
  li.querySelector('.id').textContent = incident.id;
  li.querySelector('.action').append(acked.has(incident.id) ? ackedMark() : ackButton(incident.id));
  return li;
}

function updateRow(li, incident) {
  li.className = `row ${incident.severity}`;
  li.querySelector('.sev').textContent = incident.severity;
  li.querySelector('.what').textContent = `${incident.service} · ${incident.region} · ${incident.summary}`;
  const time = li.querySelector('time');
  time.dateTime = incident.openedAt;
  time.title = incident.openedAt;
  time.textContent = localTime(incident.openedAt);
}

function ackButton(id) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.testid = 'ack';
  button.textContent = 'Ack';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await ack(id);
      acked.add(id);
      button.replaceWith(ackedMark());
    } catch (err) {
      console.error(err);
      button.disabled = false;
    }
  });
  return button;
}

function ackedMark() {
  const mark = document.createElement('span');
  mark.dataset.testid = 'acked';
  mark.className = 'acked';
  mark.textContent = 'acked';
  return mark;
}

// Keyed by incident id: existing rows (and their buttons) are kept, new ones go on top in API order.
function render(incidents) {
  const seen = new Set();
  let previous = null;
  for (const incident of incidents) {
    seen.add(incident.id);
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
    }
  }
  empty.hidden = incidents.length > 0;
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
