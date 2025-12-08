
const API_BASE = "https://drm.pythonanywhere.com/"; 
const ENDPOINT_FILTER = `${API_BASE}/utilization/filter`;
const ENDPOINT_SYSTEMS = `${API_BASE}/systems`;
const ENDPOINT_DEPTS = `${API_BASE}/departments`;

// DOM
const systemSelect = document.getElementById("systemSelect");
const departmentSelect = document.getElementById("departmentSelect");
const dateFromInput = document.getElementById("dateFrom");
const dateToInput = document.getElementById("dateTo");
const applyBtn = document.getElementById("applyFilter");

const loadingEl = document.getElementById("loadingSpinner");
const cardTotal = document.getElementById("card-total");
const cardAvg = document.getElementById("card-avg");
const cardMax = document.getElementById("card-max");
const cardMin = document.getElementById("card-min");
const cardSystems = document.getElementById("card-systems");
const cardDepts = document.getElementById("card-depts");

const tableBody = document.querySelector("#dataTable tbody");
const tableHeaders = document.querySelectorAll("#dataTable thead th[data-col]");

const themeToggle = document.getElementById("themeToggle");
const bodyEl = document.body;

let chart = null;
let currentData = [];
let currentSort = { col: "usage_date", dir: "desc" };
let tableSortState = {};

// Loading
function showLoading() { loadingEl.classList.add("show"); }
function hideLoading() { loadingEl.classList.remove("show"); }

// Fetch helper
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

// Theme init
function initTheme() {
  const t = localStorage.getItem("watchout_theme") || "dark";
  if (t === "light") bodyEl.classList.add("light");
  themeToggle.textContent = bodyEl.classList.contains("light") ? "☀️" : "🌙";
}
themeToggle.addEventListener("click", () => {
  bodyEl.classList.toggle("light");
  const now = bodyEl.classList.contains("light") ? "light" : "dark";
  localStorage.setItem("watchout_theme", now);
  themeToggle.textContent = now === "light" ? "☀️" : "🌙";
});

// Filters
async function loadFilters() {
  try {
    const [systems, depts] = await Promise.all([
      fetchJSON(ENDPOINT_SYSTEMS),
      fetchJSON(ENDPOINT_DEPTS)
    ]);

    systemSelect.innerHTML =
      `<option value="">All Systems</option>` +
      systems.map(s => `<option value="${escapeHtml(s.system_name)}">${escapeHtml(s.system_name)}</option>`).join("");

    departmentSelect.innerHTML =
      `<option value="">All Departments</option>` +
      depts.map(d => `<option value="${escapeHtml(d.department_name)}">${escapeHtml(d.department_name)}</option>`).join("");

  } catch {
    systemSelect.innerHTML = `<option value="">All Systems</option>`;
    departmentSelect.innerHTML = `<option value="">All Departments</option>`;
  }
}

function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[c]);
}

async function fetchUtilization(system = "", department = "") {
  const params = new URLSearchParams();
  if (system) params.append("system", system);
  if (department) params.append("department", department);
  return await fetchJSON(`${ENDPOINT_FILTER}?${params.toString()}`);
}

function parseDateStr(dateStr, timeStr = "") {
  if (!dateStr) return null;
  let s = dateStr;
  if (timeStr) s += "T" + timeStr;
  return new Date(s);
}

// Cards
function computeCards(data) {
  const total = data.length;
  const systemsSet = new Set();
  const deptsSet = new Set();
  let sum = 0;
  let max = null;
  let min = null;

  for (const r of data) {
    systemsSet.add(r.system_name);
    deptsSet.add(r.department_name);
    const v = Number(r.utilization_pct);
    if (!isNaN(v)) {
      sum += v;
      if (max === null || v > max) max = v;
      if (min === null || v < min) min = v;
    }
  }

  return {
    total,
    avg: total > 0 ? round(sum / total, 2) : 0,
    max: max === null ? 0 : round(max,2),
    min: min === null ? 0 : round(min,2),
    systems: systemsSet.size,
    depts: deptsSet.size
  };
}
const round = (n,d=2)=>Math.round(n*10**d)/10**d;

function updateCards(summary) {
  cardTotal.querySelector("p").textContent = summary.total;
  cardAvg.querySelector("p").textContent = summary.avg + "%";
  cardMax.querySelector("p").textContent = summary.max + "%";
  cardMin.querySelector("p").textContent = summary.min + "%";
  cardSystems.querySelector("p").textContent = summary.systems;
  cardDepts.querySelector("p").textContent = summary.depts;
}

// *** FIXED CHART ORDER ***
function renderChart(data) {

  // 🟦 1) Sort chronological (ASC)
  data = [...data].sort((a,b) => {
    const da = parseDateStr(a.usage_date, a.usage_time);
    const db = parseDateStr(b.usage_date, b.usage_time);
    return da - db;
  });

  const ctx = document.getElementById("utilChart").getContext("2d");

  const labels = data.map(r => `${r.usage_date} ${r.usage_time}`);
  const values = data.map(r => Number(r.utilization_pct));

  const gradient = ctx.createLinearGradient(0,0,0,300);
  gradient.addColorStop(0, 'rgba(88,166,255,0.9)');
  gradient.addColorStop(0.6, 'rgba(88,166,255,0.25)');
  gradient.addColorStop(1, 'rgba(88,166,255,0.05)');

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Utilization (%)',
        data: values,
        fill: true,
        backgroundColor: gradient,
        borderColor: '#58a6ff',
        pointRadius: 3,
        tension: 0.2,
        pointHoverRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items[0].label,
            label: (ctx) => {
              const idx = ctx.dataIndex;
              const row = data[idx];
              return [
                `Usage: ${row.utilization_pct}%`,
                `System: ${row.system_name}`,
                `Department: ${row.department_name}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          reverse: false,     // 🟦 Prevents right-to-left axis
          ticks: { maxRotation: 45 }
        },
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          ticks: { callback: v => v + '%' }
        }
      }
    }
  });
}

// Table
function renderTable(data) {
  tableBody.innerHTML = data.map(r => `
    <tr>
      <td>${escapeHtml(r.usage_date)}</td>
      <td>${escapeHtml(r.usage_time)}</td>
      <td>${escapeHtml(r.system_name)}</td>
      <td>${escapeHtml(r.department_name)}</td>
      <td>${escapeHtml(r.utilization_pct)}</td>
    </tr>
  `).join('');
}

function sortData(data, col, dir) {
  return [...data].sort((a,b) => {
    let A = a[col], B = b[col];

    if (col === "utilization_pct") {
      A = Number(A); B = Number(B);
      return dir === "asc" ? A-B : B-A;
    }

    if (col === "usage_date" || col === "usage_time") {
      const da = parseDateStr(a.usage_date, a.usage_time);
      const db = parseDateStr(b.usage_date, b.usage_time);
      return dir === "asc" ? da-db : db-da;
    }

    A = (A || "").toString().toLowerCase();
    B = (B || "").toString().toLowerCase();

    if (A < B) return dir === "asc" ? -1 : 1;
    if (A > B) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

function updateHeaderArrows() {
  tableHeaders.forEach(th => {
    const col = th.dataset.col;
    const state = tableSortState[col];
    th.querySelectorAll(".arrow").forEach(n => n.remove());
    if (!state) return;
    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.style.marginLeft = "8px";
    arrow.textContent = state === "asc" ? "↑" : "↓";
    th.appendChild(arrow);
  });
}

// Apply filters
async function applyFiltersAndRender() {
  showLoading();
  try {
    const system = systemSelect.value;
    const dept = departmentSelect.value;

    // server filtering
    const raw = await fetchUtilization(system, dept);

    const normalized = raw.map(r => ({
      usage_date: r.usage_date,
      usage_time: r.usage_time,
      utilization_pct: r.utilization_pct,
      system_name: r.system_name,
      department_name: r.department_name
    }));

    // client-side date range
    const from = dateFromInput.value ? new Date(dateFromInput.value + "T00:00:00") : null;
    const to = dateToInput.value ? new Date(dateToInput.value + "T23:59:59") : null;

    let filtered = normalized.filter(r => {
      if (!r.usage_date) return false;
      const dt = parseDateStr(r.usage_date, r.usage_time);
      if (from && dt < from) return false;
      if (to && dt > to) return false;
      return true;
    });

    currentData = filtered;

    const sorted = sortData(currentData, currentSort.col, currentSort.dir);
    updateHeaderArrows();

    updateCards(computeCards(currentData));
    renderChart(sorted);
    renderTable(sorted);

  } catch (err) {
    console.error(err);
    tableBody.innerHTML = `<tr><td colspan="5">Failed to load data</td></tr>`;
  } finally {
    hideLoading();
  }
}

// Auto-date
function setDateInputsRangeFromData(data) {
  const valid = data
    .map(r => parseDateStr(r.usage_date, r.usage_time))
    .filter(d => d && !isNaN(d));
  if (valid.length === 0) return;

  const min = new Date(Math.min(...valid));
  const max = new Date(Math.max(...valid));

  const pad = (n)=>String(n).padStart(2,"0");
  const iso = (d)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  if (!dateFromInput.value) dateFromInput.value = iso(min);
  if (!dateToInput.value) dateToInput.value = iso(max);

  dateFromInput.min = iso(min);
  dateFromInput.max = iso(max);
  dateToInput.min = iso(min);
  dateToInput.max = iso(max);
}

// Table sorting events
tableHeaders.forEach(th => {
  const col = th.dataset.col;
  tableSortState[col] = null;

  th.addEventListener("click", () => {
    const prev = tableSortState[col];
    const next = prev === "asc" ? "desc" : "asc";
    Object.keys(tableSortState).forEach(k => tableSortState[k] = null);
    tableSortState[col] = next;
    currentSort = { col, dir: next };

    const sorted = sortData(currentData, col, next);
    updateHeaderArrows();
    renderTable(sorted);
    renderChart(sorted);
  });
});

// Apply filters button
applyBtn.addEventListener("click", async e => {
  e.preventDefault();
  await applyFiltersAndRender();
});

// INIT
(async function init() {
  initTheme();
  showLoading();
  try {
    await loadFilters();
    await applyFiltersAndRender();
    setDateInputsRangeFromData(currentData);
  } catch (err) {
    console.error("Init failed", err);
  } finally {
    hideLoading();
  }
})();

window.resetFilters = async function() {
  systemSelect.value = "";
  departmentSelect.value = "";
  dateFromInput.value = "";
  dateToInput.value = "";
  await applyFiltersAndRender();
};


