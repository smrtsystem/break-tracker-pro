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
let currentDepartmentFilter = 'all';
let editEmployeeId = null;
let breakAlerts = [];
let alertInterval = null;
let congratsInterval = null;

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
    
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = (isAdmin || isSubAdmin) ? 'flex' : 'none';
    });
    
    const settingsTab = document.getElementById('settingsTab');
    if (settingsTab) {
        settingsTab.style.display = isAdmin ? 'flex' : 'none';
    }
    
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
// LIVE CLOCK - ZAMBIAN TIME (CAT - UTC+2)
// =============================================

function updateClock() {
    const now = new Date();
    const options = {
        timeZone: 'Africa/Lusaka',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    };
    const timeStr = now.toLocaleTimeString('en-US', options);
    document.getElementById('liveTime').textContent = timeStr;
}
setInterval(updateClock, 1000);
updateClock();

// =============================================
// INITIALIZATION
// =============================================

document.addEventListener('DOMContentLoaded', function() {
    if (!checkAuth()) return;
    updateUIForRole();
    loadEmployees();
    loadUsers();
    loadActiveBreaks();
    loadDepartmentsForSelect();
    loadSettings();
    initBreakAlerts();
    initCongratulationsMessage();
    
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

function loadDepartmentsForSelect() {
    const departments = ['Betrealated', 'Banking', 'CS', 'Checking'];
    const select = document.getElementById('newEmployeeDepartment');
    if (select) {
        select.innerHTML = '';
        departments.forEach(dept => {
            const option = document.createElement('option');
            option.value = dept;
            option.textContent = dept;
            select.appendChild(option);
        });
    }
}

function filterDepartment(department) {
    currentDepartmentFilter = department;
    
    document.querySelectorAll('.dept-tab').forEach(tab => {
        tab.classList.remove('active');
        tab.classList.add('btn-secondary');
        tab.classList.remove('btn-primary');
    });
    
    const activeTab = document.querySelector(`.dept-tab[data-dept="${department}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
        activeTab.classList.remove('btn-secondary');
        activeTab.classList.add('btn-primary');
    }
    
    loadEmployees();
}

function showAddEmployeeForm() {
    document.getElementById('addEmployeeForm').style.display = 'block';
}

function hideAddEmployeeForm() {
    document.getElementById('addEmployeeForm').style.display = 'none';
    document.getElementById('newEmployeeName').value = '';
}

function openEditEmployeeModal(id, name, department, type) {
    editEmployeeId = id;
    document.getElementById('editEmployeeName').value = name;
    document.getElementById('editEmployeeDepartment').value = department;
    document.getElementById('editEmployeeType').value = type;
    document.getElementById('editEmployeeModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeEditEmployeeModal() {
    document.getElementById('editEmployeeModal').classList.remove('active');
    document.body.style.overflow = '';
    editEmployeeId = null;
}

document.getElementById('editEmployeeModal').addEventListener('click', function(e) {
    if (e.target === this) closeEditEmployeeModal();
});

// =============================================
// EMPLOYEE FUNCTIONS
// =============================================

async function loadEmployees() {
    try {
        const response = await fetch(`${API_URL}/api/employees`);
        let employees = await response.json();

        if (currentUser && currentUser.role === 'user') {
            employees = employees.filter(e => e.name === currentUser.username);
        }

        if (currentDepartmentFilter !== 'all' && currentUser && (currentUser.role === 'admin' || currentUser.role === 'sub-admin')) {
            employees = employees.filter(e => e.department === currentDepartmentFilter);
        }

        const select = document.getElementById('employeeSelect');
        if (select) {
            select.innerHTML = '<option value="">Select an employee...</option>';
            
            if (employees.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'No employees found';
                option.disabled = true;
                select.appendChild(option);
            } else {
                employees.forEach(emp => {
                    const option = document.createElement('option');
                    option.value = emp.name;
                    const typeIcon = emp.employee_type === 'local' ? '🇱🇰' : '🌍';
                    option.textContent = `${emp.name} (${emp.department}) ${typeIcon}`;
                    select.appendChild(option);
                });
                
                if (!currentEmployee && employees.length > 0) {
                    select.value = employees[0].name;
                    onEmployeeChange();
                }
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
            
            if (currentUser && currentUser.role === 'user') {
                employees = employees.filter(e => e.name === currentUser.username);
            }
            
            if (currentDepartmentFilter !== 'all' && currentUser && (currentUser.role === 'admin' || currentUser.role === 'sub-admin')) {
                employees = employees.filter(e => e.department === currentDepartmentFilter);
            }
        }

        const container = document.getElementById('employeeListContainer');
        const countSpan = document.getElementById('employeeCount');

        if (!employees || employees.length === 0) {
            container.innerHTML = `<div class="no-data" style="grid-column: 1/-1;">
                <i class="fas fa-users" style="font-size:24px; color:#ddd;"></i>
                <p style="margin-top:8px;">No employees found</p>
            </div>`;
            if (countSpan) countSpan.textContent = '(0 employees)';
            return;
        }

        if (countSpan) countSpan.textContent = `(${employees.length} employees)`;
        container.innerHTML = '';

        const grouped = {};
        employees.forEach(emp => {
            if (!grouped[emp.department]) grouped[emp.department] = [];
            grouped[emp.department].push(emp);
        });

        for (const [dept, emps] of Object.entries(grouped)) {
            const header = document.createElement('div');
            header.className = 'department-header';
            header.innerHTML = `<i class="fas fa-building"></i> ${dept} (${emps.length})`;
            container.appendChild(header);
            
            const locals = emps.filter(e => e.employee_type === 'local');
            const expats = emps.filter(e => e.employee_type === 'expat');
            
            if (locals.length > 0) {
                const typeHeader = document.createElement('div');
                typeHeader.className = 'employee-type-header';
                typeHeader.innerHTML = `🇱🇰 Local Employees (${locals.length})`;
                typeHeader.style.cssText = 'padding: 4px 12px; font-size: 11px; color: #28a745; font-weight: 600; margin-top: 4px; background: #e8f5e9; border-radius:4px;';
                container.appendChild(typeHeader);
                
                locals.forEach(emp => {
                    const div = createEmployeeItem(emp);
                    container.appendChild(div);
                });
            }
            
            if (expats.length > 0) {
                const typeHeader = document.createElement('div');
                typeHeader.className = 'employee-type-header';
                typeHeader.innerHTML = `🌍 Expat Employees (${expats.length})`;
                typeHeader.style.cssText = 'padding: 4px 12px; font-size: 11px; color: #1a73e8; font-weight: 600; margin-top: 8px; background: #e3f2fd; border-radius:4px;';
                container.appendChild(typeHeader);
                
                expats.forEach(emp => {
                    const div = createEmployeeItem(emp);
                    container.appendChild(div);
                });
            }
        }
    } catch (error) {
        console.error('Error loading employee list:', error);
    }
}

function createEmployeeItem(emp) {
    const div = document.createElement('div');
    div.className = 'employee-item';
    const typeBadge = emp.employee_type === 'local' 
        ? '<span class="badge badge-local">🇱🇰 Local</span>'
        : '<span class="badge badge-expat">🌍 Expat</span>';
    
    const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'sub-admin');
    let actionsHtml = '';
    if (isAdmin) {
        actionsHtml = `
            <div class="actions">
                <button class="btn btn-primary btn-sm" onclick="openEditEmployeeModal(${emp.employee_id}, '${emp.name}', '${emp.department}', '${emp.employee_type}')" title="Edit Employee">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-danger btn-sm" onclick="deleteEmployee(${emp.employee_id})" title="Delete Employee">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    }
    
    div.innerHTML = `
        <span class="name">
            <i class="fas fa-user" style="color:#1a73e8; margin-right:8px;"></i>
            ${emp.name}
            ${typeBadge}
        </span>
        ${actionsHtml}
    `;
    return div;
}

async function addEmployee() {
    const name = document.getElementById('newEmployeeName').value.trim();
    const department = document.getElementById('newEmployeeDepartment').value;
    const employee_type = document.getElementById('newEmployeeType').value;

    if (!name) {
        showAlert('Please enter an employee name!', 'error');
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
            hideAddEmployeeForm();
            await loadEmployees();
        } else {
            showAlert('❌ ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error adding employee:', error);
        showAlert('❌ Error connecting to server', 'error');
    }
}

async function saveEditEmployee() {
    const name = document.getElementById('editEmployeeName').value.trim();
    const department = document.getElementById('editEmployeeDepartment').value;
    const employee_type = document.getElementById('editEmployeeType').value;

    if (!name) {
        showAlert('Please enter an employee name!', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/employees/${editEmployeeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, department, employee_type })
        });

        const result = await response.json();

        if (response.ok) {
            showAlert(`✅ Employee updated successfully!`, 'success');
            closeEditEmployeeModal();
            await loadEmployees();
        } else {
            showAlert('❌ ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error updating employee:', error);
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

async function loadEmployeesForReport(employees) {
    try {
        if (!employees) {
            const response = await fetch(`${API_URL}/api/employees`);
            employees = await response.json();
        }
        
        if (currentUser && currentUser.role === 'user') {
            employees = employees.filter(e => e.name === currentUser.username);
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

async function loadUsers() {
    try {
        const response = await fetch(`${API_URL}/api/users`);
        const users = await response.json();

        const container = document.getElementById('userListContainer');
        const countSpan = document.getElementById('userCount');

        if (!users || users.length === 0) {
            container.innerHTML = '<div class="no-data" style="grid-column: 1/-1;">No users found.</div>';
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
                        <!-- Only Admin can change role -->
                        ${currentUser && currentUser.role === 'admin' ? `
                            <button class="btn btn-secondary btn-sm" onclick="toggleUserRole('${user.username}', '${user.role}', ${user.can_manage_users})" title="Toggle Role">
                                <i class="fas fa-exchange-alt"></i>
                            </button>
                        ` : ''}
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

// Only Admin can toggle user role
async function toggleUserRole(username, currentRole, currentCanManage) {
    if (username === 'admin') {
        showAlert('Cannot change main admin!', 'error');
        return;
    }
    
    // Check if current user is admin
    if (currentUser && currentUser.role !== 'admin') {
        showAlert('❌ Only Admin can change user roles!', 'error');
        return;
    }
    
    const newRole = currentRole === 'admin' ? 'sub-admin' : 
                    currentRole === 'sub-admin' ? 'user' : 'sub-admin';
    const newCanManage = !currentCanManage;
    
    if (!confirm(`Update "${username}"?\nRole: ${currentRole} → ${newRole}\nManage Users: ${currentCanManage} → ${newCanManage}`)) return;

    try {
        const response = await fetch(`${API_URL}/api/users/${encodeURIComponent(username)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                role: newRole, 
                can_manage_users: newCanManage,
                currentUser: currentUser 
            })
        });

        if (response.ok) {
            showAlert(`✅ User "${username}" updated!`, 'success');
            await loadUsers();
        } else {
            const result = await response.json();
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
// SETTINGS FUNCTIONS
// =============================================

async function loadSettings() {
    try {
        const response = await fetch(`${API_URL}/api/settings`);
        const settings = await response.json();
        
        settings.forEach(setting => {
            const key = setting.setting_key;
            const value = setting.setting_value;
            
            if (key === 'local_break_allowance') {
                document.getElementById('localBreakAllowance').value = value;
            } else if (key === 'expat_break_allowance') {
                document.getElementById('expatBreakAllowance').value = value;
            } else if (key === 'history_limit') {
                document.getElementById('historyLimit').value = value;
            } else if (key === 'refresh_interval') {
                document.getElementById('refreshInterval').value = value;
                if (refreshTimer) clearInterval(refreshTimer);
                refreshTimer = setInterval(() => {
                    loadActiveBreaks();
                    if (currentEmployee) {
                        loadEmployeeBreaks(currentEmployee);
                    }
                }, parseInt(value) * 1000);
            }
        });
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

async function updateSetting(setting) {
    let value;
    let settingKey;
    let message;

    switch (setting) {
        case 'localBreakAllowance':
            value = document.getElementById('localBreakAllowance').value.trim();
            settingKey = 'local_break_allowance';
            message = `Local employee break allowance updated to ${value}`;
            break;
        case 'expatBreakAllowance':
            value = document.getElementById('expatBreakAllowance').value.trim();
            settingKey = 'expat_break_allowance';
            message = `Expat employee break allowance updated to ${value}`;
            break;
        case 'historyLimit':
            value = document.getElementById('historyLimit').value.trim();
            settingKey = 'history_limit';
            message = `History limit updated to ${value} records`;
            break;
        case 'refreshInterval':
            value = document.getElementById('refreshInterval').value.trim();
            settingKey = 'refresh_interval';
            message = `Auto-refresh interval updated to ${value} seconds`;
            if (refreshTimer) clearInterval(refreshTimer);
            refreshTimer = setInterval(() => {
                loadActiveBreaks();
                if (currentEmployee) {
                    loadEmployeeBreaks(currentEmployee);
                }
            }, parseInt(value) * 1000);
            break;
        default:
            showAlert('❌ Unknown setting', 'error');
            return;
    }

    try {
        const response = await fetch(`${API_URL}/api/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ setting_key: settingKey, setting_value: value })
        });

        const result = await response.json();

        if (response.ok) {
            showAlert(`✅ ${message}`, 'success');
        } else {
            showAlert('❌ Error saving setting: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error saving setting:', error);
        showAlert('❌ Error connecting to server', 'error');
    }
}

function clearAllData() {
    if (!confirm('⚠️ WARNING: This will delete ALL data. Are you sure?')) return;
    if (!confirm('⚠️ FINAL WARNING: This action cannot be undone!')) return;
    showAlert('🗑️ All data cleared!', 'success');
}

function resetToDefault() {
    if (!confirm('Reset all settings to default values?')) return;
    
    const defaults = {
        'local_break_allowance': '1:00',
        'expat_break_allowance': '2:30',
        'history_limit': '50',
        'refresh_interval': '15'
    };
    
    document.getElementById('localBreakAllowance').value = '1:00';
    document.getElementById('expatBreakAllowance').value = '2:30';
    document.getElementById('historyLimit').value = '50';
    document.getElementById('refreshInterval').value = '15';
    
    for (const [key, value] of Object.entries(defaults)) {
        fetch(`${API_URL}/api/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ setting_key: key, setting_value: value })
        }).catch(console.error);
    }
    
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
        loadActiveBreaks();
        if (currentEmployee) {
            loadEmployeeBreaks(currentEmployee);
        }
    }, 15000);
    
    showAlert('✅ Settings reset to default! (Local: 1:00, Expat: 2:30)', 'success');
}

// =============================================
// CONGRATULATIONS MESSAGE
// =============================================

function initCongratulationsMessage() {
    if (congratsInterval) clearInterval(congratsInterval);
    congratsInterval = setInterval(() => {
        fetchCongratulationsMessage();
    }, 5000);
    fetchCongratulationsMessage();
}

async function fetchCongratulationsMessage() {
    try {
        const response = await fetch(`${API_URL}/api/break-alerts`);
        const data = await response.json();
        
        if (data.success && data.alerts && data.alerts.length > 0) {
            const exceeded = data.alerts;
            let message = '';
            
            if (exceeded.length === 1) {
                const emp = exceeded[0];
                const typeLabel = emp.employee_type === 'local' ? 'Local' : 'Expat';
                message = `🎉 Congratulations ${emp.employee_name}! You have exceeded the allowed break time. (${typeLabel} Employee)`;
            } else {
                const names = exceeded.map(e => e.employee_name).join(', ');
                message = `🎉 Congratulations ${names}! You have exceeded the allowed break time.`;
            }
            
            showHomepageCongratulations(message);
        } else {
            hideCongratulationsBanner();
        }
    } catch (error) {
        console.error('❌ Error fetching congratulations message:', error);
    }
}

function showHomepageCongratulations(message) {
    let banner = document.getElementById('congratulationsBanner');
    
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'congratulationsBanner';
        banner.style.cssText = `
            background: linear-gradient(135deg, #fff3cd 0%, #ffe69b 100%);
            border-left: 6px solid #ffc107;
            border-radius: 12px;
            padding: 16px 24px;
            margin-bottom: 20px;
            box-shadow: 0 4px 20px rgba(255, 193, 7, 0.3);
            display: flex;
            align-items: center;
            gap: 12px;
            animation: slideDown 0.5s ease;
            position: relative;
        `;
        
        const alertDiv = document.getElementById('alert');
        if (alertDiv && alertDiv.parentNode) {
            alertDiv.parentNode.insertBefore(banner, alertDiv.nextSibling);
        }
    }
    
    banner.style.display = 'flex';
    banner.innerHTML = `
        <div style="font-size: 32px; flex-shrink: 0;">🎉</div>
        <div style="flex: 1;">
            <div style="font-size: 18px; font-weight: 700; color: #856404;">Congratulations!</div>
            <div style="font-size: 15px; color: #856404; font-weight: 500;">${message}</div>
            <div style="font-size: 12px; color: #856404; margin-top: 4px;">⚠️ You have exceeded your break limit. Please monitor your break time.</div>
        </div>
        <button onclick="hideCongratulationsBanner()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #856404; flex-shrink: 0;">
            <i class="fas fa-times"></i>
        </button>
    `;
}

function hideCongratulationsBanner() {
    const banner = document.getElementById('congratulationsBanner');
    if (banner) {
        banner.style.display = 'none';
    }
}

// =============================================
// BREAK ALERT FUNCTIONS
// =============================================

async function fetchBreakAlerts() {
    try {
        const response = await fetch(`${API_URL}/api/break-alerts`);
        const data = await response.json();
        
        if (data.success) {
            breakAlerts = data.alerts;
            displayBreakAlerts(data);
            return data;
        }
    } catch (error) {
        console.error('Error fetching break alerts:', error);
    }
}

function displayBreakAlerts(data) {
    const banner = document.getElementById('breakAlertBanner');
    const title = document.getElementById('alertTitle');
    const message = document.getElementById('alertMessage');
    const employeesList = document.getElementById('alertEmployeesList');
    
    if (!data.alerts || data.alerts.length === 0) {
        banner.style.display = 'none';
        return;
    }
    
    banner.style.display = 'block';
    
    const count = data.alerts.length;
    const exceedText = count === 1 ? 'employee has' : 'employees have';
    
    const localExceeded = data.alerts.filter(a => a.employee_type === 'local');
    const expatExceeded = data.alerts.filter(a => a.employee_type === 'expat');
    
    let typeText = '';
    if (localExceeded.length > 0 && expatExceeded.length > 0) {
        typeText = `(Local: ${localExceeded.length} | Expat: ${expatExceeded.length})`;
    } else if (localExceeded.length > 0) {
        typeText = `(Local: ${localExceeded.length})`;
    } else if (expatExceeded.length > 0) {
        typeText = `(Expat: ${expatExceeded.length})`;
    }
    
    title.textContent = `🎉 Congratulations! ${count} ${exceedText} exceeded their break limit ${typeText}`;
    message.textContent = `⚠️ These employees have exceeded their allowed break time. They can still take breaks, but please monitor their usage.`;
    
    employeesList.innerHTML = '';
    data.alerts.forEach(alert => {
        const card = document.createElement('div');
        const isLocal = alert.employee_type === 'local';
        const typeIcon = isLocal ? '🇱🇰' : '🌍';
        const exceededMinutes = alert.exceeded_minutes || 0;
        
        card.style.cssText = `
            background: white;
            padding: 8px 16px;
            border-radius: 20px;
            border: 2px solid ${isLocal ? '#28a745' : '#dc3545'};
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            font-weight: 600;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            cursor: pointer;
            transition: all 0.3s;
        `;
        
        card.onmouseenter = function() {
            this.style.transform = 'scale(1.03)';
            this.style.boxShadow = '0 4px 15px rgba(0,0,0,0.15)';
        };
        card.onmouseleave = function() {
            this.style.transform = 'scale(1)';
            this.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
        };
        
        card.innerHTML = `
            <span>${typeIcon}</span>
            <strong>${alert.employee_name}</strong>
            <span style="font-size:11px; color:#888;">${alert.department}</span>
            <span style="font-size:11px; background:#f8f9fa; padding:2px 10px; border-radius:12px;">
                ⏱️ ${alert.used} / ${alert.allowance}
            </span>
            <span style="font-size:11px; color:#dc3545; font-weight:700;">
                🔥 +${exceededMinutes}min
            </span>
            <span style="font-size:11px; color:#ff6b00; font-weight:700;">
                🎉 Exceeded!
            </span>
            <button onclick="event.stopPropagation(); selectEmployeeFromAlert('${alert.employee_name}')" 
                    style="background:#1a73e8; color:white; border:none; border-radius:12px; padding:2px 12px; font-size:11px; cursor:pointer;">
                View
            </button>
        `;
        
        card.onclick = function(e) {
            if (!e.target.closest('button')) {
                selectEmployeeFromAlert(alert.employee_name);
            }
        };
        
        employeesList.appendChild(card);
    });
}

function selectEmployeeFromAlert(employeeName) {
    const select = document.getElementById('employeeSelect');
    for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].value === employeeName) {
            select.selectedIndex = i;
            onEmployeeChange();
            showAlert(`✅ Selected: ${employeeName}`, 'success');
            break;
        }
    }
}

function closeBreakAlert() {
    document.getElementById('breakAlertBanner').style.display = 'none';
}

function initBreakAlerts() {
    fetchBreakAlerts();
    if (alertInterval) clearInterval(alertInterval);
    alertInterval = setInterval(() => {
        fetchBreakAlerts();
    }, 30000);
}

// =============================================
// BREAK FUNCTIONS
// =============================================

async function onEmployeeChange() {
    const select = document.getElementById('employeeSelect');
    const employeeName = select.value;
    
    if (!employeeName) {
        document.getElementById('selectedEmployeeDisplay').value = 'None selected';
        document.getElementById('statusDisplay').innerHTML = '🟢 Status: <strong style="color:#28a745;">Available</strong>';
        document.getElementById('statusDisplay').style.background = '#e8f5e9';
        document.getElementById('statusDisplay').style.border = 'none';
        document.getElementById('employeeNameTitle').textContent = 'Select an employee';
        return;
    }

    currentEmployee = employeeName;
    document.getElementById('selectedEmployeeDisplay').value = employeeName;
    document.getElementById('employeeNameTitle').textContent = employeeName;

    await loadEmployeeBreaks(employeeName);
    await updateBreakStatus(employeeName);
}

async function updateBreakStatus(employeeName) {
    try {
        const response = await fetch(`${API_URL}/api/break-status/${encodeURIComponent(employeeName)}`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch break status');
        }
        
        const data = await response.json();
        
        const statusDisplay = document.getElementById('statusDisplay');
        const breakOutBtn = document.getElementById('breakOutBtn');
        const breakInBtn = document.getElementById('breakInBtn');
        
        if (!data) {
            statusDisplay.innerHTML = 'Status: Unknown';
            return;
        }
        
        // ALWAYS show Status: Available (green)
        statusDisplay.innerHTML = '🟢 Status: <strong style="color:#28a745;">Available</strong>';
        statusDisplay.style.background = '#e8f5e9';
        statusDisplay.style.border = 'none';
        statusDisplay.style.padding = '10px 16px';
        statusDisplay.style.borderRadius = '10px';
        
        // Manage buttons
        if (data.is_on_break) {
            breakOutBtn.disabled = true;
            breakOutBtn.style.opacity = '0.5';
            breakInBtn.disabled = false;
            breakInBtn.style.opacity = '1';
        } else {
            breakOutBtn.disabled = false;
            breakOutBtn.style.opacity = '1';
            breakInBtn.disabled = true;
            breakInBtn.style.opacity = '0.5';
        }
        
        // REMOVE Break Limit Card from stats
        const statsDiv = document.getElementById('stats');
        if (statsDiv) {
            const limitCard = statsDiv.querySelector('.stat-card.limit-card');
            if (limitCard) {
                limitCard.remove();
            }
        }
        
        return data;
    } catch (error) {
        console.error('Error updating break status:', error);
        const statusDisplay = document.getElementById('statusDisplay');
        statusDisplay.innerHTML = '❌ Status: <strong style="color:#dc3545;">Error</strong>';
        statusDisplay.style.background = '#f8d7da';
    }
}

// =============================================
// LOAD EMPLOYEE BREAKS WITH TOTAL TIME
// =============================================

async function loadEmployeeBreaks(employeeName) {
    const tbody = document.getElementById('breakBody');
    const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'sub-admin');
    
    if (!employeeName) {
        tbody.innerHTML = '<tr><td colspan="9" class="no-data">Please select an employee</td></tr>';
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/breaks/${encodeURIComponent(employeeName)}`);
        const data = await response.json();

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="no-data">No breaks found. Click "Break" to start!</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        let currentDate = '';
        let totalDuration = 0;
        
        data.forEach(row => {
            const tr = document.createElement('tr');
            if (row.is_active) tr.className = 'active-break';
            
            // Calculate duration in minutes for total
            if (row["Duration"] !== '--:--' && row["Duration"] !== 'Active') {
                const durParts = row["Duration"].split(':');
                totalDuration += parseInt(durParts[0]) * 60 + parseInt(durParts[1]);
            }

            const statusBadge = row.is_active ?
                '<span class="badge badge-warning">⏳ On Break</span>' :
                '<span class="badge badge-success">✅ Completed</span>';
            
            const typeIcon = row.employee_type === 'local' ? '🇱🇰' : '🌍';

            const deleteButton = isAdmin ? `
                <button class="btn btn-danger btn-sm" onclick="deleteBreak(${row.break_id})">
                    <i class="fas fa-trash"></i>
                </button>
            ` : `<span style="color:#888; font-size:11px;">-</span>`;

            tr.innerHTML = `
                <td><strong>${row.date}</strong></td>
                <td>${row.employee_name || employeeName}</td>
                <td>${row.department || '-'}</td>
                <td>${typeIcon}</td>
                <td>${row["Break"]}</td>
                <td>${row["IN"]}</td>
                <td>${row["Duration"]}</td>
                <td>${statusBadge}</td>
                <td>${deleteButton}</td>
            `;
            tbody.appendChild(tr);
        });
        
        // Add total row
        if (totalDuration > 0) {
            const totalTime = minutesToTime(totalDuration);
            const totalRow = document.createElement('tr');
            totalRow.className = 'total-row';
            totalRow.style.background = '#e9ecef';
            totalRow.innerHTML = `
                <td colspan="8" style="text-align:right; font-weight:700; background:#e9ecef; padding:10px 14px;">
                    <i class="fas fa-clock"></i> Total Break Time:
                </td>
                <td colspan="1" style="font-weight:700; background:#e9ecef; color:#1a73e8; padding:10px 14px;">
                    ${totalTime}
                </td>
            `;
            tbody.appendChild(totalRow);
        }
    } catch (error) {
        console.error('Error loading breaks:', error);
        tbody.innerHTML = '<tr><td colspan="9" class="no-data">Error loading breaks</td></tr>';
    }
}

function minutesToTime(minutes) {
    if (typeof minutes !== 'number' || isNaN(minutes) || minutes < 0) {
        return '00:00';
    }
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

async function loadActiveBreaks() {
    try {
        const response = await fetch(`${API_URL}/api/active-breaks`);
        const data = await response.json();

        const container = document.getElementById('activeBreaksList');
        const badge = document.getElementById('activeCountBadge');
        const countSpan = document.getElementById('activeCount');
        const currentBreakCount = document.getElementById('currentBreakCount');
        const headerActiveCount = document.getElementById('headerActiveCount');

        const count = data ? data.length : 0;
        
        if (badge) badge.innerHTML = `<i class="fas fa-users"></i> ${count} Active`;
        if (headerActiveCount) headerActiveCount.textContent = count;
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
            
            div.onclick = function() {
                selectEmployee(person.employee_name);
            };
            
            div.innerHTML = `
                <span class="dot"></span>
                <strong>${person.employee_name}</strong>
                <span style="font-size:10px; background:#e9ecef; padding:1px 8px; border-radius:10px;">${person.department || 'N/A'}</span>
                <span style="font-size:10px;">${typeIcon}</span>
                <span style="font-size:11px; color:#888;">since ${person.break_out}</span>
                <span style="font-size:10px; color:#1a73e8; margin-left:4px;">
                    <i class="fas fa-chevron-right"></i>
                </span>
            `;
            container.appendChild(div);
        });
    } catch (error) {
        console.error('Error loading active breaks:', error);
    }
}

function selectEmployee(employeeName) {
    const select = document.getElementById('employeeSelect');
    for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].value === employeeName) {
            select.selectedIndex = i;
            onEmployeeChange();
            showAlert(`✅ Selected: ${employeeName}`, 'success');
            break;
        }
    }
}

async function breakOut() {
    const employeeName = document.getElementById('employeeSelect').value;
    if (!employeeName) {
        showAlert('Please select an employee first!', 'error');
        return;
    }

    const now = new Date();
    const options = {
        timeZone: 'Africa/Lusaka',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    };
    const breakOut = now.toLocaleTimeString('en-US', options);
    const breakDate = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Lusaka' });

    try {
        const response = await fetch(`${API_URL}/api/break-out`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employeeName, breakDate, breakOut })
        });

        const result = await response.json();

        if (response.ok) {
            showAlert(result.message, result.is_exceeded ? 'warning' : 'success');
            await refreshData();
            await loadActiveBreaks();
            await fetchBreakAlerts();
            await fetchCongratulationsMessage();
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
    const options = {
        timeZone: 'Africa/Lusaka',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    };
    const breakIn = now.toLocaleTimeString('en-US', options);
    const breakDate = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Lusaka' });

    try {
        const response = await fetch(`${API_URL}/api/break-in`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employeeName, breakDate, breakIn })
        });

        const result = await response.json();

        if (response.ok) {
            showAlert(result.message, 'success');
            await refreshData();
            await loadActiveBreaks();
            await fetchBreakAlerts();
            await fetchCongratulationsMessage();
        } else {
            showAlert('❌ ' + result.error, 'error');
        }
    } catch (error) {
        showAlert('❌ Error connecting to server', 'error');
    }
}

async function deleteBreak(id) {
    if (currentUser && currentUser.role !== 'admin') {
        showAlert('❌ Only Admin can delete break records!', 'error');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this break?')) return;
    try {
        const response = await fetch(`${API_URL}/api/breaks/${id}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            showAlert('✅ Break deleted successfully!', 'success');
            await refreshData();
            await loadActiveBreaks();
            await fetchBreakAlerts();
            await fetchCongratulationsMessage();
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
        let url = `${API_URL}/api/break-report`;
        if (currentUser && currentUser.role === 'user') {
            url += `?employeeName=${encodeURIComponent(currentUser.username)}`;
        }
        
        const response = await fetch(url);
        let data = await response.json();
        
        if (currentUser && currentUser.role === 'user') {
            data = data.filter(row => row.employee_name === currentUser.username);
        }
        
        const tbody = document.getElementById('reportBody');
        if (!data || data.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 40px; color: #adb5bd; font-size: 14px;">
                        <i class="fas fa-inbox" style="font-size: 28px; display: block; margin-bottom: 10px; color: #ddd;"></i>
                        No breaks found
                    </td>
                </tr>
            `;
            updateReportStats([]);
            return;
        }

        tbody.innerHTML = '';
        let totalDuration = 0;
        let localCount = 0;
        let expatCount = 0;
        
        data.forEach(row => {
            const tr = document.createElement('tr');
            const statusBadge = row.status === 'On Break' ?
                '<span class="badge badge-warning">🔴 On Break</span>' :
                '<span class="badge badge-success">✅ Completed</span>';
            
            const typeIcon = row.employee_type === 'local' ? '🇱🇰 Local' : '🌍 Expat';
            
            if (row.employee_type === 'local') localCount++;
            else if (row.employee_type === 'expat') expatCount++;
            
            // Calculate total duration
            if (row.duration !== 'In Progress' && row.duration !== 'Active') {
                const durParts = row.duration.split(':');
                if (durParts.length >= 2) {
                    totalDuration += parseInt(durParts[0]) * 60 + parseInt(durParts[1]);
                }
            }
            
            tr.innerHTML = `
                <td><strong>${row.break_date}</strong></td>
                <td><strong>${row.employee_name}</strong></td>
                <td>${row.department || '-'}</td>
                <td>${typeIcon}</td>
                <td>${row.break_out}</td>
                <td>${row.break_in}</td>
                <td style="font-weight:600;">${row.duration}</td>
                <td>${statusBadge}</td>
            `;
            
            if (row.status === 'On Break') {
                tr.style.background = '#fff8e1';
            }
            
            tbody.appendChild(tr);
        });
        
        // Add total row
        if (totalDuration > 0) {
            const totalTime = minutesToTime(totalDuration);
            const totalRow = document.createElement('tr');
            totalRow.className = 'total-row';
            totalRow.style.background = '#e9ecef';
            totalRow.innerHTML = `
                <td colspan="7" style="text-align:right; font-weight:700; background:#e9ecef; padding:10px 14px;">
                    <i class="fas fa-clock"></i> <strong>Total Break Time:</strong>
                </td>
                <td colspan="1" style="font-weight:700; background:#e9ecef; color:#1a73e8; padding:10px 14px;">
                    ${totalTime}
                </td>
            `;
            tbody.appendChild(totalRow);
        }
        
        updateReportStats(data, localCount, expatCount);
    } catch (error) {
        console.error('Error loading report:', error);
        document.getElementById('reportBody').innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: #dc3545; font-size: 14px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 28px; display: block; margin-bottom: 10px;"></i>
                    Error loading report
                </td>
            </tr>
        `;
    }
}

function updateReportStats(data, localCount, expatCount) {
    const total = data ? data.length : 0;
    const completed = data ? data.filter(row => row.status === 'Completed').length : 0;
    const active = data ? data.filter(row => row.status === 'On Break').length : 0;
    
    document.getElementById('reportTotalRecords').textContent = total;
    document.getElementById('reportCompletedCount').textContent = completed;
    document.getElementById('reportActiveCount').textContent = active;
    document.getElementById('reportLocalCount').textContent = localCount || 0;
    document.getElementById('reportExpatCount').textContent = expatCount || 0;
}

function applyReportFilters() {
    const employeeFilter = document.getElementById('reportEmployeeFilter').value;
    const dateFrom = document.getElementById('reportDateFrom').value;
    const dateTo = document.getElementById('reportDateTo').value;
    const typeFilter = document.getElementById('reportTypeFilter').value;
    const statusFilter = document.getElementById('reportStatusFilter').value;
    
    const rows = document.querySelectorAll('#reportBody tr');
    let visibleCount = 0;
    let completedCount = 0;
    let activeCount = 0;
    let localCount = 0;
    let expatCount = 0;
    
    rows.forEach(row => {
        if (row.classList.contains('total-row')) {
            row.style.display = 'none';
            return;
        }
        const cells = row.querySelectorAll('td');
        if (cells.length < 8) return;
        
        let show = true;
        const rowEmployee = cells[1]?.textContent?.trim() || '';
        const rowDate = cells[0]?.textContent?.trim() || '';
        const rowType = cells[3]?.textContent?.trim() || '';
        const rowStatus = cells[7]?.textContent?.trim() || '';
        
        if (currentUser && currentUser.role === 'user') {
            if (rowEmployee !== currentUser.username) show = false;
        }
        
        if (employeeFilter && rowEmployee !== employeeFilter) show = false;
        
        if (dateFrom && rowDate) {
            const rowDateObj = new Date(rowDate);
            const fromDateObj = new Date(dateFrom);
            if (rowDateObj < fromDateObj) show = false;
        }
        
        if (dateTo && rowDate) {
            const rowDateObj = new Date(rowDate);
            const toDateObj = new Date(dateTo);
            toDateObj.setHours(23, 59, 59);
            if (rowDateObj > toDateObj) show = false;
        }
        
        if (typeFilter && typeFilter !== 'all') {
            const typeText = rowType.includes('Local') ? 'local' : 'expat';
            if (typeText !== typeFilter) show = false;
        }
        
        if (statusFilter) {
            const statusText = rowStatus.includes('Completed') ? 'Completed' : 'On Break';
            if (statusText !== statusFilter) show = false;
        }
        
        row.style.display = show ? '' : 'none';
        
        if (show) {
            visibleCount++;
            if (rowStatus.includes('Completed')) completedCount++;
            else if (rowStatus.includes('On Break')) activeCount++;
            if (rowType.includes('Local')) localCount++;
            else if (rowType.includes('Expat')) expatCount++;
        }
    });
    
    document.getElementById('reportTotalRecords').textContent = visibleCount;
    document.getElementById('reportCompletedCount').textContent = completedCount;
    document.getElementById('reportActiveCount').textContent = activeCount;
    document.getElementById('reportLocalCount').textContent = localCount;
    document.getElementById('reportExpatCount').textContent = expatCount;
    
    showAlert(`✅ Filter applied: ${visibleCount} records found`, 'success');
}

function resetReportFilters() {
    document.getElementById('reportEmployeeFilter').value = '';
    document.getElementById('reportDateFrom').value = '';
    document.getElementById('reportDateTo').value = '';
    document.getElementById('reportTypeFilter').value = 'all';
    document.getElementById('reportStatusFilter').value = '';
    
    const rows = document.querySelectorAll('#reportBody tr');
    let totalCount = 0;
    let completedCount = 0;
    let activeCount = 0;
    let localCount = 0;
    let expatCount = 0;
    
    rows.forEach(row => {
        if (row.classList.contains('total-row')) {
            row.style.display = '';
            return;
        }
        const cells = row.querySelectorAll('td');
        if (cells.length < 8) return;
        
        let show = true;
        if (currentUser && currentUser.role === 'user') {
            const rowEmployee = cells[1]?.textContent?.trim() || '';
            if (rowEmployee !== currentUser.username) show = false;
        }
        
        row.style.display = show ? '' : 'none';
        
        if (show) {
            totalCount++;
            const statusText = cells[7]?.textContent?.trim() || '';
            const typeText = cells[3]?.textContent?.trim() || '';
            if (statusText.includes('Completed')) completedCount++;
            else if (statusText.includes('On Break')) activeCount++;
            if (typeText.includes('Local')) localCount++;
            else if (typeText.includes('Expat')) expatCount++;
        }
    });
    
    document.getElementById('reportTotalRecords').textContent = totalCount;
    document.getElementById('reportCompletedCount').textContent = completedCount;
    document.getElementById('reportActiveCount').textContent = activeCount;
    document.getElementById('reportLocalCount').textContent = localCount;
    document.getElementById('reportExpatCount').textContent = expatCount;
    
    showAlert('✅ Filters reset', 'success');
}

function exportReport() {
    const rows = document.querySelectorAll('#reportBody tr');
    let csv = 'Date,Employee,Department,Type,Break Out,Break In,Duration,Status\n';
    let count = 0;
    
    rows.forEach(row => {
        if (row.style.display === 'none' || row.classList.contains('total-row')) return;
        const cells = row.querySelectorAll('td');
        if (cells.length < 8) return;
        
        count++;
        const date = cells[0]?.textContent?.trim() || '';
        const employee = cells[1]?.textContent?.trim() || '';
        const department = cells[2]?.textContent?.trim() || '';
        const type = cells[3]?.textContent?.trim() || '';
        const breakOut = cells[4]?.textContent?.trim() || '';
        const breakIn = cells[5]?.textContent?.trim() || '';
        const duration = cells[6]?.textContent?.trim() || '';
        const status = cells[7]?.textContent?.trim() || '';
        
        csv += `${date},${employee},${department},${type},${breakOut},${breakIn},${duration},${status}\n`;
    });
    
    if (count === 0) {
        showAlert('❌ No data to export!', 'error');
        return;
    }
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `break-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    showAlert(`✅ ${count} records exported successfully!`, 'success');
}

function exportReportPDF() {
    const rows = document.querySelectorAll('#reportBody tr');
    let visibleCount = 0;
    
    rows.forEach(row => {
        if (row.style.display !== 'none' && !row.classList.contains('total-row')) {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 8) visibleCount++;
        }
    });
    
    if (visibleCount === 0) {
        showAlert('❌ No data to export!', 'error');
        return;
    }
    
    const printWindow = window.open('', '_blank');
    const date = new Date().toLocaleString('en-US', { timeZone: 'Africa/Lusaka' });
    
    let tableRows = '';
    rows.forEach(row => {
        if (row.style.display === 'none' || row.classList.contains('total-row')) return;
        const cells = row.querySelectorAll('td');
        if (cells.length < 8) return;
        
        const statusColor = cells[7]?.textContent?.includes('On Break') ? '#dc3545' : '#28a745';
        tableRows += `
            <tr>
                <td style="padding:8px 10px; border-bottom:1px solid #ddd;">${cells[0]?.textContent?.trim() || ''}</td>
                <td style="padding:8px 10px; border-bottom:1px solid #ddd;">${cells[1]?.textContent?.trim() || ''}</td>
                <td style="padding:8px 10px; border-bottom:1px solid #ddd;">${cells[2]?.textContent?.trim() || ''}</td>
                <td style="padding:8px 10px; border-bottom:1px solid #ddd;">${cells[3]?.textContent?.trim() || ''}</td>
                <td style="padding:8px 10px; border-bottom:1px solid #ddd;">${cells[4]?.textContent?.trim() || ''}</td>
                <td style="padding:8px 10px; border-bottom:1px solid #ddd;">${cells[5]?.textContent?.trim() || ''}</td>
                <td style="padding:8px 10px; border-bottom:1px solid #ddd; font-weight:600;">${cells[6]?.textContent?.trim() || ''}</td>
                <td style="padding:8px 10px; border-bottom:1px solid #ddd; color:${statusColor}; font-weight:bold;">${cells[7]?.textContent?.trim() || ''}</td>
            </tr>
        `;
    });
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Break Report - ${new Date().toISOString().split('T')[0]}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 30px; }
                h1 { color: #1a73e8; border-bottom: 3px solid #1a73e8; padding-bottom: 10px; font-size: 22px; }
                .subtitle { color: #666; font-size: 13px; margin-bottom: 15px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
                th { background: #1a2332; color: white; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; }
                td { padding: 8px 12px; border-bottom: 1px solid #ddd; }
                tr:nth-child(even) { background: #f8f9fa; }
                .summary { margin: 15px 0; padding: 12px 16px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #1a73e8; }
                .footer { margin-top: 25px; text-align: center; color: #888; font-size: 12px; border-top: 1px solid #ddd; padding-top: 12px; }
                .no-print { display: none; }
                @media print { .no-print { display: none; } body { padding: 10px; } }
            </style>
        </head>
        <body>
            <h1>📊 Complete Break Report</h1>
            <div class="subtitle">Generated: ${date}</div>
            <div class="summary">
                <strong>Summary:</strong> 
                Total Records: ${document.getElementById('reportTotalRecords')?.textContent || 0} | 
                Completed: ${document.getElementById('reportCompletedCount')?.textContent || 0} | 
                On Break: ${document.getElementById('reportActiveCount')?.textContent || 0}
                🌍 Expat: ${document.getElementById('reportExpatCount')?.textContent || 0} | 
                🇱🇰 Local: ${document.getElementById('reportLocalCount')?.textContent || 0}
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Date</th><th>Employee</th><th>Department</th>
                        <th>Type</th><th>Break Out</th><th>Break In</th>
                        <th>Duration</th><th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
            <div class="footer">&copy; ${new Date().getFullYear()} Break Tracker Pro - All Rights Reserved</div>
            <div class="no-print" style="margin-top:20px; text-align:center;">
                <button onclick="window.print()" style="padding:10px 28px; background:#1a73e8; color:white; border:none; border-radius:5px; cursor:pointer; font-size:14px;">🖨️ Print / Save as PDF</button>
                <button onclick="window.close()" style="padding:10px 28px; background:#6c757d; color:white; border:none; border-radius:5px; cursor:pointer; font-size:14px; margin-left:10px;">❌ Close</button>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
    showAlert(`✅ ${visibleCount} records exported to PDF!`, 'success');
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
    alertDiv.className = 'alert';
    
    if (type === 'success') {
        alertDiv.classList.add('alert-success');
        alertDiv.style.display = 'block';
    } else if (type === 'error') {
        alertDiv.classList.add('alert-error');
        alertDiv.style.display = 'block';
    } else if (type === 'warning') {
        alertDiv.style.background = '#fff3cd';
        alertDiv.style.color = '#856404';
        alertDiv.style.border = '1px solid #ffc107';
        alertDiv.style.display = 'block';
        alertDiv.className = 'alert';
        alertDiv.classList.add('alert-warning');
    } else {
        alertDiv.style.display = 'block';
    }
    
    setTimeout(() => {
        alertDiv.className = 'alert';
        alertDiv.style.display = 'none';
    }, 6000);
}
