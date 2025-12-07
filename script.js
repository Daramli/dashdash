// script.js - Modern Dashboard logic
// Features:
// - Fetch systems/departments + utilization (via API)
// - Cards (total, avg, max, min, systems count, depts count)
// - Date range filter (from first to last date present)
// - Chart.js line with gradient + advanced tooltip
// - Table with client-side sorting (click headers) and arrows
// - Loading spinner
// - Light/Dark toggle (stores choice in localStorage)
// - Smooth animations and defensive error handling

const API_BASE = "https://drm.pythonanywhere.com/"; // <-- عدّل لو لزم
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
let currentData = []; // fetched & filtered rows
let currentSort = { col: "usage_date", dir: "desc" }; // default sorting
let tableSortState = {}; // column -> asc/desc

// Helper: show/hide loading
function showLoading() {
  loadingEl.classList.add("show");
}
function hideLoading() {
  loadingEl.classList.remove("show");
}

// Helper: fetch JSON with error handling
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

// Initialize theme from localStorage
function initTheme() {
  const t = localStorage.getItem("watchout_theme") || "dark";
  if (t === "light") bodyEl.classList.add("light");
  else bodyEl.classList.remove("light");
  // toggle icon
  themeToggle.textContent = bodyEl.classList.contains("light") ? "☀️" : "🌙";
}
themeToggle.addEventListener("click", () => {
  bodyEl.classList.toggle("light");
  const now = bodyEl.classList.contains("light") ? "light" : "dark";
  localStorage.setItem("watchout_theme", now);
  themeToggle.textContent = now === "light" ? "☀️" : "🌙";
});

// Populate filters (systems & departments)
async function loadFilters() {
  try {
    const [systems, depts] = await Promise.all([
      fetchJSON(ENDPOINT_SYSTEMS),
      fetchJSON(ENDPOINT_DEPTS)
    ]);
    // systems: array of { system_name }
    systemSelect.innerHTML = `<option value="">All Systems</option>` +
      systems.map(s => `<option value="${escapeHtml(s.system_name)}">${escapeHtml(s.system_name)}</option>`).join("");
    departmentSelect.innerHTML = `<option value="">All Departments</option>` +
      depts.map(d => `<option value="${escapeHtml(d.department_name)}">${escapeHtml(d.department_name)}</option>`).join("");
  } catch (e) {
    console.error("Failed to load filters:", e);
    systemSelect.innerHTML = `<option value="">All Systems</option>`;
    departmentSelect.innerHTML = `<option value="">All Departments</option>`;
  }
}

// Basic escaping for insertion into HTML
function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
}

// Fetch utilization from API (with system/department applied server-side)
async function fetchUtilization(system = "", department = "") {
  // build endpoint
  const params = new URLSearchParams();
  if (system) params.append("system", system);
  if (department) params.append("department", department);
  // include default ordering descending by date/time (server handles)
  const url = `${ENDPOINT_FILTER}?${params.toString()}`;
  return await fetchJSON(url);
}

// Utility: convert "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SS" etc. to Date
function parseDateStr(dateStr, timeStr = "") {
  // If usage_date is already "YYYY-MM-DD", and usage_time "HH:MM:SS"
  if (!dateStr) return null;
  let s = dateStr;
  if (timeStr) s += "T" + timeStr;
  // ensure compatibility across browsers
  return new Date(s);
}

// Compute cards and summary values from dataset
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

  const avg = total > 0 ? (sum / total) : 0;
  return {
    total, avg: round(avg, 2), max: max === null ? 0 : round(max,2), min: min === null ? 0 : round(min,2),
    systems: systemsSet.size, depts: deptsSet.size
  };
}
function round(n, d=2){ return Math.round(n * Math.pow(10,d))/Math.pow(10,d); }

// Populate cards DOM
function updateCards(summary) {
  cardTotal.querySelector("p").textContent = summary.total;
  cardAvg.querySelector("p").textContent = summary.avg + "%";
  cardMax.querySelector("p").textContent = summary.max + "%";
  cardMin.querySelector("p").textContent = summary.min + "%";
  cardSystems.querySelector("p").textContent = summary.systems;
  cardDepts.querySelector("p").textContent = summary.depts;
}

// Build Chart.js line chart
function renderChart(data) {
  const ctx = document.getElementById("utilChart").getContext("2d");

  // labels: date+time strings; values: utilization
  const labels = data.map(r => `${r.usage_date} ${r.usage_time}`);
  const values = data.map(r => Number(r.utilization_pct));

  // gradient
  const gradient = ctx.createLinearGradient(0,0,0,300);
  gradient.addColorStop(0, 'rgba(88,166,255,0.9)');
  gradient.addColorStop(0.6, 'rgba(88,166,255,0.25)');
  gradient.addColorStop(1, 'rgba(88,166,255,0.05)');

  if (chart) {
    chart.destroy();
    chart = null;
  }

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
          enabled: true,
          callbacks: {
            title: (items) => {
              // show the full date/time
              const i = items[0];
              return i.label;
            },
            label: (context) => {
              const idx = context.dataIndex;
              const row = data[idx];
              const usage = row.utilization_pct;
              const sys = row.system_name || "—";
              const dept = row.department_name || "—";
              return [`Usage: ${usage}%`, `System: ${sys}`, `Department: ${dept}`];
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          ticks: { callback: (v) => v + '%' }
        },
        x: {
          ticks: { maxRotation: 45, minRotation: 0 },
        }
      },
      animation: { duration: 600, easing: 'easeOutCubic' }
    }
  });
}

// Render table rows
function renderTable(data) {
  // data expected sorted according to currentSort
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

// Table sorting logic (client-side)
function sortData(data, col, dir) {
  const sorted = [...data].sort((a,b) => {
    let A = a[col], B = b[col];
    // numeric cols
    if (col === "utilization_pct") {
      A = Number(A); B = Number(B);
      if (isNaN(A)) A = -Infinity;
      if (isNaN(B)) B = -Infinity;
    } else if (col === "usage_date" || col === "usage_time") {
      // combine date+time for proper chronological ordering
      const aDate = parseDateStr(a.usage_date, a.usage_time) || new Date(0);
      const bDate = parseDateStr(b.usage_date, b.usage_time) || new Date(0);
      return dir === "asc" ? aDate - bDate : bDate - aDate;
    } else {
      A = (A || "").toString().toLowerCase();
      B = (B || "").toString().toLowerCase();
    }

    if (A < B) return dir === "asc" ? -1 : 1;
    if (A > B) return dir === "asc" ? 1 : -1;
    return 0;
  });
  return sorted;
}

// Update header sort arrows visuals
function updateHeaderArrows() {
  tableHeaders.forEach(th => {
    const col = th.getAttribute("data-col");
    const state = tableSortState[col];
    if (!state) {
      th.querySelectorAll(".arrow").forEach(n => n.remove());
      return;
    }
    // remove existing
    th.querySelectorAll(".arrow").forEach(n => n.remove());
    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.style.marginLeft = "8px";
    arrow.style.fontSize = "12px";
    arrow.textContent = state === "asc" ? "↑" : "↓";
    th.appendChild(arrow);
  });
}

// Apply filters: fetch + client-side date-range filter + render everything
async function applyFiltersAndRender() {
  showLoading();
  try {
    const system = systemSelect.value;
    const dept = departmentSelect.value;

    // Fetch from API (server does system+dept filtering if provided)
    const raw = await fetchUtilization(system, dept);
    if (!Array.isArray(raw)) throw new Error("API returned unexpected result");

    // Convert/normalize fields if necessary
    // (Ensure usage_date, usage_time, utilization_pct exist)
    const normalized = raw.map(r => ({
      usage_date: r.usage_date || "",
      usage_time: r.usage_time || "",
      utilization_pct: r.utilization_pct !== undefined ? r.utilization_pct : (r.utilization || 0),
      system_name: r.system_name || r.system || "",
      department_name: r.department_name || r.department || ""
    }));

    // Apply client-side date range filtering if inputs set
    const from = dateFromInput.value ? new Date(dateFromInput.value + "T00:00:00") : null;
    const to = dateToInput.value ? new Date(dateToInput.value + "T23:59:59") : null;

    let filtered = normalized.filter(r => {
      if (!r.usage_date) return false;
      if (!from && !to) return true;
      const dt = parseDateStr(r.usage_date, r.usage_time) || new Date(0);
      if (from && dt < from) return false;
      if (to && dt > to) return false;
      return true;
    });

    // Save to currentData
    currentData = filtered;

    // If user used a sorting on table, apply it
    let sortCol = currentSort.col || "usage_date";
    let sortDir = currentSort.dir || "desc";

    const sorted = sortData(currentData, sortCol, sortDir);
    updateHeaderArrows();

    // Update cards
    const summary = computeCards(currentData);
    updateCards(summary);

    // Chart
    renderChart(sorted);

    // Table
    renderTable(sorted);

  } catch (err) {
    console.error("Failed to fetch/render data:", err);
    // show simple message in cards
    cardTotal.querySelector("p").textContent = "—";
    cardAvg.querySelector("p").textContent = "—";
    cardMax.querySelector("p").textContent = "—";
    cardMin.querySelector("p").textContent = "—";
    tableBody.innerHTML = `<tr><td colspan="5" style="padding:20px">Failed to load data. See console.</td></tr>`;
  } finally {
    hideLoading();
  }
}

// Get min/max dates from dataset to set date inputs default range
function setDateInputsRangeFromData(data) {
  const validDates = data.map(r => parseDateStr(r.usage_date, r.usage_time)).filter(d => d instanceof Date && !isNaN(d));
  if (validDates.length === 0) return;
  const min = new Date(Math.min(...validDates));
  const max = new Date(Math.max(...validDates));
  const pad = (n) => n.toString().padStart(2, "0");
  const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  // only set if inputs empty (first load)
  if (!dateFromInput.value) dateFromInput.value = toISODate(min);
  if (!dateToInput.value) dateToInput.value = toISODate(max);
  // set min/max allowed
  dateFromInput.min = toISODate(min);
  dateFromInput.max = toISODate(max);
  dateToInput.min = toISODate(min);
  dateToInput.max = toISODate(max);
}

// Header click events for sorting
tableHeaders.forEach(th => {
  const col = th.getAttribute("data-col");
  tableSortState[col] = null; // initial
  th.addEventListener("click", () => {
    const prev = tableSortState[col];
    const next = prev === "asc" ? "desc" : "asc";
    // reset other columns
    Object.keys(tableSortState).forEach(k => tableSortState[k] = null);
    tableSortState[col] = next;
    currentSort = { col, dir: next };
    // sort currentData and render
    const sorted = sortData(currentData, col, next);
    updateHeaderArrows();
    renderTable(sorted);
    // also re-render chart based on sorted order (optional)
    renderChart(sorted);
  });
});

// Apply button handler
applyBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  showLoading();
  // fetch + render (applyFiltersAndRender will hide loading)
  await applyFiltersAndRender();
});

// On filters change, do not auto-fetch to avoid accidental calls; user presses Apply

// INITIALIZE DASHBOARD
(async function init() {
  initTheme();
  showLoading();
  try {
    await loadFilters();
    // initial fetch and render for "All"
    await applyFiltersAndRender();

    // set date inputs range based on data (if any)
    setDateInputsRangeFromData(currentData);
  } catch (err) {
    console.error("Initialization failed:", err);
  } finally {
    hideLoading();
  }
})();

// small utility: if user wants quick "reset" function
window.resetFilters = async function() {
  systemSelect.value = "";
  departmentSelect.value = "";
  dateFromInput.value = "";
  dateToInput.value = "";
  await applyFiltersAndRender();
};
