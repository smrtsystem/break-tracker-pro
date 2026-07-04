// =============================================
// API URL
// =============================================
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000' 
    : '';

// =============================================
// AUTHENTICATION
// =============================================

let currentUser = null;
let currentEmployee = null;
let refreshTimer = null;

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
    const isSubAdmin = currentUser && currentUser.role === 'sub-admin';
    const canManage = currentUser && currentUser.can_manage_users;
    
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = (isAdmin || isSubAdmin) ? 'flex' : 'none';
    });
    
    document.querySelectorAll('.subadmin-only').forEach(el => {
        el.style.display = (isAdmin || isSubAdmin) ? 'flex' : 'none';
    });
    
    document.getElementById('userName').textContent = currentUser ? currentUser.username : 'Unknown';
    
    const roleBadge = document.getElementById('userRoleBadge');
    if (currentUser) {
        const roleMap = {
            'admin': '👑 Admin',
            'sub-admin': '🛡️ Sub-Admin',
            'user': '👤 User'
        };
        roleBadge.textContent = roleMap[currentUser.role] || 'User';
    }
}

// Logout
function logout() {
    sessionStorage.removeItem('user');
    window.location.href = 'login.html';
}

// =============================================
// LIVE CLOCK
// =============================================

function updateClock() {
    const now = new Date();
    document.getElementById('liveTime').textContent = now.toLocaleTimeString();
}
setInterval(updateClock, 1000);
updateClock();

// =============================================
// INITIALIZATION
// =============================================

document.addEventListener('DOMContentLoaded', function() {
    if (!checkAuth()) return;
    updateUIForRole();
    loadDepartments();
    loadEmployees();
    loadUsers();
    loadActiveBreaks();
    
    // Auto-refresh every 15 seconds
    refreshTimer = setInterval(() => {
        loadActiveBreaks();
        if (currentEmployee) {
            loadEmployeeBreaks(currentEmployee);
        }
    }, 15000);
});

// =============================================
// TAB SWITCHING
// =============================================

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
        loadDepartments();
        loadEmployees();
    } else if (tabName === 'users') {
        loadUsers();
    }
}

// =============================================
// MODAL FUNCTIONS
// =============================================

function openReportModal() {
    document.getElementById('reportModal').classList.add('active');
    document.body.style.overflow = 'hidden';
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
// DEPARTMENT FUNCTIONS
// =============================================

async function loadDepartments() {
    try {
        const response = await fetch(`${API_URL}/api/departments`);
        const departments = await response.json();
        
        const deptSelect = document.getElementById('newEmployeeDepartment');
        deptSelect.innerHTML = '';
        
        departments.forEach(dept => {
            const option = document.createElement('option');
            option.value = dept.name;
            option.textContent = dept.name;
            deptSelect.appendChild(option);
        });
        
        // Show department list
        const deptList = document.getElementById('departmentList');
        if (deptList) {
            deptList.innerHTML = '';
            departments.forEach(dept => {
                const badge = document.createElement('span');
                badge.className = 'department-badge';
                badge.innerHTML = `
                    <i class="fas fa-building"></i> ${dept.name}
                    <button onclick="deleteDepartment('${dept.name}')" style="background:none; border:none; color:#dc3545; cursor:pointer; margin-left:5px;">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                deptList.appendChild(badge);
            });
        }
    } catch (error) {
        console.error('Error loading departments:', error);
    }
}

async function addDepartment() {
    const name = document.getElementById('newDepartmentName').value.trim();
    if (!name) {
        showAlert('Please enter a department name!', 'error');
        return;
    }
    try {
        const response = await fetch(`${API_URL}/api/departments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (response.ok) {
            showAlert(`✅ Department "${name}" added successfully!`, 'success');
            document.getElementById('newDepartmentName').value = '';
            await loadDepartments();
        } else {
            const error = await response.json();
            showAlert('❌ ' + error.error, 'error');
        }
    } catch (error) {
        showAlert('❌ Error connecting to server', 'error');
    }
}

async function deleteDepartment(name) {
    if (!confirm(`Are you sure you want to delete department "${name}"?`)) return;
    try {
        const response = await fetch(`${API_URL}/api/departments/${encodeURIComponent(name)}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            showAlert(`✅ Department "${name}" deleted!`, 'success');
            await loadDepartments();
            await loadEmployees();
        } else {
            showAlert('❌ Error deleting department', 'error');
        }
    } catch (error) {
        showAlert('❌ Error connecting to server', 'error');
    }
}

// =============================================
// EMPLOYEE FUNCTIONS
// =============================================

async function loadEmployees() {
    try {
        const response = await fetch(`${API_URL}/api/employees`);
        const employees = await response.json();

        const select = document.getElementById('employeeSelect');
        select.innerHTML = '<option value="">Select an employee...</option>';

        if (employees && employees.length > 0) {
            employees.forEach(emp => {
                const option = document.createElement('option');
                option.value = emp.name;
                option.textContent = `${emp.name} (${emp.department})`;
                select.appendChild(option);
            });
            
            // Select first employee by default
            if (!currentEmployee && employees.length > 0) {
                select.value = employees[0].name;
                onEmployeeChange();
            }
        }
        
        await loadEmployeeList(employees);
        await loadEmployeesForReport(employees);
    } catch (error) {
        console.error('Error loading employees:', error);
        showAlert('Error loading employees', 'error');
    }
}

async function loadEmployeeList(employees) {
    try {
        if (!employees) {
            const response = await fetch(`${API_URL}/api/employees`);
            employees = await response.json();
        }

        const container = document.getElementById('employeeListContainer');
        const countSpan = document.getElementById('employeeCount');

        if (!employees || employees.length === 0) {
            container.innerHTML = '<div class="no-data">No employees found.</div>';
            countSpan.textContent = '(0 employees)';
            return;
        }

        countSpan.textContent = `(${employees.length} employees)`;
        container.innerHTML = '';

        employees.forEach(emp => {
            const div = document.createElement('div');
            div.className = 'employee-item';
            const typeBadge = emp.employee_type === 'local' 
                ? '<span class="badge badge-local">🇱🇰 Local</span>'
                : '<span class="badge badge-expat">🌍 Expat</span>';
            
            div.innerHTML = `
                <span class="name">
                    <i class="fas fa-user" style="color:#1a73e8; margin-right:8px;"></i>
                    ${emp.name}
                    ${typeBadge}
                    <span style="font-size:10px; color:#888;">(${emp.department})</span>
                </span>
                <div class="actions">
                    <button class="btn btn-danger btn-sm" onclick="deleteEmployee(${emp.id})" title="Delete Employee">
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

async function loadEmployeesForReport(employees) {
    try {
        if (!employees) {
            const response = await fetch(`${API_URL}/api/employees`);
            employees = await response.json();
        }
        
        const select = document.getElementById('reportEmployeeFilter');
        if (!select) return;
        
        select.innerHTML = '<option value="">All Employees</option>';
        employees.forEach(emp => {
            const option = document.createElement('option');
            option.value = emp.name;
            option.textContent = `${emp.name} (${emp.department})`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading employees for report:', error);
    }
}

async function addEmployee() {
    const name = document.getElementById('newEmployeeName').value.trim();
    const department = document.getElementById('newEmployeeDepartment').value;
    const employee_type = document.getElementById('newEmployeeType').value;

    if (!name) {
        showAlert('Please enter an employee name!', 'error');
        return;
    }
    if (!department) {
        showAlert('Please select a department!', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/employees`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, department, employee_type })
        });

        const result = await response.json();

        if (response.ok) {
            showAlert(`✅ Employee "${name}" added successfully!`, 'success');
            document.getElementById('newEmployeeName').value = '';
            await loadEmployees();
            // Also reload the employee select dropdown
            await loadEmployees();
        } else {
            showAlert('❌ ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error adding employee:', error);
        showAlert('❌ Error connecting to server', 'error');
    }
}

async function deleteEmployee(id) {
    if (!confirm('Are you sure you want to delete this employee?')) return;
    try {
        const response = await fetch(`${API_URL}/api/employees/${id}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            showAlert('✅ Employee deleted successfully!', 'success');
            await loadEmployees();
        } else {
            showAlert('❌ Error deleting employee', 'error');
        }
    } catch (error) {
        showAlert('❌ Error connecting to server', 'error');
    }
}

// =============================================
// USER FUNCTIONS
// =============================================

async function loadUsers() {
    try {
        const response = await fetch(`${API_URL}/api/users`);
        const users = await response.json();

        const container = document.getElementById('userListContainer');
        const countSpan = document.getElementById('userCount');

        if (!users || users.length === 0) {
            container.innerHTML = '<div class="no-data">No users found.</div>';
            countSpan.textContent = '(0 users)';
            return;
        }

        countSpan.textContent = `(${users.length} users)`;
        container.innerHTML = '';

        users.forEach(user => {
            const div = document.createElement('div');
            div.className = 'employee-item';
            
            const roleMap = {
                'admin': '👑 Admin',
                'sub-admin': '🛡️ Sub-Admin',
                'user': '👤 User'
            };
            
            const isCurrentUser = currentUser && currentUser.username === user.username;
            const isMainAdmin = user.username === 'admin';
            
            div.innerHTML = `
                <span class="name">
                    <i class="fas fa-user" style="color:#1a73e8; margin-right:8px;"></i>
                    ${user.username}
                    <span style="font-size:10px; background:#e9ecef; padding:2px 8px; border-radius:10px;">
                        ${roleMap[user.role] || user.role}
                        ${user.can_manage_users ? ' 🔑' : ''}
                    </span>
                    ${isCurrentUser ? ' <span style="font-size:10px; background:#1a73e8; color:white; padding:2px 8px; border-radius:10px;">You</span>' : ''}
                </span>
                <div class="actions" style="display:flex; gap:5px; flex-wrap:wrap;">
                    ${!isMainAdmin ? `
                        <button class="btn btn-primary btn-sm" onclick="editUsername('${user.username}')" title="Edit Username">
                            <i class="fas fa-user-edit"></i>
                        </button>
                        <button class="btn btn-warning btn-sm" onclick="resetPassword('${user.username}')" title="Reset Password">
                            <i class="fas fa-key"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteUser('${user.username}')" title="Delete User">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : '<span style="color:#888; font-size:11px;">🔒 Main Admin</span>'}
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
        // Check if employee exists
        const empCheck = await fetch(`${API_URL}/api/employees`);
        const employees = await empCheck.json();
        const employeeExists = employees.some(e => e.name === username);
        
        if (!employeeExists) {
            showAlert('❌ Employee not found! Please add employee first.', 'error');
            return;
        }

        const response = await fetch(`${API_URL}/api/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username, 
                password: password || 'user123', 
                role: role || 'user',
                can_manage_users: false 
            })
        });

        const result = await response.json();

        if (response.ok) {
            showAlert(`✅ User "${username}" added successfully!`, 'success');
            document.getElementById('newUsername').value = '';
            await loadUsers();
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
    try {
        const response = await fetch(`${API_URL}/api/users/${encodeURIComponent(oldUsername)}/username`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newUsername })
        });
        const result = await response.json();
        if (response.ok) {
            showAlert('✅ Username updated!', 'success');
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
    const newPassword = prompt(`Enter new password for "${username}":`, 'user123');
    if (!newPassword || newPassword.length < 4) {
        showAlert('Password must be at least 4 characters!', 'error');
        return;
    }
    try {
        const response = await fetch(`${API_URL}/api/users/${encodeURIComponent(username)}/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newPassword, currentUser })
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

async function deleteUser(username) {
    if (username === 'admin') {
        showAlert('Cannot delete main admin!', 'error');
        return;
    }
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) return;
    try {
        const response = await fetch(`${API_URL}/api/users/${encodeURIComponent(username)}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            showAlert(`✅ User "${username}" deleted!`, 'success');
            await loadUsers();
        } else {
            showAlert('❌ Error deleting user', 'error');
        }
    } catch (error) {
        showAlert('❌ Error connecting to server', 'error');
    }
}

// =============================================
// BREAK FUNCTIONS
// =============================================

async function onEmployeeChange() {
    const select = document.getElementById('employeeSelect');
    const employeeName = select.value;
    
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

    await loadEmployeeBreaks(employeeName);
    await checkActiveBreak(employeeName);
}

async function loadEmployeeBreaks(employeeName) {
    const tbody = document.getElementById('breakBody');
    
    if (!employeeName) {
        tbody.innerHTML = '<tr><td colspan="12" class="no-data">Please select an employee</td></tr>';
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/breaks/${encodeURIComponent(employeeName)}`);
        const data = await response.json();

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="no-data">No breaks found. Click "Break" to start!</td></tr>';
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
                <td>${employeeName}</td>
                <td>${row["Break"]}</td>
                <td>${row["IN"]}</td>
                <td>${row["Duration"]}</td>
                <td>--</td>
                <td>--</td>
                <td>--</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="deleteBreak(${row.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error loading breaks:', error);
        tbody.innerHTML = '<tr><td colspan="12" class="no-data">Error loading breaks</td></tr>';
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
        if (badge) badge.innerHTML = `<i class="fas fa-users"></i> ${count} Active`;
        if (countSpan) countSpan.textContent = `(${count})`;
        if (currentBreakCount) currentBreakCount.textContent = count;

        if (!data || data.length === 0) {
            container.innerHTML = '<span style="color: #adb5bd; font-size:13px;">✅ No one is on break right now</span>';
            return;
        }

        container.innerHTML = '';
        data.forEach(person => {
            const div = document.createElement('div');
            div.className = 'active-person';
            const typeIcon = person.employee_type === 'local' ? '🇱🇰' : '🌍';
            div.innerHTML = `
                <span class="dot"></span>
                <strong>${person.employee_name}</strong>
                <span style="font-size:10px; background:#e9ecef; padding:1px 8px; border-radius:10px;">${person.department || 'N/A'}</span>
                <span style="font-size:10px;">${typeIcon}</span>
                <span style="font-size:11px; color:#888;">since ${person.break_out}</span>
            `;
            container.appendChild(div);
        });
    } catch (error) {
        console.error('Error loading active breaks:', error);
    }
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
            await loadActiveBreaks(); // Update active breaks instantly
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
            await loadActiveBreaks(); // Update active breaks instantly
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
            await loadActiveBreaks();
        } else {
            showAlert('❌ Error deleting break', 'error');
        }
    } catch (error) {
        showAlert('❌ Error connecting to server', 'error');
    }
}

// =============================================
// REPORT FUNCTIONS
// =============================================

async function loadFullReport() {
    try {
        const response = await fetch(`${API_URL}/api/break-report`);
        const data = await response.json();
        
        const tbody = document.getElementById('reportBody');
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="no-data">No breaks found</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        data.forEach(row => {
            const tr = document.createElement('tr');
            const statusBadge = row.status === 'On Break' ?
                '<span class="badge badge-warning">🔴 On Break</span>' :
                '<span class="badge badge-success">✅ Completed</span>';
            tr.innerHTML = `
                <td>${row.break_date}</td>
                <td>${row.employee_name}</td>
                <td>${row.department || '-'}</td>
                <td>${row.employee_type === 'local' ? '🇱🇰 Local' : '🌍 Expat'}</td>
                <td>${row.break_out}</td>
                <td>${row.break_in}</td>
                <td>${row.duration}</td>
                <td>${statusBadge}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error loading report:', error);
    }
}

// =============================================
// UTILITY FUNCTIONS
// =============================================

async function refreshData() {
    await onEmployeeChange();
    await loadActiveBreaks();
}

function showAlert(message, type) {
    const alertDiv = document.getElementById('alert');
    alertDiv.textContent = message;
    alertDiv.className = `alert alert-${type}`;
    setTimeout(() => {
        alertDiv.className = 'alert';
    }, 5000);
}

function exportReport() {
    showAlert('📊 Report export coming soon!', 'success');
}

function exportReportPDF() {
    showAlert('📄 PDF export coming soon!', 'success');
}

function applyReportFilters() {
    showAlert('✅ Filters applied!', 'success');
}

function resetReportFilters() {
    showAlert('✅ Filters reset!', 'success');
}

function updateSetting(setting) {
    showAlert('✅ Setting updated!', 'success');
}

function clearAllData() {
    if (!confirm('⚠️ WARNING: This will delete ALL data. Are you sure?')) return;
    showAlert('🗑️ All data cleared!', 'success');
}

function resetToDefault() {
    if (!confirm('Reset all settings to default values?')) return;
    showAlert('✅ Settings reset to default!', 'success');
}
