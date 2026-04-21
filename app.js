/* ============================================================
   QRONOS 2.0 · app.js
   v2.1 — Plantas reales, regla 0%, sincronización multi-dispositivo
   ============================================================ */
'use strict';

/* ── CONFIG DE PLANTAS ── */
const PLANTAS_CONFIG = {
  groups: [
    {
      name: 'Azteca', color: '#1a80ff',
      plants: [
        { name: 'Caldos',      meta: 73 },
        { name: 'Líquidos',    meta: 75 },
        { name: 'Promociones', meta: 81 },
      ],
    },
    {
      name: "RTD's", color: '#00d4ff',
      plants: [
        { name: 'Krones Pet',  meta: 64 },
        { name: 'Krones Lata', meta: 71 },
        { name: 'SI DEL',      meta: 61 },
      ],
    },
  ],
};

const getAllPlants  = () => PLANTAS_CONFIG.groups.flatMap(g => g.plants);
const getPlantMeta = (name) => { const p = getAllPlants().find(p => p.name === name); return p ? p.meta : 80; };
const getPlantGroup = (name) => { for (const g of PLANTAS_CONFIG.groups) { if (g.plants.some(p => p.name === name)) return g.name; } return ''; };

const PLANT_COLORS = (() => {
  const palette = ['#1a80ff','#00d4ff','#6c5ce7','#00e5a0','#ffb830','#ff6b6b'];
  const map = {};
  getAllPlants().forEach((p, i) => { map[p.name] = palette[i % palette.length]; });
  return map;
})();

/* ── CONSTANTES ── */
const STORAGE_KEY = 'qronos_v2_records';
const API_BASE    = 'http://localhost:3000';
const COLOR_ZERO  = '#cbd5e1';

/* ── STATE ── */
let allRecords    = [];
let mainChart     = null;
let trendChart    = null;
let isSpeaking    = false;
let isListening   = false;
let recognition   = null;
let currentFilter = { planta: '', fecha: '' };
let syncOnline    = false;

/* ── UTILS ── */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function offsetDate(days = 0) {
  const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10);
}

function getReportDate() {
  const today = new Date(); const dow = today.getDay();
  const back  = dow === 0 ? 2 : 1;
  const d = new Date(today); d.setDate(d.getDate() - back); return d.toISOString().slice(0, 10);
}

const isSinProduccion = (rec) => Number(rec.eficiencia) === 0;

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast${type ? ' toast-' + type : ''}`;
  t.classList.remove('hidden'); clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3200);
}

/* ── SINCRONIZACIÓN MULTI-DISPOSITIVO ── */
async function loadFromBackend() {
  try {
    const res = await fetch(`${API_BASE}/records`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data.records)) { syncOnline = true; return data.records; }
  } catch (e) { syncOnline = false; }
  return null;
}

async function saveToBackend(records) {
  if (!syncOnline) return;
  try {
    await fetch(`${API_BASE}/records`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records }), signal: AbortSignal.timeout(5000),
    });
  } catch (e) { syncOnline = false; updateSyncIndicator(); }
}

function updateSyncIndicator() {
  const dot = document.getElementById('aiStatusDot');
  if (dot) { dot.className = syncOnline ? 'ai-status-dot online' : 'ai-status-dot'; dot.title = syncOnline ? 'Sincronizado (multi-dispositivo)' : 'Modo local'; }
  const dotEl = document.querySelector('#reportDatePill .pill-dot');
  if (dotEl) { dotEl.style.background = syncOnline ? '' : '#ffb830'; dotEl.title = syncOnline ? 'Sincronizado' : 'Solo local'; }
}

/* ── LOCAL STORAGE ── */
function saveToLocalStorage() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(allRecords)); } catch(e) {} }
function loadFromLocalStorage() { try { const r = localStorage.getItem(STORAGE_KEY); if (r) return JSON.parse(r); } catch(e) {} return null; }

function saveRecords() { saveToLocalStorage(); saveToBackend(allRecords); }

async function loadRecords() {
  const fromBackend = await loadFromBackend();
  if (fromBackend && fromBackend.length > 0) { allRecords = fromBackend; saveToLocalStorage(); updateSyncIndicator(); return; }
  const fromLocal = loadFromLocalStorage();
  if (fromLocal && fromLocal.length > 0) { allRecords = fromLocal; if (syncOnline) saveToBackend(allRecords); updateSyncIndicator(); return; }
  allRecords = generateSeedData(); saveRecords(); updateSyncIndicator();
}

/* ── SEED DATA ── */
function generateSeedData() {
  const records = [];
  getAllPlants().forEach(({ name, meta }) => {
    for (let i = 13; i >= 0; i--) {
      const fecha   = offsetDate(-i);
      const sinProd = Math.random() < 0.10;
      const eff     = sinProd ? 0 : Math.max(meta - 15, Math.min(meta + 10, +(meta + (Math.random() - 0.45) * 18).toFixed(1)));
      records.push({ id: uid(), fecha, planta: name, eficiencia: eff, meta });
    }
  });
  return records;
}

/* ── DATA HELPERS ── */
function getSnapshotByDate(fecha) {
  const snap = {};
  allRecords.filter(r => r.fecha === fecha).forEach(r => { snap[r.planta] = r; });
  return snap;
}
function getLastNDates(n = 14) { return [...new Set(allRecords.map(r => r.fecha))].sort().slice(-n); }

/* ── RENDER KPI ── */
function renderKPIs() {
  const reportDate = getReportDate(); const snapshot = getSnapshotByDate(reportDate);
  const container  = document.getElementById('kpiRow');
  container.innerHTML = '';
  const hasAny = getAllPlants().some(p => snapshot[p.name]);

  if (!hasAny) {
    container.innerHTML = `<p style="color:rgba(255,255,255,0.5);font-size:.85rem;padding:8px 0;grid-column:1/-1">Sin datos para ${formatDate(reportDate)}. Agrega registros en "Plantas".</p>`;
    return;
  }

  PLANTAS_CONFIG.groups.forEach(group => {
    const groupEl = document.createElement('div');
    groupEl.className = 'kpi-group-label';
    groupEl.innerHTML = `<span style="border-left:3px solid ${group.color};padding-left:8px">${group.name}</span>`;
    container.appendChild(groupEl);

    group.plants.forEach(({ name, meta }) => {
      const rec  = snapshot[name];
      const card = document.createElement('div');
      if (!rec) {
        card.className = 'kpi-card status-neutral';
        card.innerHTML = `<p class="kpi-plant">${name}</p><div class="kpi-value" style="font-size:1.1rem;color:#9aafc7">Sin datos</div><p class="kpi-meta">Meta: ${meta}%</p>`;
        container.appendChild(card); return;
      }
      const sinProd = isSinProduccion(rec);
      const delta   = sinProd ? null : +(rec.eficiencia - meta).toFixed(1);
      const status  = sinProd ? 'zero' : (delta >= 0 ? 'above' : (delta >= -5 ? 'warn' : 'below'));
      card.className = `kpi-card status-${status}`;
      card.innerHTML  = sinProd
        ? `<p class="kpi-plant">${name}</p><div class="kpi-value" style="font-size:1.2rem;color:#9aafc7">Sin Prod.</div><p class="kpi-meta">Meta: ${meta}%</p><span class="kpi-delta" style="background:rgba(0,0,0,.06);color:#9aafc7">⏸ Sin operación</span>`
        : `<p class="kpi-plant">${name}</p><div class="kpi-value">${rec.eficiencia}<span class="kpi-unit">%</span></div><p class="kpi-meta">Meta: ${meta}%</p><span class="kpi-delta ${delta >= 0 ? 'pos' : 'neg'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}%</span>`;
      container.appendChild(card);
    });
  });
}

/* ── RENDER ALERTAS ── */
function renderAlerts() {
  const reportDate = getReportDate(); const snapshot = getSnapshotByDate(reportDate);
  const list = document.getElementById('alertsList'); const countBadge = document.getElementById('alertCount');
  const alerts = [];

  getAllPlants().forEach(({ name, meta }) => {
    const rec = snapshot[name]; if (!rec) return;
    if (isSinProduccion(rec)) { alerts.push({ type: 'warn', icon: '⏸️', msg: `${name} — Día sin producción (${getPlantGroup(name)})` }); return; }
    const delta = +(rec.eficiencia - meta).toFixed(1);
    if      (delta <= -5) alerts.push({ type: 'danger', icon: '🔴', msg: `${name}: ${rec.eficiencia}% — ${Math.abs(delta)}% bajo meta (${meta}%)` });
    else if (delta < 0)   alerts.push({ type: 'warn',   icon: '🟡', msg: `${name}: ${rec.eficiencia}% — ${Math.abs(delta)}% bajo meta (${meta}%)` });
    else                  alerts.push({ type: 'ok',     icon: '🟢', msg: `${name}: ${rec.eficiencia}% — ▲${delta}% sobre meta` });
  });

  countBadge.textContent = alerts.filter(a => a.type !== 'ok').length;
  list.innerHTML = alerts.length === 0
    ? '<p class="empty-state">Sin datos para el período.</p>'
    : alerts.map(a => `<div class="alert-item ${a.type}"><span class="alert-icon">${a.icon}</span><span>${a.msg}</span></div>`).join('');
}

/* ── CHART PRINCIPAL ── */
function renderMainChart() {
  const reportDate = getReportDate(); const snapshot = getSnapshotByDate(reportDate);
  document.getElementById('chartDateLabel').textContent = formatDate(reportDate);
  document.getElementById('reportDateLabel').textContent = formatDate(reportDate);
  document.getElementById('rankingDateLabel').textContent = formatDate(reportDate);

  const labels = [], effData = [], metData = [], bgColors = [], tooltipExtras = [];

  getAllPlants().forEach(({ name, meta }) => {
    const rec = snapshot[name]; if (!rec) return;
    labels.push(name); metData.push(meta);
    if (isSinProduccion(rec)) {
      effData.push(null); bgColors.push(COLOR_ZERO); tooltipExtras.push('Sin producción');
    } else {
      effData.push(rec.eficiencia);
      bgColors.push(rec.eficiencia >= meta ? 'rgba(26,128,255,0.82)' : 'rgba(255,77,106,0.78)');
      tooltipExtras.push(null);
    }
  });

  const sinProdPlugin = {
    id: 'sinProdMarkers',
    afterDatasetsDraw(chart) {
      const { ctx: c, scales: { x, y } } = chart;
      labels.forEach((label, i) => {
        if (tooltipExtras[i] !== 'Sin producción') return;
        const xPos = x.getPixelForValue(i);
        const yPos = y.getPixelForValue(10);
        c.save(); c.fillStyle = '#9aafc7'; c.font = '10px DM Sans, sans-serif';
        c.textAlign = 'center'; c.fillText('⏸ Sin prod.', xPos, yPos); c.restore();
      });
    },
  };

  const ctx = document.getElementById('mainChart').getContext('2d');
  if (mainChart) mainChart.destroy();

  mainChart = new Chart(ctx, {
    type: 'bar', plugins: [sinProdPlugin],
    data: {
      labels,
      datasets: [
        { label: 'Eficiencia %', data: effData, backgroundColor: bgColors, borderRadius: 8, borderSkipped: false },
        { label: 'Meta %', data: metData, type: 'line', borderColor: '#ffb830', backgroundColor: 'transparent', borderWidth: 2, borderDash: [6, 4], pointRadius: 4, pointBackgroundColor: '#ffb830', tension: 0 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0c1a2e', titleColor: '#fff', bodyColor: '#9aafc7',
          borderColor: 'rgba(26,128,255,0.3)', borderWidth: 1, padding: 10,
          callbacks: {
            label(ctx) {
              if (ctx.datasetIndex === 0) { const extra = tooltipExtras[ctx.dataIndex]; return extra ? ` ⏸ ${extra}` : ` Eficiencia: ${ctx.parsed.y}%`; }
              return ` Meta: ${ctx.parsed.y}%`;
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#6b7b94', font: { size: 10 }, maxRotation: 35 } },
        y: { min: 0, max: 100, grid: { color: 'rgba(0,0,0,0.06)', drawTicks: false }, ticks: { color: '#6b7b94', font: { size: 11 }, callback: v => v + '%', stepSize: 20 } },
      },
    },
  });
}

/* ── CHART TENDENCIAS ── */
function renderTrendChart(filterPlanta = 'all') {
  const dates = getLastNDates(14);

  const buildDataset = (planta, color) => ({
    label: planta,
    data: dates.map(d => { const snap = getSnapshotByDate(d); const rec = snap[planta]; return (!rec || isSinProduccion(rec)) ? null : rec.eficiencia; }),
    borderColor: color, backgroundColor: filterPlanta !== 'all' ? `${color}18` : 'transparent',
    fill: filterPlanta !== 'all', borderWidth: 2.5,
    pointRadius: dates.map(d => { const snap = getSnapshotByDate(d); const rec = snap[planta]; return (rec && isSinProduccion(rec)) ? 7 : 3; }),
    pointBackgroundColor: dates.map(d => { const snap = getSnapshotByDate(d); const rec = snap[planta]; return (rec && isSinProduccion(rec)) ? COLOR_ZERO : color; }),
    pointStyle: dates.map(d => { const snap = getSnapshotByDate(d); const rec = snap[planta]; return (rec && isSinProduccion(rec)) ? 'crossRot' : 'circle'; }),
    tension: 0.35, spanGaps: false,
  });

  const allPlants = getAllPlants();
  const datasets  = filterPlanta === 'all'
    ? allPlants.map(p => buildDataset(p.name, PLANT_COLORS[p.name]))
    : [buildDataset(filterPlanta, PLANT_COLORS[filterPlanta] || '#1a80ff')];

  const ctx = document.getElementById('trendChart').getContext('2d');
  if (trendChart) trendChart.destroy();

  trendChart = new Chart(ctx, {
    type: 'line',
    data: { labels: dates.map(d => { const [,m,day] = d.split('-'); return `${day}/${m}`; }), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: filterPlanta === 'all', labels: { color: '#6b7b94', font: { size: 10 }, boxWidth: 10, padding: 12 } },
        tooltip: {
          backgroundColor: '#0c1a2e', titleColor: '#fff', bodyColor: '#9aafc7',
          borderColor: 'rgba(26,128,255,0.3)', borderWidth: 1, padding: 10,
          callbacks: {
            label(ctx) {
              const val = ctx.parsed.y;
              if (val === null || val === undefined) {
                const fecha = dates[ctx.dataIndex]; const snap = getSnapshotByDate(fecha); const rec = snap[ctx.dataset.label];
                return (rec && isSinProduccion(rec)) ? ` ${ctx.dataset.label}: ⏸ Sin producción` : ` ${ctx.dataset.label}: Sin datos`;
              }
              return ` ${ctx.dataset.label}: ${val}%`;
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#6b7b94', font: { size: 10 } } },
        y: { min: 0, max: 100, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { color: '#6b7b94', font: { size: 10 }, callback: v => v + '%', stepSize: 20 } },
      },
    },
  });
}

/* ── RANKING (excluye 0%) ── */
function renderRanking() {
  const reportDate = getReportDate(); const snapshot = getSnapshotByDate(reportDate);
  const list = document.getElementById('rankingList');
  const allPlants = getAllPlants();
  const medalClasses = ['gold', 'silver', 'bronze'];

  const activos = allPlants.map(({ name, meta }) => { const rec = snapshot[name]; if (!rec || isSinProduccion(rec)) return null; return { ...rec, meta }; }).filter(Boolean).sort((a, b) => b.eficiencia - a.eficiencia);
  const sinProd = allPlants.filter(({ name }) => { const rec = snapshot[name]; return rec && isSinProduccion(rec); });

  const activosHtml = activos.map((rec, i) => {
    const above = rec.eficiencia >= rec.meta; const pct = Math.min(100, rec.eficiencia);
    return `<div class="ranking-item">
      <div class="rank-number ${medalClasses[i] || ''}">${i + 1}</div>
      <div class="rank-bar-wrap">
        <div class="rank-bar-label">
          <span>${rec.planta} <small style="color:#9aafc7;font-size:.7em">${getPlantGroup(rec.planta)}</small></span>
          <span style="color:${above ? '#006944' : '#b02030'}">${above ? '▲' : '▼'} ${Math.abs(+(rec.eficiencia - rec.meta).toFixed(1))}%</span>
        </div>
        <div class="rank-bar-track"><div class="rank-bar-fill ${above ? '' : 'below-meta'}" style="width:${pct}%"></div></div>
      </div>
      <span class="rank-pct">${rec.eficiencia}%</span>
    </div>`;
  }).join('');

  const sinProdHtml = sinProd.length === 0 ? '' : `
    <div style="margin-top:12px;padding:8px 0;border-top:1px solid rgba(0,0,0,.06)">
      <p style="font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#9aafc7;margin-bottom:8px">⏸ Sin producción (excluidas del ranking)</p>
      ${sinProd.map(({ name }) => `
        <div class="ranking-item" style="opacity:.5">
          <div class="rank-number">—</div>
          <div class="rank-bar-wrap">
            <div class="rank-bar-label"><span>${name}</span><span style="color:#9aafc7">Sin operación</span></div>
            <div class="rank-bar-track"><div class="rank-bar-fill" style="width:0%;background:${COLOR_ZERO}"></div></div>
          </div>
          <span class="rank-pct" style="color:#9aafc7">⏸</span>
        </div>`).join('')}
    </div>`;

  list.innerHTML = (activos.length === 0 && sinProd.length === 0) ? '<p class="empty-state">Sin datos.</p>' : activosHtml + sinProdHtml;
}

/* ── TABLA PLANTAS ── */
function renderTable() {
  const tbody = document.getElementById('plantasTableBody');
  let records = [...allRecords].sort((a, b) => b.fecha.localeCompare(a.fecha) || a.planta.localeCompare(b.planta));
  if (currentFilter.planta) records = records.filter(r => r.planta === currentFilter.planta);
  if (currentFilter.fecha)  records = records.filter(r => r.fecha  === currentFilter.fecha);

  if (records.length === 0) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#9aafc7;padding:20px">Sin registros</td></tr>`; return; }

  tbody.innerHTML = records.map(rec => {
    const sinProd = isSinProduccion(rec);
    const delta   = sinProd ? null : +(rec.eficiencia - rec.meta).toFixed(1);
    const above   = delta !== null && delta >= 0;
    const statusHtml = sinProd
      ? `<span class="status-pill" style="background:rgba(0,0,0,.06);color:#9aafc7">⏸ Sin prod.</span>`
      : `<span class="status-pill ${above ? 'above' : 'below'}">${above ? '▲' : '▼'} ${Math.abs(delta)}%</span>`;
    return `<tr>
      <td>${formatDate(rec.fecha)}</td>
      <td><strong>${rec.planta}</strong><br><small style="color:#9aafc7;font-size:.7em">${getPlantGroup(rec.planta)}</small></td>
      <td style="color:${sinProd ? '#9aafc7' : 'inherit'}">${sinProd ? '—' : rec.eficiencia + '%'}</td>
      <td>${rec.meta}%</td>
      <td>${statusHtml}</td>
      <td>
        <button class="action-btn edit" onclick="openEditModal('${rec.id}')">Editar</button>
        <button class="action-btn del"  onclick="deleteRecord('${rec.id}')">Eliminar</button>
      </td>
    </tr>`;
  }).join('');
}

/* ── FILTROS ── */
function populateFilters() {
  ['filterPlanta', 'trendPlantaSelect'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<option value="${id === 'trendPlantaSelect' ? 'all' : ''}"> ${id === 'trendPlantaSelect' ? 'Todas' : 'Todas'}</option>`;
    PLANTAS_CONFIG.groups.forEach(g => {
      const og = document.createElement('optgroup'); og.label = g.name;
      g.plants.forEach(p => { const o = document.createElement('option'); o.value = p.name; o.textContent = p.name; og.appendChild(o); });
      el.appendChild(og);
    });
  });
}

/* ── MODAL ── */
function openAddModal() {
  document.getElementById('modalTitle').textContent = 'Nuevo Registro';
  document.getElementById('editId').value           = '';
  document.getElementById('fieldFecha').value       = offsetDate(-1);
  document.getElementById('fieldPlanta').value      = '';
  document.getElementById('fieldEficiencia').value  = '';
  document.getElementById('fieldMeta').value        = '';
  document.getElementById('modal').classList.remove('hidden');
}
function openEditModal(id) {
  const rec = allRecords.find(r => r.id === id); if (!rec) return;
  document.getElementById('modalTitle').textContent = 'Editar Registro';
  document.getElementById('editId').value           = rec.id;
  document.getElementById('fieldFecha').value       = rec.fecha;
  document.getElementById('fieldPlanta').value      = rec.planta;
  document.getElementById('fieldEficiencia').value  = rec.eficiencia;
  document.getElementById('fieldMeta').value        = rec.meta;
  document.getElementById('modal').classList.remove('hidden');
}
function closeModal() { document.getElementById('modal').classList.add('hidden'); }

function handleFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('editId').value;
  const fecha = document.getElementById('fieldFecha').value;
  const planta = document.getElementById('fieldPlanta').value;
  const eficiencia = parseFloat(document.getElementById('fieldEficiencia').value);
  const meta = parseFloat(document.getElementById('fieldMeta').value);
  if (!fecha || !planta || isNaN(eficiencia) || isNaN(meta)) { showToast('Completa todos los campos', 'error'); return; }
  if (eficiencia < 0 || eficiencia > 200) { showToast('Eficiencia entre 0 y 200', 'error'); return; }

  if (id) { const idx = allRecords.findIndex(r => r.id === id); if (idx > -1) allRecords[idx] = { id, fecha, planta, eficiencia, meta }; showToast('Actualizado ✓', 'success'); }
  else { allRecords.push({ id: uid(), fecha, planta, eficiencia, meta }); showToast(eficiencia === 0 ? '⏸ Sin producción registrado' : 'Guardado ✓', 'success'); }

  saveRecords(); closeModal(); renderAll();
}

function deleteRecord(id) {
  if (!confirm('¿Eliminar este registro?')) return;
  allRecords = allRecords.filter(r => r.id !== id);
  saveRecords(); renderAll(); showToast('Eliminado', '');
}

/* ── RENDER ALL ── */
function renderAll() {
  renderKPIs(); renderAlerts(); renderMainChart(); renderRanking(); renderTable();
  const tp = document.getElementById('trendPlantaSelect').value;
  renderTrendChart(tp || 'all');
}

/* ── VOZ TTS ── */
function buildExecutiveSummary() {
  const reportDate = getReportDate(); const snapshot = getSnapshotByDate(reportDate); const allPlants = getAllPlants();
  if (allPlants.every(p => !snapshot[p.name])) return `No hay datos para el ${formatDate(reportDate)}.`;

  let texto = `Reporte ejecutivo al ${formatDate(reportDate)}. `;
  PLANTAS_CONFIG.groups.forEach(group => {
    texto += `Grupo ${group.name}. `;
    group.plants.forEach(({ name, meta }) => {
      const rec = snapshot[name];
      if (!rec) { texto += `${name} sin datos. `; return; }
      if (isSinProduccion(rec)) { texto += `${name}: día sin producción. `; return; }
      const delta = +(rec.eficiencia - meta).toFixed(1);
      texto += `${name}: ${rec.eficiencia} por ciento, ${delta >= 0 ? `${delta} puntos sobre meta` : `${Math.abs(delta)} puntos bajo meta`}. `;
    });
  });

  const activos = allPlants.map(p => snapshot[p.name]).filter(r => r && !isSinProduccion(r));
  if (activos.length > 0) {
    const mejor = activos.reduce((a, b) => b.eficiencia > a.eficiencia ? b : a);
    const peor  = activos.reduce((a, b) => b.eficiencia < a.eficiencia ? b : a);
    texto += `La mejor es ${mejor.planta} con ${mejor.eficiencia} por ciento. La que requiere atención es ${peor.planta} con ${peor.eficiencia} por ciento. `;
  }
  const sinProd = allPlants.filter(p => { const r = snapshot[p.name]; return r && isSinProduccion(r); });
  if (sinProd.length > 0) texto += `Plantas sin operación: ${sinProd.map(p => p.name).join(', ')}. `;
  const bajoMeta = activos.filter(r => r.eficiencia < r.meta);
  texto += bajoMeta.length > 0 ? `Bajo meta: ${bajoMeta.map(r => r.planta).join(', ')}. ` : 'Todas las plantas activas cumplen su meta. ';
  return texto + 'Fin del reporte.';
}

function speakText(text) {
  if (!('speechSynthesis' in window)) { showToast('Síntesis de voz no disponible', 'error'); return; }
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'es-MX'; utt.rate = 0.95; utt.pitch = 1;
  const esVoice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('es'));
  if (esVoice) utt.voice = esVoice;
  utt.onstart = () => { isSpeaking = true; document.getElementById('btnVoiceReport').style.color = 'var(--electric)'; };
  utt.onend   = () => { isSpeaking = false; document.getElementById('btnVoiceReport').style.color = ''; };
  utt.onerror = () => { isSpeaking = false; document.getElementById('btnVoiceReport').style.color = ''; };
  window.speechSynthesis.speak(utt);
}

/* ── VOZ STT ── */
function initSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { document.getElementById('btnMic').style.display = 'none'; return; }
  recognition = new SR(); recognition.lang = 'es-MX'; recognition.continuous = false; recognition.interimResults = false;
  recognition.onstart  = () => { isListening = true;  document.getElementById('btnMic').classList.add('listening'); showVoiceBanner('Escuchando…'); };
  recognition.onend    = () => { isListening = false; document.getElementById('btnMic').classList.remove('listening'); hideVoiceBanner(); };
  recognition.onerror  = (e) => { isListening = false; document.getElementById('btnMic').classList.remove('listening'); hideVoiceBanner(); if (e.error !== 'aborted') showToast('Error mic: ' + e.error, 'error'); };
  recognition.onresult = (e) => { const t = e.results[0][0].transcript.toLowerCase().trim(); showVoiceBanner(`"${t}"`); setTimeout(hideVoiceBanner, 2000); processVoiceCommand(t); };
}

function toggleMic() {
  if (!recognition) { showToast('Reconocimiento de voz no disponible', 'error'); return; }
  if (isListening) recognition.stop(); else try { recognition.start(); } catch(e) { console.warn(e); }
}

function processVoiceCommand(transcript) {
  const commands = [
    { match: ['resumen','eficiencia','reporte','informe'], action: () => speakText(buildExecutiveSummary()) },
    { match: ['peor planta'], action: () => { const a = getAllPlants().map(p => getSnapshotByDate(getReportDate())[p.name]).filter(r => r && !isSinProduccion(r)).sort((a,b)=>a.eficiencia-b.eficiencia); if (a.length) speakText(`La peor planta es ${a[0].planta} con ${a[0].eficiencia} por ciento.`); } },
    { match: ['mejor planta'], action: () => { const a = getAllPlants().map(p => getSnapshotByDate(getReportDate())[p.name]).filter(r => r && !isSinProduccion(r)).sort((a,b)=>b.eficiencia-a.eficiencia); if (a.length) speakText(`La mejor planta es ${a[0].planta} con ${a[0].eficiencia} por ciento.`); } },
    { match: ['detener','para','stop'], action: () => window.speechSynthesis.cancel() },
  ];
  for (const cmd of commands) { if (cmd.match.some(w => transcript.includes(w))) { cmd.action(); return; } }
  if (transcript.includes('qronos') || transcript.includes('cronos')) { speakText(buildExecutiveSummary()); return; }
  if (transcript.length > 3) { switchTab('chat'); sendChatMessage(transcript); }
}

function showVoiceBanner(text) { document.getElementById('voiceBannerText').textContent = text; document.getElementById('voiceBanner').classList.remove('hidden'); }
function hideVoiceBanner()      { document.getElementById('voiceBanner').classList.add('hidden'); }

/* ── CHAT IA ── */
function buildDataContext() {
  const reportDate = getReportDate(); const snapshot = getSnapshotByDate(reportDate); const last7 = getLastNDates(7);
  const history = {}; const promedios = {};
  getAllPlants().forEach(({ name }) => {
    const recs = last7.map(d => { const snap = getSnapshotByDate(d); const r = snap[name]; return r ? { fecha: d, eficiencia: r.eficiencia, meta: r.meta, sin_produccion: isSinProduccion(r) } : null; }).filter(Boolean);
    history[name] = recs;
    const activos = recs.filter(r => !r.sin_produccion);
    promedios[name] = activos.length > 0 ? +(activos.reduce((s,r) => s + r.eficiencia, 0) / activos.length).toFixed(1) : null;
  });
  return { fecha_reporte: reportDate, snapshot_dia: Object.values(snapshot), historial_7_dias: history, promedio_semanal: promedios, nota_cero: 'Los registros con 0% = Día sin Producción, excluidos de promedios.', grupos_plantas: PLANTAS_CONFIG.groups.map(g => ({ grupo: g.name, plantas: g.plants })) };
}

function appendMessage(role, content, isTyping = false) {
  const container = document.getElementById('chatMessages');
  const wrapper   = document.createElement('div');
  wrapper.className = `msg ${role === 'user' ? 'msg-user' : ''}`;
  wrapper.id = isTyping ? 'typingIndicator' : '';
  const avatar = document.createElement('div'); avatar.className = 'msg-avatar'; avatar.textContent = role === 'user' ? 'U' : 'Q';
  const bubble = document.createElement('div'); bubble.className = 'msg-bubble';
  if (isTyping) bubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  else bubble.innerHTML = content.replace(/\n/g, '<br>');
  role === 'user' ? (wrapper.appendChild(bubble), wrapper.appendChild(avatar)) : (wrapper.appendChild(avatar), wrapper.appendChild(bubble));
  container.appendChild(wrapper); container.scrollTop = container.scrollHeight;
  return wrapper;
}
function removeTypingIndicator() { document.getElementById('typingIndicator')?.remove(); }

async function sendChatMessage(text) {
  if (!text.trim()) return;
  const input = document.getElementById('chatInput'); const btnSnd = document.getElementById('btnSend'); const dot = document.getElementById('aiStatusDot');
  input.value = ''; input.style.height = 'auto'; btnSnd.disabled = true; dot.className = 'ai-status-dot thinking';
  appendMessage('user', text); appendMessage('ai', '', true);
  try {
    const res = await fetch(`${API_BASE}/analizar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pregunta: text, datos: buildDataContext() }) });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error || `HTTP ${res.status}`); }
    const result = await res.json(); removeTypingIndicator(); appendMessage('ai', result.respuesta || 'Sin respuesta.'); dot.className = 'ai-status-dot online';
  } catch (err) {
    removeTypingIndicator();
    const data = buildDataContext(); const snap = data.snapshot_dia;
    const activos = (snap||[]).filter(r => r.eficiencia > 0); const sinProd = (snap||[]).filter(r => r.eficiencia === 0);
    const sorted = [...activos].sort((a,b)=>b.eficiencia-a.eficiencia);
    const fallback = [`📊 **Análisis local — ${data.fecha_reporte}**`,'',
      sorted[0] ? `🏆 Mejor: ${sorted[0].planta} (${sorted[0].eficiencia}%)` : '',
      sorted[sorted.length-1] ? `⚠️ Crítica: ${sorted[sorted.length-1].planta} (${sorted[sorted.length-1].eficiencia}%)` : '',
      '',
      activos.filter(r=>r.eficiencia>=r.meta).length>0 ? `✅ Sobre meta: ${activos.filter(r=>r.eficiencia>=r.meta).map(r=>`${r.planta} ${r.eficiencia}%`).join(', ')}` : '',
      activos.filter(r=>r.eficiencia<r.meta).length>0  ? `🔴 Bajo meta: ${activos.filter(r=>r.eficiencia<r.meta).map(r=>`${r.planta} ${r.eficiencia}%`).join(', ')}` : '✅ Todas cumplen meta',
      sinProd.length>0 ? `⏸ Sin producción: ${sinProd.map(r=>r.planta).join(', ')}` : '',
    ].filter(Boolean).join('\n');
    appendMessage('ai', fallback + '\n\n_(Modo sin conexión — conecta el servidor para IA real)_');
    dot.className = 'ai-status-dot'; showToast('Backend no disponible.', 'error');
  } finally { btnSnd.disabled = false; }
}

/* ── TABS ── */
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.tab-content').forEach(s => s.classList.toggle('active', s.id === `tab-${tabId}`));
  if (tabId === 'tendencias') { const tp = document.getElementById('trendPlantaSelect').value; renderTrendChart(tp || 'all'); renderRanking(); }
}

/* ── ESTILOS DINÁMICOS ── */
function injectDynamicStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .kpi-group-label {
      grid-column: 1 / -1;
      font-family: var(--font-display);
      font-size: .78rem; font-weight: 700;
      letter-spacing: .08em; text-transform: uppercase;
      color: rgba(255,255,255,.5); margin-top: 4px; margin-bottom: -2px;
    }
    .kpi-card.status-zero::before { background: linear-gradient(90deg,#9aafc7,#cbd5e1); }
    .kpi-card.status-warn::before { background: linear-gradient(90deg,var(--accent-warn),#ffd080); }
  `;
  document.head.appendChild(style);
}

/* ── EVENTOS ── */
function bindEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  document.getElementById('btnVoiceReport').addEventListener('click', () => { if (isSpeaking) { window.speechSynthesis.cancel(); isSpeaking = false; } else speakText(buildExecutiveSummary()); });
  document.getElementById('btnMic').addEventListener('click', toggleMic);
  document.getElementById('btnAddRecord').addEventListener('click', openAddModal);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', e => { if (e.target === document.getElementById('modal')) closeModal(); });
  document.getElementById('recordForm').addEventListener('submit', handleFormSubmit);

  // Auto-fill meta al seleccionar planta
  document.getElementById('fieldPlanta').addEventListener('change', function() {
    const m = getPlantMeta(this.value); if (this.value && m) document.getElementById('fieldMeta').value = m;
  });

  document.getElementById('filterPlanta').addEventListener('change', e => { currentFilter.planta = e.target.value; renderTable(); });
  document.getElementById('filterFecha').addEventListener('change',  e => { currentFilter.fecha  = e.target.value; renderTable(); });
  document.getElementById('btnClearFilters').addEventListener('click', () => { currentFilter = { planta: '', fecha: '' }; document.getElementById('filterPlanta').value = ''; document.getElementById('filterFecha').value = ''; renderTable(); });
  document.getElementById('trendPlantaSelect').addEventListener('change', e => renderTrendChart(e.target.value));
  document.getElementById('btnSend').addEventListener('click', () => sendChatMessage(document.getElementById('chatInput').value.trim()));
  document.getElementById('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(document.getElementById('chatInput').value.trim()); } });
  document.getElementById('chatInput').addEventListener('input', function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 120) + 'px'; });
  document.querySelectorAll('.quick-btn').forEach(btn => btn.addEventListener('click', () => sendChatMessage(btn.dataset.prompt)));

  // Polling sync cada 30 s
  setInterval(async () => {
    if (!syncOnline) return;
    const fresh = await loadFromBackend();
    if (fresh && fresh.length !== allRecords.length) {
      allRecords = fresh; saveToLocalStorage(); renderAll(); showToast('📡 Datos actualizados de otro dispositivo', '');
    }
  }, 30000);
}

/* ── SPLASH ── */
function hideSplash() {
  document.getElementById('splash').classList.add('fade-out');
  document.getElementById('app').classList.remove('hidden');
  setTimeout(() => { document.getElementById('splash').style.display = 'none'; }, 500);
}

/* ── INIT ── */
async function init() {
  injectDynamicStyles();
  await loadRecords();
  populateFilters();
  bindEvents();
  initSpeechRecognition();
  renderAll();
  updateSyncIndicator();
  setTimeout(hideSplash, 2200);
}

window.openEditModal = openEditModal;
window.deleteRecord  = deleteRecord;
document.addEventListener('DOMContentLoaded', init);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(reg => console.log('[SW]', reg.scope))
      .catch(err => console.warn('[SW] Error:', err));
  });
}
