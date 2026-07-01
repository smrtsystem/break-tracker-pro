// =============================================
// API URL - Auto-detect for production
// =============================================
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000' 
    : ''; // Empty means use same domain in production
// =============================================
// AUTHENTICATION & USER MANAGEMENT
// =============================================

let currentUser = null;

// Check if user is logged in
function checkAuth() {
    const userData = sessionStorage.getItem('user');
    if (!userData) {
        window.location.href = 'login.html';
        return false;
    }
    
    try {
        currentUser = JSON.parse(userData);
        return true;
    } catch (e) {
        window.location.href = 'login.html';
        return false;
    }
}

// Update UI based on user role
function updateUIForRole() {
    const isAdmin = currentUser && currentUser.role === 'admin';
    
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = isAdmin ? 'flex' : 'none';
    });
    
    document.getElementById('userName').textContent = currentUser ? currentUser.username : 'Unknown';
}

// Logout
function logout() {
    sessionStorage.removeItem('user');
    window.location.href = 'login.html';
}

// =============================================
// EMPLOYEE LIST
// =============================================

const EMPLOYEES = [
    'Pradeep Singh', 'Arunava Hazra', 'Sonu Shaw', 'Ashish Mushla',
    'Modallil Ahmed Baig', 'Vicky Patel', 'Souvik Nag', 'Chandan Gupta',
    'Hemang Kerung', 'Devbrat Ojha', 'MD Safik Kureshi', 'Mithilesh Saini',
    'Lokender Singh', 'Pushkar Kathik', 'Vikash Bundela', 'Mahalu Chaudhari',
    'Sanjay Shrestha', 'Ayush Gupta'
];

let currentEmployee = '';
let refreshTimer = null;
let reportData = [];
let filteredReportData = [];

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
    if (!checkAuth()) return;
    updateUIForRole();
    loadEmployees();
    loadEmployeeList();
    loadUsers();
    
    // Set default date range for report (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    const dateToInput = document.getElementById('reportDateTo');
    const dateFromInput = document.getElementById('reportDateFrom');
    if (dateToInput) dateToInput.value = today.toISOString().split('T')[0];
    if (dateFromInput) dateFromInput.value = thirtyDaysAgo.toISOString().split('T')[0];

    refreshTimer = setInterval(() => {
        if (currentEmployee) {
            loadActiveBreaks();
            if (document.getElementById('reportModal').classList.contains('active')) {
                loadFullReport();
            }
        }
    }, 30000);
});

// ===== TAB SWITCHING =====
function switchTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    const tabs = document.querySelectorAll('.nav-tab');
    const tabMap = { 'dashboard': 0, 'config': 1, 'users': 2, 'settings': 3 };
    if (tabMap[tabName] !== undefined) {
        tabs[tabMap[tabName]].classList.add('active');
    }

    document.getElementById(`tab-${tabName}`).classList.add('active');

    if (tabName === 'dashboard') {
        refreshData();
    } else if (tabName === 'config') {
        loadEmployeeList();
    } else if (tabName === 'users') {
        loadUsers();
    }
}

// ===== LIVE CLOCK =====
function updateClock() {
    const now = new Date();
    document.getElementById('liveTime').textContent = now.toLocaleTimeString();
}
setInterval(updateClock, 1000);
updateClock();

// ===== MODAL FUNCTIONS =====
function openReportModal() {
    document.getElementById('reportModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    loadReportEmployees();
    loadFullReport();
}

function closeReportModal() {
    document.getElementById('reportModal').classList.remove('active');
    document.body.style.overflow = '';
}

document.getElementById('reportModal').addEventListener('click', function(e) {
    if (e.target === this) closeReportModal();
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeReportModal();
});

// =============================================
// EMPLOYEE FUNCTIONS
// =============================================

async function loadAllEmployees() {
    try {
        const response = await fetch(`${API_URL}/api/employees/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employees: EMPLOYEES })
        });

        if (response.ok) {
            showAlert('✅ All employees loaded successfully!', 'success');
            await loadEmployees();
            await loadEmployeeList();
        } else {
            showAlert('❌ Error loading employees', 'error');
        }
    } catch (error) {
        showAlert('❌ Error connecting to server', 'error');
    }
}

async function loadEmployees() {
    try {
        const response = await fetch(`${API_URL}/api/employees`);
        const employees = await response.json();

        const select = document.getElementById('employeeSelect');
        select.innerHTML = '<option value="">Select an employee...</option>';

        if (employees && employees.length > 0) {
            let filteredEmployees = employees;
            if (currentUser && currentUser.role !== 'admin') {
                filteredEmployees = employees.filter(e => e.name === currentUser.username);
            }
            
            filteredEmployees.forEach(emp => {
                const option = document.createElement('option');
                option.value = emp.name;
                option.textContent = emp.name;
                select.appendChild(option);
            });
            
            if (filteredEmployees.length > 0) {
                select.value = filteredEmployees[0].name;
                onEmployeeChange();
            }
        }
    } catch (error) {
        console.error('Error loading employees:', error);
        const select = document.getElementById('employeeSelect');
        select.innerHTML = '<option value="">Select an employee...</option>';
        let filteredNames = EMPLOYEES;
        if (currentUser && currentUser.role !== 'admin') {
            filteredNames = EMPLOYEES.filter(e => e === currentUser.username);
        }
        filteredNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });
    }
}

async function loadEmployeeList() {
    try {
        const response = await fetch(`${API_URL}/api/employees`);
        const employees = await response.json();

        const container = document.getElementById('employeeListContainer');
        const countSpan = document.getElementById('employeeCount');

        if (!employees || employees.length === 0) {
            container.innerHTML = '<div class="no-data" style="grid-column:1/-1;">No employees found. Add one above!</div>';
            countSpan.textContent = '(0 employees)';
            return;
        }

        countSpan.textContent = `(${employees.length} employees)`;
        container.innerHTML = '';

        employees.forEach(emp => {
            const div = document.createElement('div');
            div.className = 'employee-item';
            div.innerHTML = `
                <span class="name"><i class="fas fa-user" style="color:#1a73e8; margin-right:8px;"></i>${emp.name}</span>
                <div class="actions">
                    <button class="btn btn-primary btn-sm" onclick="editEmployee('${emp.name}')" title="Edit Employee Name">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteEmployee('${emp.name}')" title="Delete Employee">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(div);
        });
    } catch (error) {
        console.error('Error loading employee list:', error);
    }
}

async function editEmployee(oldName) {
    const newName = prompt(`Enter new name for "${oldName}":`, oldName);
    
    if (!newName || newName === oldName) return;
    
    if (!confirm(`Are you sure you want to rename "${oldName}" to "${newName}"?`)) return;
    
    try {
        const response = await fetch(`${API_URL}/api/employees/${encodeURIComponent(oldName)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showAlert(`✅ Employee renamed from "${oldName}" to "${newName}"!`, 'success');
            
            if (currentUser && currentUser.username === oldName) {
                currentUser.username = newName;
                sessionStorage.setItem('user', JSON.stringify(currentUser));
                document.getElementById('userName').textContent = newName;
            }
            
            await loadEmployeeList();
            await loadEmployees();
            
            if (currentEmployee === oldName) {
                currentEmployee = newName;
                await onEmployeeChange();
            }
        } else {
            showAlert('❌ ' + result.error, 'error');
        }
    } catch (error) {
        showAlert('❌ Error connecting to server', 'error');
    }
}

async function deleteEmployee(name) {
    if (!confirm(`Are you sure you want to delete "${name}"? This will also delete all their break records.`)) return;

    try {
        const response = await fetch(`${API_URL}/api/employees/${encodeURIComponent(name)}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showAlert(`✅ Employee "${name}" deleted successfully!`, 'success');
            
            if (currentEmployee === name) {
                currentEmployee = '';
                document.getElementById('employeeSelect').value = '';
                document.getElementById('selectedEmployeeDisplay').value = 'None selected';
                document.getElementById('statusDisplay').innerHTML = 'Status: Idle';
                document.getElementById('statusDisplay').style.background = '#e9ecef';
                document.getElementById('employeeNameTitle').textContent = 'Select an employee';
                document.getElementById('breakBody').innerHTML = '<tr><td colspan="10" class="no-data">Please select an employee</td></tr>';
                document.getElementById('stats').innerHTML = '';
            }
            
            await loadEmployeeList();
            await loadEmployees();
        } else {
            showAlert('❌ Error deleting employee', 'error');
        }
    } catch (error) {
        showAlert('❌ Error connecting to server', 'error');
    }
}

async function addEmployee() {
    const nameInput = document.getElementById('newEmployeeName');
    const name = nameInput.value.trim();

    if (!name) {
        showAlert('Please enter an employee name!', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/employees/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employees: [name] })
        });

        if (response.ok) {
            showAlert(`✅ Employee "${name}" added successfully!`, 'success');
            nameInput.value = '';
            await loadEmployeeList();
            await loadEmployees();
        } else {
            showAlert('❌ Error adding employee', 'error');
        }
    } catch (error) {
        showAlert('❌ Error connecting to server', 'error');
    }
}

// =============================================
// USER MANAGEMENT (Admin Only)
// =============================================

async function loadUsers() {
    try {
        const response = await fetch(`${API_URL}/api/users`);
        const users = await response.json();

        const container = document.getElementById('userListContainer');
        const countSpan = document.getElementById('userCount');

        if (!users || users.length === 0) {
            container.innerHTML = '<div class="no-data" style="grid-column:1/-1;">No users found.</div>';
            countSpan.textContent = '(0 users)';
            return;
        }

        countSpan.textContent = `(${users.length} users)`;
        container.innerHTML = '';

        users.forEach(user => {
            const div = document.createElement('div');
            div.className = 'employee-item';
            const roleBadge = user.role === 'admin' 
                ? '<span class="badge badge-danger" style="background:#dc3545; color:white; padding:2px 10px; border-radius:20px; font-size:10px;">Admin</span>'
                : '<span class="badge badge-success" style="background:#28a745; color:white; padding:2px 10px; border-radius:20px; font-size:10px;">User</span>';
            
            const isCurrentUser = currentUser && currentUser.username === user.username;
            
            div.innerHTML = `
                <span class="name">
                    <i class="fas fa-user" style="color:#1a73e8; margin-right:8px;"></i>
                    ${user.username}
                    ${roleBadge}
                    ${isCurrentUser ? ' <span class="badge badge-primary" style="background:#1a73e8; color:white; padding:2px 10px; border-radius:20px; font-size:10px;">You</span>' : ''}
                </span>
                <div class="actions" style="display:flex; gap:5px; flex-wrap:wrap;">
                    ${user.username !== 'admin' ? `
                        <button class="btn btn-primary btn-sm" onclick="editUsername('${user.username}')" title="Edit Username">
                            <i class="fas fa-user-edit"></i>
                        </button>
                        <button class="btn btn-warning btn-sm" onclick="resetPassword('${user.username}')" title="Reset Password">
                            <i class="fas fa-key"></i>
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="toggleUserRole('${user.username}', '${user.role}')" title="Toggle Role">
                            <i class="fas fa-exchange-alt"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteUser('${user.username}')" title="Delete User">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : '<span style="color:#888; font-size:11px;">Protected</span>'}
                </div>
            `;
            container.appendChild(div);
        });
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

async function addUser() {
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newUserPassword').value.trim();
    const role = document.getElementById('newUserRole').value;

    if (!username) {
        showAlert('Please enter a username!', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role })
        });

        const result = await response.json();

        if (response.ok) {
            showAlert(`✅ ${result.message || `User "${username}" added successfully!`}`, 'success');
            document.getElementById('newUsername').value = '';
            await loadUsers();
            await loadEmployees();
        } else {
            showAlert('❌ ' + result.error, 'error');
        }
    } catch (error) {
        showAlert('❌ Error connecting to server', 'error');
    }
}

async function editUsername(oldUsername) {
    const newUsername = prompt(`Enter new username for "${oldUsername}":`, oldUsername);
    
    if (!newUsername || newUsername === oldUsername) return;
    
    if (!confirm(`Are you sure you want to change username from "${oldUsername}" to "${newUsername}"?`)) return;
    
    try {
        const response = await fetch(`${API_URL}/api/users/${encodeURIComponent(oldUsername)}/username`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newUsername })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showAlert(`✅ Username updated from "${oldUsername}" to "${newUsername}"!`, 'success');
            
            if (currentUser && currentUser.username === oldUsername) {
                currentUser.username = newUsername;
                sessionStorage.setItem('user', JSON.stringify(currentUser));
                document.getElementById('userName').textContent = newUsername;
            }
            
            await loadUsers();
            await loadEmployees();
        } else {
            showAlert('❌ ' + result.error, 'error');
        }
    } catch (error) {
        showAlert('❌ Error connecting to server', 'error');
    }
}

async function resetPassword(username) {
    const isOwnAccount = currentUser && currentUser.username === username;
    const message = isOwnAccount 
        ? `Reset your own password?` 
        : `Reset password for "${username}"?`;
    
    if (!confirm(message)) return;
    
    const newPassword = prompt(`Enter new password for "${username}":`, 'user123');
    
    if (!newPassword || newPassword.length < 4) {
        showAlert('Password must be at least 4 characters!', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/users/${encodeURIComponent(username)}/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                newPassword,
                currentUser: currentUser 
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showAlert(`✅ Password updated for "${username}"!`, 'success');
            await loadUsers();
        } else {
            showAlert('❌ ' + result.error, 'error');
        }
    } catch (error) {
        showAlert('❌ Error connecting to server', 'error');
    }
}

async function toggleUserRole(username, currentRole) {
    if (username === 'admin') {
        showAlert('Cannot change admin role!', 'error');
        return;
    }
    
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    if (!confirm(`Change "${username}" role from "${currentRole}" to "${newRole}"?`)) return;

    try {
        const response = await fetch(`${API_URL}/api/users/${encodeURIComponent(username)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole })
        });

        if (response.ok) {
            showAlert(`✅ User "${username}" role updated to "${newRole}"!`, 'success');
            await loadUsers();
        } else {
            showAlert('❌ Error updating user', 'error');
        }
    } catch (error) {
        showAlert('❌ Error connecting to server', 'error');
    }
}

async function deleteUser(username) {
    if (username === 'admin') {
        showAlert('Cannot delete admin user!', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) return;

    try {
        const response = await fetch(`${API_URL}/api/users/${encodeURIComponent(username)}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showAlert(`✅ User "${username}" deleted successfully!`, 'success');
            await loadUsers();
            await loadEmployees();
        } else {
            showAlert('❌ Error deleting user', 'error');
        }
    } catch (error) {
        showAlert('❌ Error connecting to server', 'error');
    }
}

// =============================================
// REPORT FILTER FUNCTIONS
// =============================================

async function loadReportEmployees() {
    try {
        const response = await fetch(`${API_URL}/api/employees`);
        const employees = await response.json();
        
        const select = document.getElementById('reportEmployeeFilter');
        select.innerHTML = '<option value="">All Employees</option>';
        
        if (employees && employees.length > 0) {
            let filteredEmployees = employees;
            if (currentUser && currentUser.role !== 'admin') {
                filteredEmployees = employees.filter(e => e.name === currentUser.username);
            }
            
            filteredEmployees.forEach(emp => {
                const option = document.createElement('option');
                option.value = emp.name;
                option.textContent = emp.name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading employees for report:', error);
    }
}

async function loadFullReport() {
    try {
        const response = await fetch(`${API_URL}/api/break-report`);
        reportData = await response.json();
        
        if (currentUser && currentUser.role !== 'admin') {
            reportData = reportData.filter(row => row.employee_name === currentUser.username);
        }
        
        filteredReportData = [...reportData];
        displayReportData(filteredReportData);
        updateReportStats(filteredReportData);
    } catch (error) {
        console.error('Error loading report:', error);
        document.getElementById('reportBody').innerHTML = '<tr><td colspan="6" class="no-data">Error loading report</td></tr>';
    }
}

function displayReportData(data) {
    const tbody = document.getElementById('reportBody');

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="no-data">No breaks found matching the filters</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    data.forEach(row => {
        const tr = document.createElement('tr');
        const statusBadge = row.status === 'On Break' ?
            '<span class="badge badge-warning">🔴 On Break</span>' :
            '<span class="badge badge-success">✅ Completed</span>';

        if (row.status === 'On Break') {
            tr.style.background = '#fff3cd';
        }

        tr.innerHTML = `
            <td><strong>${row.break_date}</strong></td>
            <td><strong>${row.employee_name}</strong></td>
            <td>${row.break_out}</td>
            <td>${row.break_in}</td>
            <td>${row.duration}</td>
            <td>${statusBadge}</td>
        `;
        tbody.appendChild(tr);
    });
}

function updateReportStats(data) {
    const total = data ? data.length : 0;
    const completed = data ? data.filter(row => row.status === 'Completed').length : 0;
    const active = data ? data.filter(row => row.status === 'On Break').length : 0;
    
    document.getElementById('reportTotalRecords').textContent = total;
    document.getElementById('reportCompletedCount').textContent = completed;
    document.getElementById('reportActiveCount').textContent = active;
}

function applyReportFilters() {
    const employeeFilter = document.getElementById('reportEmployeeFilter').value;
    const dateFrom = document.getElementById('reportDateFrom').value;
    const dateTo = document.getElementById('reportDateTo').value;
    const statusFilter = document.getElementById('reportStatusFilter').value;
    
    let filtered = [...reportData];
    
    if (employeeFilter) {
        filtered = filtered.filter(row => row.employee_name === employeeFilter);
    }
    
    if (dateFrom) {
        const fromDate = new Date(dateFrom);
        filtered = filtered.filter(row => {
            const rowDate = new Date(row.break_date);
            return rowDate >= fromDate;
        });
    }
    
    if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59);
        filtered = filtered.filter(row => {
            const rowDate = new Date(row.break_date);
            return rowDate <= toDate;
        });
    }
    
    if (statusFilter) {
        filtered = filtered.filter(row => row.status === statusFilter);
    }
    
    filteredReportData = filtered;
    displayReportData(filtered);
    updateReportStats(filtered);
    
    showAlert(`✅ Filter applied: ${filtered.length} records found`, 'success');
}

function resetReportFilters() {
    document.getElementById('reportEmployeeFilter').value = '';
    document.getElementById('reportDateFrom').value = '';
    document.getElementById('reportDateTo').value = '';
    document.getElementById('reportStatusFilter').value = '';
    
    filteredReportData = [...reportData];
    displayReportData(filteredReportData);
    updateReportStats(filteredReportData);
    
    showAlert('✅ Filters reset', 'success');
}

function exportReport() {
    const data = filteredReportData.length > 0 ? filteredReportData : reportData;
    
    if (!data || data.length === 0) {
        showAlert('No data to export!', 'error');
        return;
    }

    let csv = 'Date,Employee,Break,In,Duration,Status\n';
    data.forEach(row => {
        csv += `${row.break_date},${row.employee_name},${row.break_out},${row.break_in},${row.duration},${row.status}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `break-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    showAlert('✅ Report exported successfully!', 'success');
}

function exportReportPDF() {
    const data = filteredReportData.length > 0 ? filteredReportData : reportData;
    
    if (!data || data.length === 0) {
        showAlert('No data to export!', 'error');
        return;
    }
    
    const printWindow = window.open('', '_blank');
    const date = new Date().toLocaleDateString();
    
    let tableRows = '';
    data.forEach(row => {
        const statusColor = row.status === 'On Break' ? '#dc3545' : '#28a745';
        tableRows += `
            <tr>
                <td>${row.break_date}</td>
                <td>${row.employee_name}</td>
                <td>${row.break_out}</td>
                <td>${row.break_in}</td>
                <td>${row.duration}</td>
                <td style="color:${statusColor}; font-weight:bold;">${row.status}</td>
            </tr>
        `;
    });
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Break Report - ${date}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { color: #1a73e8; border-bottom: 2px solid #1a73e8; padding-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background: #1a73e8; color: white; padding: 10px; text-align: left; }
                td { padding: 8px 10px; border-bottom: 1px solid #ddd; }
                tr:nth-child(even) { background: #f8f9fa; }
                .summary { margin: 15px 0; padding: 10px; background: #f8f9fa; border-radius: 5px; }
                .footer { margin-top: 30px; text-align: center; color: #888; font-size: 12px; border-top: 1px solid #ddd; padding-top: 15px; }
                @media print {
                    body { padding: 10px; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <h1>📊 Break Report</h1>
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
            <div class="summary">
                <strong>Summary:</strong> 
                Total Records: ${data.length} | 
                Completed: ${data.filter(r => r.status === 'Completed').length} | 
                On Break: ${data.filter(r => r.status === 'On Break').length}
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Employee</th>
                        <th>Break</th>
                        <th>In</th>
                        <th>Duration</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
            <div class="footer">
                &copy; ${new Date().getFullYear()} Break Tracker Pro - All Rights Reserved
            </div>
            <div class="no-print" style="margin-top:20px; text-align:center;">
                <button onclick="window.print()" style="padding:10px 30px; background:#1a73e8; color:white; border:none; border-radius:5px; cursor:pointer; font-size:14px;">
                    🖨️ Print / Save as PDF
                </button>
                <button onclick="window.close()" style="padding:10px 30px; background:#6c757d; color:white; border:none; border-radius:5px; cursor:pointer; font-size:14px; margin-left:10px;">
                    Close
                </button>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
    
    showAlert('✅ PDF report ready for printing!', 'success');
}

// ===== SETTINGS FUNCTIONS =====
function updateSetting(setting) {
    let value;
    let message;

    switch (setting) {
        case 'breakAllowance':
            value = document.getElementById('breakAllowance').value;
            message = `Break allowance updated to ${value}`;
            break;
        case 'historyLimit':
            value = document.getElementById('historyLimit').value;
            message = `History limit updated to ${value} records`;
            break;
        case 'refreshInterval':
            value = document.getElementById('refreshInterval').value;
            message = `Auto-refresh interval updated to ${value} seconds`;
            if (refreshTimer) clearInterval(refreshTimer);
            refreshTimer = setInterval(() => {
                if (currentEmployee) {
                    loadActiveBreaks();
                    if (document.getElementById('reportModal').classList.contains('active')) {
                        loadFullReport();
                    }
                }
            }, value * 1000);
            break;
    }

    showAlert(`✅ ${message}`, 'success');
}

function clearAllData() {
    if (!confirm('⚠️ WARNING: This will delete ALL data. Are you sure?')) return;
    if (!confirm('⚠️ FINAL WARNING: This action cannot be undone!')) return;
    showAlert('🗑️ All data cleared!', 'success');
}

function resetToDefault() {
    if (!confirm('Reset all settings to default values?')) return;
    document.getElementById('breakAllowance').value = '2:30';
    document.getElementById('historyLimit').value = '50';
    document.getElementById('refreshInterval').value = '30';
    showAlert('✅ Settings reset to default!', 'success');
}

// =============================================
// BREAK MANAGEMENT
// =============================================

async function onEmployeeChange() {
    const employeeName = document.getElementById('employeeSelect').value;
    if (!employeeName) {
        document.getElementById('selectedEmployeeDisplay').value = 'None selected';
        document.getElementById('statusDisplay').innerHTML = 'Status: Idle';
        document.getElementById('statusDisplay').style.background = '#e9ecef';
        document.getElementById('employeeNameTitle').textContent = 'Select an employee';
        return;
    }

    currentEmployee = employeeName;
    document.getElementById('selectedEmployeeDisplay').value = employeeName;
    document.getElementById('employeeNameTitle').textContent = employeeName;

    await checkActiveBreak(employeeName);
    await loadBreaks();
    await loadActiveBreaks();
}

async function checkActiveBreak(employeeName) {
    try {
        const response = await fetch(`${API_URL}/api/active-break/${encodeURIComponent(employeeName)}`);
        const data = await response.json();

        const statusDisplay = document.getElementById('statusDisplay');
        const breakOutBtn = document.getElementById('breakOutBtn');
        const breakInBtn = document.getElementById('breakInBtn');

        if (data && data.id) {
            statusDisplay.innerHTML = '🔴 Status: <strong style="color:#dc3545;">ON BREAK</strong>';
            statusDisplay.style.background = '#ffebee';
            breakOutBtn.disabled = true;
            breakOutBtn.style.opacity = '0.5';
            breakInBtn.disabled = false;
            breakInBtn.style.opacity = '1';
        } else {
            statusDisplay.innerHTML = '🟢 Status: <strong style="color:#28a745;">Available</strong>';
            statusDisplay.style.background = '#e8f5e9';
            breakOutBtn.disabled = false;
            breakOutBtn.style.opacity = '1';
            breakInBtn.disabled = true;
            breakInBtn.style.opacity = '0.5';
        }
    } catch (error) {
        console.error('Error checking active break:', error);
    }
}

async function loadActiveBreaks() {
    try {
        const response = await fetch(`${API_URL}/api/active-breaks`);
        const data = await response.json();

        const container = document.getElementById('activeBreaksList');
        const badge = document.getElementById('activeCountBadge');
        const countSpan = document.getElementById('activeCount');
        const currentBreakCount = document.getElementById('currentBreakCount');

        const count = data ? data.length : 0;
        badge.innerHTML = `<i class="fas fa-users"></i> ${count} Active`;
        countSpan.textContent = `(${count})`;
        currentBreakCount.textContent = count;

        if (!data || data.length === 0) {
            container.innerHTML = '<span style="color: #adb5bd; font-size:13px;">✅ No one is on break right now</span>';
            return;
        }

        container.innerHTML = '';
        data.forEach(person => {
            const div = document.createElement('div');
            div.className = 'active-person';
            div.innerHTML = `
                <span class="dot"></span>
                <strong>${person.employee_name}</strong>
                <span style="font-size:11px; color:#888;">since ${person.break_out}</span>
            `;
            container.appendChild(div);
        });
    } catch (error) {
        console.error('Error loading active breaks:', error);
    }
}

async function loadBreaks() {
    const employeeName = document.getElementById('employeeSelect').value;
    if (!employeeName) {
        document.getElementById('breakBody').innerHTML = '<tr><td colspan="10" class="no-data">Please select an employee</td></tr>';
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/breaks/${encodeURIComponent(employeeName)}`);
        const data = await response.json();

        const tbody = document.getElementById('breakBody');

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="no-data">No breaks found. Click "Break" to start!</td></tr>';
            document.getElementById('stats').innerHTML = '';
            return;
        }

        tbody.innerHTML = '';
        data.forEach(row => {
            const tr = document.createElement('tr');
            if (row.is_active) tr.className = 'active-break';

            const statusBadge = row.is_active ?
                '<span class="badge badge-warning">⏳ On Break</span>' :
                '<span class="badge badge-success">✅ Completed</span>';

            tr.innerHTML = `
                <td><strong>${row.date}</strong></td>
                <td>${row["Employee Name"]}</td>
                <td>${row["Break"]}</td>
                <td>${row["IN"]}</td>
                <td>${row["Duration"]}</td>
                <td>${row["Used"]}</td>
                <td>${row["Remaining"]}</td>
                <td>${row["Total"]}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="deleteBreak(${row.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        updateStats(employeeName);
    } catch (error) {
        console.error('Error loading breaks:', error);
        showAlert('Error loading breaks', 'error');
    }
}

async function updateStats(employeeName) {
    try {
        const response = await fetch(`${API_URL}/api/today/${encodeURIComponent(employeeName)}`);
        const stats = await response.json();

        const statsDiv = document.getElementById('stats');
        const totalUsed = stats.total_time_used || '00:00:00';

        statsDiv.innerHTML = `
            <div class="stat-card">
                <div class="label">Breaks Today</div>
                <div class="value">${stats.breaks_today || 0}</div>
            </div>
            <div class="stat-card">
                <div class="label">Used Today</div>
                <div class="value">${totalUsed.substring(0, 5)}</div>
            </div>
            <div class="stat-card">
                <div class="label">Active Breaks</div>
                <div class="value warning">${stats.active_breaks || 0}</div>
            </div>
            <div class="stat-card">
                <div class="label">Total Allowed</div>
                <div class="value">2:30</div>
            </div>
        `;
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

// ===== BREAK ACTIONS =====
async function breakOut() {
    const employeeName = document.getElementById('employeeSelect').value;
    if (!employeeName) {
        showAlert('Please select an employee first!', 'error');
        return;
    }

    const now = new Date();
    const breakOut = now.toTimeString().slice(0, 5);
    const breakDate = now.toISOString().split('T')[0];

    try {
        const response = await fetch(`${API_URL}/api/break-out`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employeeName, breakDate, breakOut })
        });

        const result = await response.json();

        if (response.ok) {
            showAlert(`✅ ${employeeName} started break at ${breakOut}`, 'success');
            await refreshData();
        } else {
            showAlert('❌ ' + result.error, 'error');
        }
    } catch (error) {
        showAlert('❌ Error connecting to server', 'error');
    }
}

async function breakIn() {
    const employeeName = document.getElementById('employeeSelect').value;
    if (!employeeName) {
        showAlert('Please select an employee first!', 'error');
        return;
    }

    const now = new Date();
    const breakIn = now.toTimeString().slice(0, 5);
    const breakDate = now.toISOString().split('T')[0];

    try {
        const response = await fetch(`${API_URL}/api/break-in`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employeeName, breakDate, breakIn })
        });

        const result = await response.json();

        if (response.ok) {
            showAlert(`✅ ${employeeName} ended break at ${breakIn}`, 'success');
            await refreshData();
        } else {
            showAlert('❌ ' + result.error, 'error');
        }
    } catch (error) {
        showAlert('❌ Error connecting to server', 'error');
    }
}

async function deleteBreak(id) {
    if (!confirm('Are you sure you want to delete this break?')) return;

    try {
        const response = await fetch(`${API_URL}/api/breaks/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showAlert('✅ Break deleted successfully!', 'success');
            await refreshData();
        } else {
            showAlert('❌ Error deleting break', 'error');
        }
    } catch (error) {
        showAlert('❌ Error connecting to server', 'error');
    }
}

// ===== UTILITIES =====
async function refreshData() {
    await onEmployeeChange();
}

function showAlert(message, type) {
    const alertDiv = document.getElementById('alert');
    alertDiv.textContent = message;
    alertDiv.className = `alert alert-${type}`;

    setTimeout(() => {
        alertDiv.className = 'alert';
    }, 5000);
}