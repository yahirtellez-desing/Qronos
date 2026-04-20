/* ============================================================
   QRONOS 2.0 · app.js
   Frontend — Data, Charts, Voice, Chat IA
   ============================================================ */

'use strict';

/* ──────────────────────────────────────────────
   CONSTANTS & CONFIG
   ────────────────────────────────────────────── */
const STORAGE_KEY   = 'qronos_v2_records';
const API_BASE      = 'https://qronos-production.up.railway.app'; // Backend Node.js
const PLANTAS_LIST  = ['Caldos', 'Liquidos', 'Promociones', 'Krones Pet', 'Krones Lata', 'SI DEL'];
const META_DEFAULT  = 70; // % meta por defecto

/* ──────────────────────────────────────────────
   STATE
   ────────────────────────────────────────────── */
let allRecords    = [];   // Array de {id, fecha, planta, eficiencia, meta}
let mainChart     = null;
let trendChart    = null;
let isSpeaking    = false;
let isListening   = false;
let recognition   = null;
let currentFilter = { planta: '', fecha: '' };

/* ──────────────────────────────────────────────
   UTILITIES
   ────────────────────────────────────────────── */
/** Genera un ID único */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Formatea fecha YYYY-MM-DD a texto legible */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** Obtiene fecha YYYY-MM-DD para un offset de días desde hoy */
function offsetDate(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Calcula la fecha del reporte según reglas de negocio:
 *   Lunes  → ayer (domingo)
 *   Sábado → ayer (viernes)
 *   Domingo→ hace 2 días (viernes)
 *   Resto  → ayer
 */
function getReportDate() {
  const today = new Date();
  const dow   = today.getDay(); // 0=Dom,1=Lun,...,6=Sáb
  let daysBack = 1;
  if (dow === 0) daysBack = 2; // Domingo → viernes
  // Sábado(6) y Lunes(1) y resto → 1 día atrás (ya incluido)
  const d = new Date(today);
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

/** Muestra un toast en pantalla */
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast${type ? ' toast-' + type : ''}`;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3200);
}

/* ──────────────────────────────────────────────
   LOCAL STORAGE — Datos
   ────────────────────────────────────────────── */
function saveRecords() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allRecords));
  } catch (e) {
    console.warn('LocalStorage lleno, intentando IndexedDB…', e);
  }
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      allRecords = JSON.parse(raw);
      return;
    }
  } catch (e) { console.warn('Error leyendo storage:', e); }
  // Si no hay datos, generamos datos de demostración
  allRecords = generateSeedData();
  saveRecords();
}

/** Genera datos de demostración para los últimos 14 días */
function generateSeedData() {
  const records = [];
  const bases   = { 'Caldos': 80, 'Liquidos': 80, 'Promociones': 80, 'Krones Pet': 80, 'Krones Lata': 80, 'SI DEL': 80 };
  const metas   = { 'Caldos': 80, 'Liquidos': 81, 'Promociones': 81, 'Krones Pet':70, 'Krones Lata': 71, 'SI DEL': 61 };

  for (let i = 13; i >= 0; i--) {
    const fecha = offsetDate(-i);
    PLANTAS_LIST.forEach(planta => {
      const base  = bases[planta];
      const noise = (Math.random() - 0.5) * 10;
      const eff   = Math.max(60, Math.min(100, +(base + noise).toFixed(1)));
      records.push({
        id: uid(),
        fecha,
        planta,
        eficiencia: eff,
        meta: metas[planta],
      });
    });
  }
  return records;
}

/* ──────────────────────────────────────────────
   DATA ACCESS HELPERS
   ────────────────────────────────────────────── */
/** Registros para una fecha específica */
function getRecordsByDate(fecha) {
  return allRecords.filter(r => r.fecha === fecha);
}

/** Una entrada por planta para una fecha (último insertado si duplicado) */
function getSnapshotByDate(fecha) {
  const snapshot = {};
  allRecords
    .filter(r => r.fecha === fecha)
    .forEach(r => { snapshot[r.planta] = r; });
  return snapshot; // { 'Planta A': {...}, ... }
}

/** Últimos N días con datos */
function getLastNDates(n = 14) {
  const dates = [...new Set(allRecords.map(r => r.fecha))].sort();
  return dates.slice(-n);
}

/* ──────────────────────────────────────────────
   RENDER — KPI CARDS
   ────────────────────────────────────────────── */
function renderKPIs() {
  const reportDate = getReportDate();
  const snapshot   = getSnapshotByDate(reportDate);
  const container  = document.getElementById('kpiRow');
  container.innerHTML = '';

  // Si no hay datos para el día de reporte, mostrar aviso
  if (Object.keys(snapshot).length === 0) {
    container.innerHTML = `<p style="color:rgba(255,255,255,0.5);font-size:.85rem;padding:8px 0;grid-column:1/-1">
      Sin datos para ${formatDate(reportDate)}. Agrega registros en "Plantas".
    </p>`;
    return;
  }

  PLANTAS_LIST.forEach(planta => {
    const rec = snapshot[planta];
    if (!rec) return;

    const delta  = +(rec.eficiencia - rec.meta).toFixed(1);
    const above  = delta >= 0;
    const status = Math.abs(delta) < 0.5 ? 'neutral' : (above ? 'above' : 'below');

    const card = document.createElement('div');
    card.className = `kpi-card status-${status}`;
    card.innerHTML = `
      <p class="kpi-plant">${planta}</p>
      <div class="kpi-value">${rec.eficiencia}<span class="kpi-unit">%</span></div>
      <p class="kpi-meta">Meta: ${rec.meta}%</p>
      <span class="kpi-delta ${above ? 'pos' : 'neg'}">
        ${above ? '▲' : '▼'} ${Math.abs(delta)}%
      </span>
    `;
    container.appendChild(card);
  });
}

/* ──────────────────────────────────────────────
   RENDER — ALERTAS
   ────────────────────────────────────────────── */
function renderAlerts() {
  const reportDate = getReportDate();
  const snapshot   = getSnapshotByDate(reportDate);
  const list       = document.getElementById('alertsList');
  const countBadge = document.getElementById('alertCount');
  let alerts       = [];

  PLANTAS_LIST.forEach(planta => {
    const rec = snapshot[planta];
    if (!rec) return;
    const delta = rec.eficiencia - rec.meta;

    if (delta <= -5) {
      alerts.push({ type: 'danger', icon: '🔴', msg: `${planta}: eficiencia ${rec.eficiencia}% (${delta.toFixed(1)}% bajo meta)` });
    } else if (delta < 0) {
      alerts.push({ type: 'warn', icon: '🟡', msg: `${planta}: eficiencia ${rec.eficiencia}% (${delta.toFixed(1)}% bajo meta)` });
    } else {
      alerts.push({ type: 'ok', icon: '🟢', msg: `${planta}: eficiencia ${rec.eficiencia}% (▲${delta.toFixed(1)}% sobre meta)` });
    }
  });

  countBadge.textContent = alerts.filter(a => a.type !== 'ok').length;

  if (alerts.length === 0) {
    list.innerHTML = '<p class="empty-state">Sin datos para el período de reporte.</p>';
    return;
  }

  list.innerHTML = alerts.map(a => `
    <div class="alert-item ${a.type}">
      <span class="alert-icon">${a.icon}</span>
      <span>${a.msg}</span>
    </div>
  `).join('');
}

/* ──────────────────────────────────────────────
   CHARTS — Principal (barras por planta)
   ────────────────────────────────────────────── */
function renderMainChart() {
  const reportDate = getReportDate();
  const snapshot   = getSnapshotByDate(reportDate);

  // Actualiza labels de fecha
  document.getElementById('chartDateLabel').textContent   = formatDate(reportDate);
  document.getElementById('reportDateLabel').textContent  = formatDate(reportDate);
  document.getElementById('rankingDateLabel').textContent = formatDate(reportDate);

  const labels    = [];
  const effValues = [];
  const metValues = [];

  PLANTAS_LIST.forEach(planta => {
    const rec = snapshot[planta];
    if (!rec) return;
    labels.push(planta);
    effValues.push(rec.eficiencia);
    metValues.push(rec.meta);
  });

  const ctx = document.getElementById('mainChart').getContext('2d');

  if (mainChart) mainChart.destroy();

  mainChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Eficiencia %',
          data: effValues,
          backgroundColor: effValues.map((v, i) =>
            v >= metValues[i]
              ? 'rgba(26,128,255,0.8)'
              : 'rgba(255,77,106,0.75)'
          ),
          borderRadius: 8,
          borderSkipped: false,
        },
        {
          label: 'Meta %',
          data: metValues,
          type: 'line',
          borderColor: '#ffb830',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 4,
          pointBackgroundColor: '#ffb830',
          tension: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0c1a2e',
          titleColor: '#ffffff',
          bodyColor: '#9aafc7',
          borderColor: 'rgba(26,128,255,0.3)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}%`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#6b7b94', font: { size: 11, family: 'DM Sans' } },
        },
        y: {
          min: 60,
          max: 105,
          grid: { color: 'rgba(0,0,0,0.06)', drawTicks: false },
          ticks: {
            color: '#6b7b94',
            font: { size: 11 },
            callback: v => v + '%',
          },
        },
      },
    },
  });
}

/* ──────────────────────────────────────────────
   CHARTS — Tendencia
   ────────────────────────────────────────────── */
function renderTrendChart(filterPlanta = 'all') {
  const dates   = getLastNDates(14);
  const paletas = [
    '#1a80ff', '#00d4ff', '#00e5a0', '#ffb830', '#ff6b6b',
    '#a29bfe', '#fd79a8', '#6c5ce7', '#00cec9', '#fab1a0',
  ];

  let datasets = [];

  if (filterPlanta === 'all') {
    datasets = PLANTAS_LIST.map((planta, i) => ({
      label: planta,
      data: dates.map(d => {
        const snap = getSnapshotByDate(d);
        return snap[planta] ? snap[planta].eficiencia : null;
      }),
      borderColor: paletas[i % paletas.length],
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      tension: 0.35,
      spanGaps: true,
    }));
  } else {
    datasets = [{
      label: filterPlanta,
      data: dates.map(d => {
        const snap = getSnapshotByDate(d);
        return snap[filterPlanta] ? snap[filterPlanta].eficiencia : null;
      }),
      borderColor: paletas[0],
      backgroundColor: 'rgba(26,128,255,0.06)',
      fill: true,
      borderWidth: 2.5,
      pointRadius: 4,
      tension: 0.35,
      spanGaps: true,
    }];
  }

  const ctx = document.getElementById('trendChart').getContext('2d');
  if (trendChart) trendChart.destroy();

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates.map(d => {
        const [,m,day] = d.split('-');
        return `${day}/${m}`;
      }),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          display: filterPlanta === 'all',
          labels: { color: '#6b7b94', font: { size: 11 }, boxWidth: 12, padding: 14 },
        },
        tooltip: {
          backgroundColor: '#0c1a2e',
          titleColor: '#fff',
          bodyColor: '#9aafc7',
          borderColor: 'rgba(26,128,255,0.3)',
          borderWidth: 1,
          padding: 10,
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y ?? '—'}%` },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#6b7b94', font: { size: 10 } } },
        y: {
          min: 55, max: 105,
          grid: { color: 'rgba(0,0,0,0.06)' },
          ticks: { color: '#6b7b94', font: { size: 10 }, callback: v => v + '%' },
        },
      },
    },
  });
}

/* ──────────────────────────────────────────────
   RENDER — RANKING
   ────────────────────────────────────────────── */
function renderRanking() {
  const reportDate = getReportDate();
  const snapshot   = getSnapshotByDate(reportDate);
  const list       = document.getElementById('rankingList');

  const items = PLANTAS_LIST
    .map(planta => snapshot[planta])
    .filter(Boolean)
    .sort((a, b) => b.eficiencia - a.eficiencia);

  if (items.length === 0) {
    list.innerHTML = '<p class="empty-state">Sin datos.</p>';
    return;
  }

  const medalClasses = ['gold', 'silver', 'bronze'];

  list.innerHTML = items.map((rec, i) => {
    const aboveMeta = rec.eficiencia >= rec.meta;
    const pct       = Math.min(100, (rec.eficiencia / 100) * 100);
    return `
      <div class="ranking-item">
        <div class="rank-number ${medalClasses[i] || ''}">${i + 1}</div>
        <div class="rank-bar-wrap">
          <div class="rank-bar-label">
            <span>${rec.planta}</span>
            <span style="color:${aboveMeta ? '#006944' : '#b02030'}">
              ${aboveMeta ? '▲' : '▼'} ${(rec.eficiencia - rec.meta).toFixed(1)}%
            </span>
          </div>
          <div class="rank-bar-track">
            <div class="rank-bar-fill ${aboveMeta ? '' : 'below-meta'}" style="width:${pct}%"></div>
          </div>
        </div>
        <span class="rank-pct">${rec.eficiencia}%</span>
      </div>
    `;
  }).join('');
}

/* ──────────────────────────────────────────────
   RENDER — TABLA PLANTAS
   ────────────────────────────────────────────── */
function renderTable() {
  const tbody = document.getElementById('plantasTableBody');

  let records = [...allRecords].sort((a, b) => b.fecha.localeCompare(a.fecha));

  if (currentFilter.planta) records = records.filter(r => r.planta === currentFilter.planta);
  if (currentFilter.fecha)  records = records.filter(r => r.fecha  === currentFilter.fecha);

  if (records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#9aafc7;padding:20px">Sin registros</td></tr>`;
    return;
  }

  tbody.innerHTML = records.map(rec => {
    const delta  = (rec.eficiencia - rec.meta).toFixed(1);
    const above  = parseFloat(delta) >= 0;
    return `
      <tr>
        <td>${formatDate(rec.fecha)}</td>
        <td><strong>${rec.planta}</strong></td>
        <td>${rec.eficiencia}%</td>
        <td>${rec.meta}%</td>
        <td>
          <span class="status-pill ${above ? 'above' : 'below'}">
            ${above ? '▲' : '▼'} ${Math.abs(delta)}%
          </span>
        </td>
        <td>
          <button class="action-btn edit" onclick="openEditModal('${rec.id}')">Editar</button>
          <button class="action-btn del"  onclick="deleteRecord('${rec.id}')">Eliminar</button>
        </td>
      </tr>
    `;
  }).join('');
}

/* ──────────────────────────────────────────────
   FILTROS DE TABLA
   ────────────────────────────────────────────── */
function populateFilters() {
  // Selector de planta en filtros
  const fp = document.getElementById('filterPlanta');
  fp.innerHTML = '<option value="">Todas</option>';
  PLANTAS_LIST.forEach(p => {
    const o = document.createElement('option');
    o.value = p; o.textContent = p;
    fp.appendChild(o);
  });

  // Selector de planta en tendencias
  const tp = document.getElementById('trendPlantaSelect');
  tp.innerHTML = '<option value="all">Todas</option>';
  PLANTAS_LIST.forEach(p => {
    const o = document.createElement('option');
    o.value = p; o.textContent = p;
    tp.appendChild(o);
  });
}

/* ──────────────────────────────────────────────
   MODAL — Agregar / Editar Registro
   ────────────────────────────────────────────── */
function openAddModal() {
  document.getElementById('modalTitle').textContent  = 'Nuevo Registro';
  document.getElementById('editId').value            = '';
  document.getElementById('fieldFecha').value        = offsetDate(-1);
  document.getElementById('fieldPlanta').value       = '';
  document.getElementById('fieldEficiencia').value   = '';
  document.getElementById('fieldMeta').value         = META_DEFAULT;
  document.getElementById('modal').classList.remove('hidden');
}

function openEditModal(id) {
  const rec = allRecords.find(r => r.id === id);
  if (!rec) return;
  document.getElementById('modalTitle').textContent  = 'Editar Registro';
  document.getElementById('editId').value            = rec.id;
  document.getElementById('fieldFecha').value        = rec.fecha;
  document.getElementById('fieldPlanta').value       = rec.planta;
  document.getElementById('fieldEficiencia').value   = rec.eficiencia;
  document.getElementById('fieldMeta').value         = rec.meta;
  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

function handleFormSubmit(e) {
  e.preventDefault();
  const id   = document.getElementById('editId').value;
  const fecha = document.getElementById('fieldFecha').value;
  const planta = document.getElementById('fieldPlanta').value;
  const eficiencia = parseFloat(document.getElementById('fieldEficiencia').value);
  const meta = parseFloat(document.getElementById('fieldMeta').value);

  if (!fecha || !planta || isNaN(eficiencia) || isNaN(meta)) {
    showToast('Completa todos los campos', 'error');
    return;
  }

  if (id) {
    // Editar
    const idx = allRecords.findIndex(r => r.id === id);
    if (idx > -1) allRecords[idx] = { id, fecha, planta, eficiencia, meta };
    showToast('Registro actualizado ✓', 'success');
  } else {
    // Nuevo
    allRecords.push({ id: uid(), fecha, planta, eficiencia, meta });
    showToast('Registro guardado ✓', 'success');
  }

  saveRecords();
  closeModal();
  renderAll();
}

function deleteRecord(id) {
  if (!confirm('¿Eliminar este registro?')) return;
  allRecords = allRecords.filter(r => r.id !== id);
  saveRecords();
  renderAll();
  showToast('Registro eliminado', '');
}

/* ──────────────────────────────────────────────
   RENDER ALL
   ────────────────────────────────────────────── */
function renderAll() {
  renderKPIs();
  renderAlerts();
  renderMainChart();
  renderRanking();
  renderTable();
  const tp = document.getElementById('trendPlantaSelect').value;
  renderTrendChart(tp || 'all');
}

/* ──────────────────────────────────────────────
   SPEECH SYNTHESIS — Lectura por voz
   ────────────────────────────────────────────── */
function buildExecutiveSummary() {
  const reportDate = getReportDate();
  const snapshot   = getSnapshotByDate(reportDate);
  const fechaText  = formatDate(reportDate);

  if (Object.keys(snapshot).length === 0) {
    return `No hay datos disponibles para el ${fechaText}.`;
  }

  const items = PLANTAS_LIST.map(planta => snapshot[planta]).filter(Boolean);
  const sorted = [...items].sort((a, b) => b.eficiencia - a.eficiencia);
  const mejor  = sorted[0];
  const peor   = sorted[sorted.length - 1];

  let texto = `Reporte de eficiencia al ${fechaText}. `;

  items.forEach(rec => {
    const delta    = (rec.eficiencia - rec.meta).toFixed(1);
    const estado   = parseFloat(delta) >= 0
      ? `${delta} puntos sobre meta`
      : `${Math.abs(delta)} puntos bajo meta`;
    texto += `${rec.planta}: eficiencia de ${rec.eficiencia} por ciento, ${estado}. `;
  });

  texto += `La planta con mejor desempeño es ${mejor.planta} con ${mejor.eficiencia} por ciento. `;
  texto += `La planta que requiere atención es ${peor.planta} con ${peor.eficiencia} por ciento. `;

  const bajoMeta = items.filter(r => r.eficiencia < r.meta);
  if (bajoMeta.length > 0) {
    texto += `Alertas activas: ${bajoMeta.map(r => r.planta).join(', ')} están por debajo de su meta. `;
  } else {
    texto += 'Todas las plantas están cumpliendo su meta. ';
  }

  texto += 'Fin del reporte señor.';
  return texto;
}

function speakText(text) {
  if (!('speechSynthesis' in window)) {
    showToast('Síntesis de voz no disponible en este navegador', 'error');
    return;
  }
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang  = 'es-MX';
  utterance.rate  = 0.95;
  utterance.pitch = 1;
  utterance.volume = 1;

  // Intentar voz en español
  const voices = window.speechSynthesis.getVoices();
  const esVoice = voices.find(v => v.lang.startsWith('es')) || null;
  if (esVoice) utterance.voice = esVoice;

  utterance.onstart = () => {
    isSpeaking = true;
    document.getElementById('btnVoiceReport').style.color = 'var(--electric)';
  };
  utterance.onend = () => {
    isSpeaking = false;
    document.getElementById('btnVoiceReport').style.color = '';
  };
  utterance.onerror = () => {
    isSpeaking = false;
    document.getElementById('btnVoiceReport').style.color = '';
  };

  window.speechSynthesis.speak(utterance);
}

/* ──────────────────────────────────────────────
   SPEECH RECOGNITION — Comandos de voz
   ────────────────────────────────────────────── */
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    document.getElementById('btnMic').style.display = 'none';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang        = 'es-MX';
  recognition.continuous  = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;
    document.getElementById('btnMic').classList.add('listening');
    showVoiceBanner('Escuchando… Di "Qronos, resumen de eficiencias"');
  };

  recognition.onend = () => {
    isListening = false;
    document.getElementById('btnMic').classList.remove('listening');
    hideVoiceBanner();
  };

  recognition.onerror = (e) => {
    isListening = false;
    document.getElementById('btnMic').classList.remove('listening');
    hideVoiceBanner();
    if (e.error !== 'aborted') showToast('Error de micrófono: ' + e.error, 'error');
  };

  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript.toLowerCase().trim();
    showVoiceBanner(`Reconocido: "${transcript}"`);
    setTimeout(hideVoiceBanner, 2000);
    processVoiceCommand(transcript);
  };
}

function toggleMic() {
  if (!recognition) { showToast('Reconocimiento de voz no disponible', 'error'); return; }
  if (isListening) {
    recognition.stop();
  } else {
    try { recognition.start(); } catch(e) { console.warn(e); }
  }
}

function processVoiceCommand(transcript) {
  // Comandos soportados
  const commands = [
    {
      match: ['resumen', 'eficiencia', 'reporte', 'informe'],
      action: () => {
        const text = buildExecutiveSummary();
        speakText(text);
        showToast('Leyendo reporte ejecutivo…', '');
      }
    },
    {
      match: ['peor planta', 'planta peor'],
      action: () => {
        const snap  = getSnapshotByDate(getReportDate());
        const items = Object.values(snap).sort((a, b) => a.eficiencia - b.eficiencia);
        if (items.length) speakText(`La planta con menor eficiencia es ${items[0].planta} con ${items[0].eficiencia} por ciento.`);
      }
    },
    {
      match: ['mejor planta', 'planta mejor'],
      action: () => {
        const snap  = getSnapshotByDate(getReportDate());
        const items = Object.values(snap).sort((a, b) => b.eficiencia - a.eficiencia);
        if (items.length) speakText(`La planta con mayor eficiencia es ${items[0].planta} con ${items[0].eficiencia} por ciento.`);
      }
    },
    {
      match: ['detener', 'para', 'stop', 'silencio'],
      action: () => { window.speechSynthesis.cancel(); showToast('Lectura detenida', ''); }
    }
  ];

  // El comando de QRONOS activa cualquier función
  const invokedQronos = transcript.includes('qronos') || transcript.includes('cronos');

  for (const cmd of commands) {
    if (cmd.match.some(w => transcript.includes(w))) {
      cmd.action();
      return;
    }
  }

  // Si mencionó QRONOS pero sin comando claro → reporte completo
  if (invokedQronos) {
    speakText(buildExecutiveSummary());
    return;
  }

  // Si nada coincide → mandar al chat de IA
  if (transcript.length > 3) {
    switchTab('chat');
    sendChatMessage(transcript);
  }
}

function showVoiceBanner(text) {
  const banner = document.getElementById('voiceBanner');
  document.getElementById('voiceBannerText').textContent = text;
  banner.classList.remove('hidden');
}
function hideVoiceBanner() {
  document.getElementById('voiceBanner').classList.add('hidden');
}

/* ──────────────────────────────────────────────
   CHAT IA — Gemini via Backend
   ────────────────────────────────────────────── */
function buildDataContext() {
  const reportDate = getReportDate();
  const snapshot   = getSnapshotByDate(reportDate);
  const last7Dates = getLastNDates(7);

  // Historial de los últimos 7 días por planta
  const history = {};
  PLANTAS_LIST.forEach(planta => {
    history[planta] = last7Dates.map(d => {
      const snap = getSnapshotByDate(d);
      const rec  = snap[planta];
      return rec ? { fecha: d, eficiencia: rec.eficiencia, meta: rec.meta } : null;
    }).filter(Boolean);
  });

  return {
    fecha_reporte: reportDate,
    snapshot_dia: Object.values(snapshot),
    historial_7_dias: history,
  };
}

function appendMessage(role, content, isTyping = false) {
  const container = document.getElementById('chatMessages');
  const wrapper   = document.createElement('div');
  wrapper.className = `msg ${role === 'user' ? 'msg-user' : ''}`;
  wrapper.id = isTyping ? 'typingIndicator' : '';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'user' ? 'U' : 'Q';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  if (isTyping) {
    bubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  } else {
    // Renderiza saltos de línea como <br>
    bubble.innerHTML = content.replace(/\n/g, '<br>');
  }

  if (role === 'user') {
    wrapper.appendChild(bubble);
    wrapper.appendChild(avatar);
  } else {
    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
  }

  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
  return wrapper;
}

function removeTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

async function sendChatMessage(text) {
  if (!text.trim()) return;

  const input  = document.getElementById('chatInput');
  const btnSnd = document.getElementById('btnSend');
  const dot    = document.getElementById('aiStatusDot');

  input.value = '';
  input.style.height = 'auto';
  btnSnd.disabled = true;
  dot.className = 'ai-status-dot thinking';

  appendMessage('user', text);
  appendMessage('ai', '', true); // typing indicator

  const dataContext = buildDataContext();

  try {
    const response = await fetch(`${API_BASE}/analizar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pregunta: text,
        datos: dataContext,
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `Error HTTP ${response.status}`);
    }

    const result = await response.json();
    removeTypingIndicator();
    appendMessage('ai', result.respuesta || 'Sin respuesta del servidor.');
    dot.className = 'ai-status-dot online';

  } catch (err) {
    removeTypingIndicator();
    console.error('Error IA:', err);

    // Si el backend no está disponible, respuesta local de emergencia
    const fallback = buildLocalFallbackResponse(text, dataContext);
    appendMessage('ai', fallback + '\n\n_(Modo sin conexión — conecta el servidor para respuestas con IA real)_');
    dot.className = 'ai-status-dot';
    showToast('Backend no disponible. Respuesta local activada.', 'error');

  } finally {
    btnSnd.disabled = false;
  }
}

/** Respuesta local de emergencia cuando el backend no está disponible */
function buildLocalFallbackResponse(pregunta, data) {
  const snap  = data.snapshot_dia;
  if (!snap || snap.length === 0) return 'No hay datos disponibles para el reporte actual.';

  const sorted  = [...snap].sort((a, b) => b.eficiencia - a.eficiencia);
  const mejor   = sorted[0];
  const peor    = sorted[sorted.length - 1];
  const bajo    = snap.filter(r => r.eficiencia < r.meta);
  const sobre   = snap.filter(r => r.eficiencia >= r.meta);

  return [
    `📊 **Análisis del ${data.fecha_reporte}**`,
    '',
    `🏆 Mejor planta: ${mejor.planta} (${mejor.eficiencia}%)`,
    `⚠️ Planta crítica: ${peor.planta} (${peor.eficiencia}%)`,
    '',
    sobre.length > 0
      ? `✅ Sobre meta: ${sobre.map(r => `${r.planta} ${r.eficiencia}%`).join(', ')}`
      : '❌ Ninguna planta sobre meta',
    bajo.length > 0
      ? `🔴 Bajo meta: ${bajo.map(r => `${r.planta} ${r.eficiencia}%`).join(', ')}`
      : '✅ Todas las plantas cumplen su meta',
  ].join('\n');
}

/* ──────────────────────────────────────────────
   NAVEGACIÓN DE TABS
   ────────────────────────────────────────────── */
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(s => {
    s.classList.toggle('active', s.id === `tab-${tabId}`);
  });

  // Redibujar charts al activar tabs (por si estaban ocultos)
  if (tabId === 'tendencias') {
    const tp = document.getElementById('trendPlantaSelect').value;
    renderTrendChart(tp || 'all');
    renderRanking();
  }
}

/* ──────────────────────────────────────────────
   EVENT LISTENERS
   ────────────────────────────────────────────── */
function bindEvents() {
  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Voz — reporte
  document.getElementById('btnVoiceReport').addEventListener('click', () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      isSpeaking = false;
    } else {
      speakText(buildExecutiveSummary());
    }
  });

  // Voz — micrófono
  document.getElementById('btnMic').addEventListener('click', toggleMic);

  // Modal
  document.getElementById('btnAddRecord').addEventListener('click', openAddModal);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', e => {
    if (e.target === document.getElementById('modal')) closeModal();
  });
  document.getElementById('recordForm').addEventListener('submit', handleFormSubmit);

  // Filtros de tabla
  document.getElementById('filterPlanta').addEventListener('change', e => {
    currentFilter.planta = e.target.value;
    renderTable();
  });
  document.getElementById('filterFecha').addEventListener('change', e => {
    currentFilter.fecha = e.target.value;
    renderTable();
  });
  document.getElementById('btnClearFilters').addEventListener('click', () => {
    currentFilter = { planta: '', fecha: '' };
    document.getElementById('filterPlanta').value = '';
    document.getElementById('filterFecha').value  = '';
    renderTable();
  });

  // Tendencias — selector de planta
  document.getElementById('trendPlantaSelect').addEventListener('change', e => {
    renderTrendChart(e.target.value);
  });

  // Chat — botón enviar
  document.getElementById('btnSend').addEventListener('click', () => {
    sendChatMessage(document.getElementById('chatInput').value.trim());
  });

  // Chat — Enter para enviar (Shift+Enter para nueva línea)
  document.getElementById('chatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage(document.getElementById('chatInput').value.trim());
    }
  });

  // Auto-resize del textarea
  document.getElementById('chatInput').addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });

  // Quick prompts
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sendChatMessage(btn.dataset.prompt);
    });
  });

  // Cargar voces al estar disponibles (algunos navegadores las cargan async)
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {};
  }
}

/* ──────────────────────────────────────────────
   SPLASH → APP
   ────────────────────────────────────────────── */
function hideSplash() {
  const splash = document.getElementById('splash');
  const app    = document.getElementById('app');
  splash.classList.add('fade-out');
  app.classList.remove('hidden');
  setTimeout(() => { splash.style.display = 'none'; }, 500);
}

/* ──────────────────────────────────────────────
   INIT
   ────────────────────────────────────────────── */
function init() {
  loadRecords();
  populateFilters();
  bindEvents();
  initSpeechRecognition();
  renderAll();

  // Marcar IA como online (verificar backend)
  fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) })
    .then(r => r.ok && (document.getElementById('aiStatusDot').className = 'ai-status-dot online'))
    .catch(() => {}); // Silencioso si no hay backend

  // Ocultar splash después de animación
  setTimeout(hideSplash, 2200);
}

// ── Exposición global de funciones usadas en onclick inline del HTML ──
window.openEditModal = openEditModal;
window.deleteRecord  = deleteRecord;

// ── Arranque ──
document.addEventListener('DOMContentLoaded', init);

/* ──────────────────────────────────────────────
   SERVICE WORKER REGISTRATION
   ────────────────────────────────────────────── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(reg => console.log('SW registrado:', reg.scope))
      .catch(err => console.warn('SW error:', err));
  });
}
