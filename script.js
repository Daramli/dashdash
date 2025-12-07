// watchout/dashboard/script.js

const API_BASE = "https://web-production-a3251.up.railway.app";

const systemSelect = document.getElementById("systemSelect");
const deptSelect = document.getElementById("deptSelect");
const tableBody = document.querySelector("#dataTable tbody");
const tableHead = document.querySelector("#dataTable thead tr"); 

let chart = null;
let currentSortColumn = 'usage_date'; 
let currentSortOrder = 'DESC'; 

// ---------------------------------------------
// 1. Load Dropdowns
// ---------------------------------------------
async function loadFilters() {
    try {
        const systems = await (await fetch(`${API_BASE}/systems`)).json();
        const depts = await (await fetch(`${API_BASE}/departments`)).json();

        systems.forEach(s => {
            systemSelect.innerHTML += `<option value="${s.system_name}">${s.system_name}</option>`;
        });
        
        depts.forEach(d => {
            deptSelect.innerHTML += `<option value="${d.department_name}">${d.department_name}</option>`;
        });
    } catch (error) {
        console.error("Failed to load filters from API:", error);
    }
}

// ---------------------------------------------
// 2. Load Table + Chart
// ---------------------------------------------
async function loadData() {
    let endpoint = `${API_BASE}/utilization/filter?`;

    const sys = systemSelect.value;
    const dep = deptSelect.value;

    endpoint += `sort_by=${currentSortColumn}&sort_order=${currentSortOrder}&`;

    if (sys) endpoint += `system=${sys}&`;
    if (dep) endpoint += `department=${dep}`;

    const response = await fetch(endpoint);
    const data = await response.json();

    // Fill table
    tableBody.innerHTML = "";
    data.forEach(row => {
        tableBody.innerHTML += `
            <tr>
                <td>${row.system_name}</td>
                <td>${row.department_name}</td>
                <td>${row.utilization_pct}</td>
                <td>${row.usage_date}</td>
                <td>${row.usage_time}</td>
            </tr>`;
    });

    // Chart Data
    const labels = data.map(r => `${r.usage_date} ${r.usage_time}`);
    const values = data.map(r => r.utilization_pct);

    if (chart) chart.destroy();

    const ctx = document.getElementById("utilChart");
    chart = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "Utilization (%)",
                data: values,
                borderWidth: 2,
                fill: false,
                borderColor: '#9d11c7ff',
                tension: 0.1
            }]
        }
    });
}

// ---------------------------------------------
// 3. Sorting Logic
// ---------------------------------------------
function handleSortClick(column) {
    if (column === currentSortColumn) {
        currentSortOrder = currentSortOrder === 'ASC' ? 'DESC' : 'ASC';
    } else {
        currentSortColumn = column;
        currentSortOrder = 'DESC';
    }
    loadData();
}

tableHead.querySelectorAll('th').forEach((header, index) => {
    let columnName;
    switch (index) {
        case 0: columnName = 'system_name'; break;   
        case 1: columnName = 'department_name'; break; 
        case 2: columnName = 'utilization_pct'; break; 
        case 3: columnName = 'usage_date'; break;      
        case 4: columnName = 'usage_time'; break;      
        default: return;
    }
    
    header.style.cursor = 'pointer'; 
    header.addEventListener('click', () => handleSortClick(columnName));
});

// ---------------------------------------------
// 4. Init
// ---------------------------------------------
systemSelect.addEventListener("change", loadData);
deptSelect.addEventListener("change", loadData);

loadFilters().then(loadData);