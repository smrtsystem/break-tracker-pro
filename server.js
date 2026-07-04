const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Serve login.html at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// =============================================
// DATABASE CONNECTION
// =============================================

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set!');
    process.exit(1);
}

const cleanUrl = DATABASE_URL.trim().replace(/^"|"$/g, '').replace(/\s/g, '');

console.log('📦 Connecting to database...');

const pool = new Pool({
    connectionString: cleanUrl,
    ssl: {
        rejectUnauthorized: false,
        require: true
    },
    connectionTimeoutMillis: 10000,
    max: 20,
});

// =============================================
// AUTO-MIGRATION: Fix Database Schema on Startup
// =============================================

async function runAutoMigration() {
    const client = await pool.connect();
    try {
        console.log('🔧 Checking database schema...');
        
        // 1. Create departments table
        await client.query(`
            CREATE TABLE IF NOT EXISTS departments (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Departments table ready');

        // 2. Insert default departments
        await client.query(`
            INSERT INTO departments (name) VALUES 
                ('Betrealated'),
                ('Banking'),
                ('CS'),
                ('Checking')
            ON CONFLICT (name) DO NOTHING
        `);
        console.log('✅ Default departments inserted');

        // 3. Check and add department_id column to employees
        const deptColCheck = await client.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'employees' AND column_name = 'department_id'
        `);
        
        if (deptColCheck.rows.length === 0) {
            console.log('🔧 Adding department_id column...');
            await client.query(`
                ALTER TABLE employees ADD COLUMN department_id INTEGER;
                ALTER TABLE employees 
                ADD CONSTRAINT fk_employee_department 
                FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
            `);
            
            await client.query(`
                UPDATE employees 
                SET department_id = (SELECT id FROM departments WHERE name = 'Betrealated' LIMIT 1)
                WHERE department_id IS NULL;
                ALTER TABLE employees ALTER COLUMN department_id SET NOT NULL;
            `);
            console.log('✅ department_id column added');
        }

        // 4. Check and add employee_type column
        const typeColCheck = await client.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'employees' AND column_name = 'employee_type'
        `);
        
        if (typeColCheck.rows.length === 0) {
            console.log('🔧 Adding employee_type column...');
            await client.query(`
                ALTER TABLE employees ADD COLUMN employee_type VARCHAR(20) DEFAULT 'local';
                ALTER TABLE employees 
                ADD CONSTRAINT chk_employee_type 
                CHECK (employee_type IN ('local', 'expat'));
                UPDATE employees SET employee_type = 'local' WHERE employee_type IS NULL;
            `);
            console.log('✅ employee_type column added');
        }

        // 5. Check and add can_manage_users column to users
        const manageColCheck = await client.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'can_manage_users'
        `);
        
        if (manageColCheck.rows.length === 0) {
            console.log('🔧 Adding can_manage_users column...');
            await client.query(`
                ALTER TABLE users ADD COLUMN can_manage_users BOOLEAN DEFAULT FALSE;
                UPDATE users SET can_manage_users = FALSE WHERE can_manage_users IS NULL;
            `);
            console.log('✅ can_manage_users column added');
        }

        // 6. Ensure admin user exists
        await client.query(`
            INSERT INTO users (username, password, role, can_manage_users) 
            VALUES ('admin', '535680', 'admin', TRUE)
            ON CONFLICT (username) DO UPDATE 
            SET password = '535680', role = 'admin', can_manage_users = TRUE
        `);
        console.log('✅ Admin user verified');

        // 7. Insert sample employees by department with types
        const empCount = await client.query('SELECT COUNT(*) FROM employees');
        if (parseInt(empCount.rows[0].count) === 0) {
            console.log('🔧 Inserting sample employees...');
            
            const depts = await client.query('SELECT id, name FROM departments');
            const deptMap = {};
            depts.rows.forEach(d => { deptMap[d.name] = d.id; });

            const sampleEmployees = [
                // ===== Betrealated Department =====
                { name: 'ABRAHAM SIMANWA', dept: 'Betrealated', type: 'local' },
                { name: 'CATHERINE NGOSA', dept: 'Betrealated', type: 'local' },
                { name: 'COMFORT MITTI', dept: 'Betrealated', type: 'local' },
                { name: 'DAGROUS GOMA', dept: 'Betrealated', type: 'local' },
                { name: 'CHRISTINE NYIRONGO', dept: 'Betrealated', type: 'local' },
                { name: 'CHONGO KABWE', dept: 'Betrealated', type: 'local' },
                { name: 'CHIPIO SITONDO', dept: 'Betrealated', type: 'local' },
                { name: 'DEXTER NSWANA', dept: 'Betrealated', type: 'local' },
                { name: 'JOHN SMITH', dept: 'Betrealated', type: 'expat' },
                { name: 'MICHAEL BROWN', dept: 'Betrealated', type: 'expat' },
                { name: 'ROBERT TAYLOR', dept: 'Betrealated', type: 'expat' },
                
                // ===== Banking Department =====
                { name: 'ARUNAVA HAZRA', dept: 'Banking', type: 'local' },
                { name: 'ASHISH MUSHLAM', dept: 'Banking', type: 'local' },
                { name: 'AYUSH GUPTA', dept: 'Banking', type: 'local' },
                { name: 'PRIYA PATEL', dept: 'Banking', type: 'local' },
                { name: 'RAJESH SHARMA', dept: 'Banking', type: 'local' },
                { name: 'DAVID WILSON', dept: 'Banking', type: 'expat' },
                { name: 'SARAH JOHNSON', dept: 'Banking', type: 'expat' },
                
                // ===== CS Department =====
                { name: 'VIKRAM SINGH', dept: 'CS', type: 'local' },
                { name: 'ANANYA GUPTA', dept: 'CS', type: 'local' },
                { name: 'SOUVIK NAG', dept: 'CS', type: 'local' },
                { name: 'CHANDAN GUPTA', dept: 'CS', type: 'local' },
                { name: 'JAMES ANDERSON', dept: 'CS', type: 'expat' },
                { name: 'MARY WILLIAMS', dept: 'CS', type: 'expat' },
                
                // ===== Checking Department =====
                { name: 'DEEPAK VERMA', dept: 'Checking', type: 'local' },
                { name: 'KAVITA NAIR', dept: 'Checking', type: 'local' },
                { name: 'LOKENDER SINGH', dept: 'Checking', type: 'local' },
                { name: 'PUSHKAR KATHIK', dept: 'Checking', type: 'local' },
                { name: 'PETER JONES', dept: 'Checking', type: 'expat' },
                { name: 'LISA MARTINEZ', dept: 'Checking', type: 'expat' },
            ];

            for (const emp of sampleEmployees) {
                const deptId = deptMap[emp.dept];
                if (deptId) {
                    await client.query(
                        `INSERT INTO employees (name, department_id, employee_type) 
                         VALUES ($1, $2, $3) ON CONFLICT (name, department_id) DO NOTHING`,
                        [emp.name, deptId, emp.type]
                    );
                }
            }
            console.log('✅ Sample employees inserted with departments and types');
        }

        // 8. Create indexes for performance
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);
            CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);
            CREATE INDEX IF NOT EXISTS idx_employees_type ON employees(employee_type);
        `);

        console.log('✅ Database migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration error:', error.message);
    } finally {
        client.release();
    }
}

// =============================================
// CONNECT AND MIGRATE DATABASE
// =============================================

async function connectDB() {
    let retries = 5;
    while (retries > 0) {
        try {
            const client = await pool.connect();
            console.log('✅ Connected to PostgreSQL successfully!');
            
            await runAutoMigration();
            
            client.release();
            return;
        } catch (err) {
            console.log(`❌ Database connection failed. Retries left: ${retries - 1}`);
            console.log(`Error: ${err.message}`);
            retries--;
            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }
    console.log('❌ Could not connect to database after multiple retries');
}

connectDB();

// =============================================
// TEST ROUTES
// =============================================

app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Server is running!',
        timestamp: new Date().toISOString()
    });
});

app.get('/api/db-test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() as current_time');
        res.json({
            success: true,
            message: 'Database connected!',
            time: result.rows[0].current_time
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =============================================
// DEPARTMENT ROUTES
// =============================================

// Get all departments
app.get('/api/departments', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM departments ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add department
app.post('/api/departments', async (req, res) => {
    const { name } = req.body;
    try {
        await pool.query('INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
        res.json({ success: true, message: `Department "${name}" added!` });
    } catch (error) {
        console.error('Error adding department:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete department
app.delete('/api/departments/:name', async (req, res) => {
    const { name } = req.params;
    try {
        const deptResult = await pool.query('SELECT id FROM departments WHERE name = $1', [name]);
        if (deptResult.rows.length > 0) {
            const deptId = deptResult.rows[0].id;
            await pool.query('DELETE FROM employees WHERE department_id = $1', [deptId]);
            await pool.query('DELETE FROM departments WHERE id = $1', [deptId]);
        }
        res.json({ success: true, message: `Department "${name}" deleted!` });
    } catch (error) {
        console.error('Error deleting department:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// AUTHENTICATION ROUTES
// =============================================

// Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    console.log('🔐 Login attempt:', username);
    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1 AND password = $2',
            [username, password]
        );
        if (result.rows.length > 0) {
            const user = result.rows[0];
            console.log('✅ Login successful:', username);
            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    can_manage_users: user.can_manage_users
                }
            });
        } else {
            console.log('❌ Login failed:', username);
            res.status(401).json({ 
                success: false, 
                message: 'Invalid username or password' 
            });
        }
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error: ' + error.message 
        });
    }
});

// Get all users
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, role, can_manage_users, created_at FROM users ORDER BY username'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add new user
app.post('/api/users', async (req, res) => {
    const { username, password, role, can_manage_users } = req.body;
    try {
        // Check if employee exists with this name
        const employeeCheck = await pool.query(
            'SELECT id FROM employees WHERE name = $1',
            [username]
        );
        
        if (employeeCheck.rows.length === 0) {
            return res.status(400).json({ 
                error: 'Employee not found! Please add employee first.' 
            });
        }
        
        const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        const result = await pool.query(
            `INSERT INTO users (username, password, role, can_manage_users) 
             VALUES ($1, $2, $3, $4) RETURNING id, username, role, can_manage_users`,
            [username, password || 'user123', role || 'user', can_manage_users || false]
        );
        res.json({ 
            success: true, 
            user: result.rows[0],
            message: `User "${username}" added successfully!`
        });
    } catch (error) {
        console.error('Error adding user:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update username
app.put('/api/users/:oldUsername/username', async (req, res) => {
    const { oldUsername } = req.params;
    const { newUsername } = req.body;
    try {
        if (oldUsername === 'admin') {
            return res.status(400).json({ error: 'Cannot rename main admin user' });
        }
        const existing = await pool.query('SELECT id FROM users WHERE username = $1', [newUsername]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        await pool.query('UPDATE users SET username = $1 WHERE username = $2', [newUsername, oldUsername]);
        res.json({ success: true, message: `Username updated successfully!` });
    } catch (error) {
        console.error('Error updating username:', error);
        res.status(500).json({ error: error.message });
    }
});

// Reset password
app.put('/api/users/:username/password', async (req, res) => {
    const { username } = req.params;
    const { newPassword, currentUser } = req.body;
    try {
        if (currentUser && currentUser.role !== 'admin' && !currentUser.can_manage_users && currentUser.username !== username) {
            return res.status(403).json({ error: 'You do not have permission to reset passwords' });
        }
        await pool.query('UPDATE users SET password = $1 WHERE username = $2', [newPassword, username]);
        res.json({ success: true, message: `Password updated for "${username}"` });
    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update user role & permissions
app.put('/api/users/:username', async (req, res) => {
    const { username } = req.params;
    const { role, can_manage_users } = req.body;
    try {
        if (username === 'admin') {
            return res.status(400).json({ error: 'Cannot change main admin' });
        }
        await pool.query(
            'UPDATE users SET role = $1, can_manage_users = $2 WHERE username = $3',
            [role, can_manage_users || false, username]
        );
        res.json({ success: true, message: 'User updated successfully!' });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete user
app.delete('/api/users/:username', async (req, res) => {
    const { username } = req.params;
    try {
        if (username === 'admin') {
            return res.status(400).json({ error: 'Cannot delete main admin user' });
        }
        await pool.query('DELETE FROM users WHERE username = $1', [username]);
        res.json({ success: true, message: 'User deleted successfully!' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// EMPLOYEE ROUTES
// =============================================

// Get all employees with department and type
app.get('/api/employees', async (req, res) => {
    try {
        const query = `
            SELECT 
                e.id,
                e.name,
                e.employee_type,
                d.name as department,
                d.id as department_id,
                e.created_at
            FROM employees e
            JOIN departments d ON e.department_id = d.id
            ORDER BY d.name, e.employee_type DESC, e.name ASC
        `;
        const result = await pool.query(query);
        console.log('✅ Employees fetched:', result.rows.length);
        res.json(result.rows);
    } catch (error) {
        console.error('Error in /api/employees:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get employees by department
app.get('/api/employees/department/:deptName', async (req, res) => {
    const { deptName } = req.params;
    try {
        const query = `
            SELECT 
                e.id,
                e.name,
                e.employee_type,
                d.name as department
            FROM employees e
            JOIN departments d ON e.department_id = d.id
            WHERE d.name = $1
            ORDER BY e.employee_type DESC, e.name ASC
        `;
        const result = await pool.query(query, [deptName]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching employees by department:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get employees by type
app.get('/api/employees/type/:type', async (req, res) => {
    const { type } = req.params;
    try {
        const query = `
            SELECT 
                e.id,
                e.name,
                e.employee_type,
                d.name as department
            FROM employees e
            JOIN departments d ON e.department_id = d.id
            WHERE e.employee_type = $1
            ORDER BY d.name, e.name ASC
        `;
        const result = await pool.query(query, [type]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching employees by type:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add employee
app.post('/api/employees', async (req, res) => {
    const { name, department, employee_type } = req.body;
    console.log('📝 Adding employee:', { name, department, employee_type });
    
    try {
        const deptResult = await pool.query('SELECT id FROM departments WHERE name = $1', [department]);
        if (deptResult.rows.length === 0) {
            return res.status(400).json({ error: 'Department not found' });
        }
        
        const deptId = deptResult.rows[0].id;
        
        const existing = await pool.query(
            'SELECT id FROM employees WHERE name = $1 AND department_id = $2',
            [name, deptId]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Employee already exists in this department' });
        }
        
        await pool.query(
            `INSERT INTO employees (name, department_id, employee_type) 
             VALUES ($1, $2, $3)`,
            [name, deptId, employee_type]
        );
        
        console.log('✅ Employee added:', name);
        res.json({ success: true, message: `Employee "${name}" added successfully!` });
    } catch (error) {
        console.error('Error adding employee:', error);
        res.status(500).json({ error: error.message });
    }
});

// Edit employee
app.put('/api/employees/:id', async (req, res) => {
    const { id } = req.params;
    const { name, department, employee_type } = req.body;
    
    try {
        const deptResult = await pool.query('SELECT id FROM departments WHERE name = $1', [department]);
        if (deptResult.rows.length === 0) {
            return res.status(400).json({ error: 'Department not found' });
        }
        const deptId = deptResult.rows[0].id;
        
        const existing = await pool.query(
            'SELECT id FROM employees WHERE name = $1 AND department_id = $2 AND id != $3',
            [name, deptId, id]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Employee already exists in this department' });
        }
        
        await pool.query(
            `UPDATE employees 
             SET name = $1, department_id = $2, employee_type = $3 
             WHERE id = $4`,
            [name, deptId, employee_type, id]
        );
        
        // Also update username if user exists with this name
        await pool.query(
            `UPDATE users SET username = $1 WHERE username = $2`,
            [name, name]
        );
        
        res.json({ success: true, message: 'Employee updated successfully!' });
    } catch (error) {
        console.error('Error updating employee:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete employee
app.delete('/api/employees/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM break_log WHERE employee_id = $1', [id]);
        await pool.query('DELETE FROM employees WHERE id = $1', [id]);
        res.json({ success: true, message: 'Employee deleted successfully!' });
    } catch (error) {
        console.error('Error deleting employee:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// BREAK ROUTES
// =============================================

// Get active breaks
app.get('/api/active-breaks', async (req, res) => {
    try {
        const query = `
            SELECT 
                e.id as employee_id,
                e.name AS employee_name,
                e.employee_type,
                d.name as department,
                b.id AS break_id,
                TO_CHAR(b.break_out, 'HH24:MI') AS break_out,
                TO_CHAR(b.break_date, 'DD Mon YYYY') AS break_date
            FROM break_log b
            JOIN employees e ON b.employee_id = e.id
            JOIN departments d ON e.department_id = d.id
            WHERE b.break_in IS NULL
            ORDER BY b.break_out ASC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error in /api/active-breaks:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get breaks for specific employee
app.get('/api/breaks/:employeeName', async (req, res) => {
    const { employeeName } = req.params;
    console.log('📊 Fetching breaks for:', employeeName);
    
    try {
        const query = `
            SELECT 
                b.id,
                TO_CHAR(b.break_date, 'DD Mon YYYY') as date,
                TO_CHAR(b.break_out, 'HH24:MI') as "Break",
                CASE 
                    WHEN b.break_in IS NOT NULL THEN TO_CHAR(b.break_in, 'HH24:MI')
                    ELSE 'Active'
                END as "IN",
                CASE 
                    WHEN b.break_in IS NOT NULL THEN TO_CHAR(b.break_in - b.break_out, 'HH24:MI')
                    ELSE '--:--'
                END as "Duration",
                CASE 
                    WHEN b.break_in IS NULL THEN true
                    ELSE false
                END as is_active,
                e.name as employee_name,
                d.name as department,
                e.employee_type
            FROM break_log b
            JOIN employees e ON b.employee_id = e.id
            JOIN departments d ON e.department_id = d.id
            WHERE e.name = $1
            ORDER BY b.break_date DESC, b.break_out DESC
            LIMIT 50
        `;
        const result = await pool.query(query, [employeeName]);
        console.log('✅ Found', result.rows.length, 'breaks for', employeeName);
        res.json(result.rows);
    } catch (error) {
        console.error('Error in /api/breaks:', error);
        res.status(500).json({ error: error.message });
    }
});

// Check if employee is on break
app.get('/api/active-break/:employeeName', async (req, res) => {
    const { employeeName } = req.params;
    try {
        const query = `
            SELECT 
                b.id,
                TO_CHAR(b.break_out, 'HH24:MI') as break_out,
                b.break_date,
                e.id as employee_id
            FROM break_log b
            JOIN employees e ON b.employee_id = e.id
            WHERE e.name = $1 
            AND b.break_in IS NULL
            ORDER BY b.break_out DESC
            LIMIT 1
        `;
        const result = await pool.query(query, [employeeName]);
        res.json(result.rows[0] || null);
    } catch (error) {
        console.error('Error in /api/active-break/:employeeName:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start break - BREAK OUT
app.post('/api/break-out', async (req, res) => {
    const { employeeName, breakDate, breakOut } = req.body;
    console.log('🔴 Break Out:', employeeName, breakDate, breakOut);
    
    try {
        const employee = await pool.query('SELECT id FROM employees WHERE name = $1', [employeeName]);
        if (employee.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        
        const employeeId = employee.rows[0].id;
        
        const activeBreak = await pool.query(
            `SELECT id FROM break_log 
             WHERE employee_id = $1 AND break_in IS NULL`,
            [employeeId]
        );
        
        if (activeBreak.rows.length > 0) {
            return res.status(400).json({ 
                error: 'Employee already on break! Please click In first.' 
            });
        }
        
        await pool.query(
            `INSERT INTO break_log (employee_id, break_date, break_out) 
             VALUES ($1, $2, $3)`,
            [employeeId, breakDate, breakOut]
        );
        
        console.log('✅ Break started for:', employeeName);
        res.json({ 
            success: true, 
            message: `✅ ${employeeName} started break at ${breakOut}` 
        });
    } catch (error) {
        console.error('Error in /api/break-out:', error);
        res.status(500).json({ error: error.message });
    }
});

// End break - BREAK IN
app.post('/api/break-in', async (req, res) => {
    const { employeeName, breakDate, breakIn } = req.body;
    console.log('🟢 Break In:', employeeName, breakDate, breakIn);
    
    try {
        const employee = await pool.query('SELECT id FROM employees WHERE name = $1', [employeeName]);
        if (employee.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        
        const employeeId = employee.rows[0].id;
        
        const activeBreak = await pool.query(
            `SELECT id FROM break_log 
             WHERE employee_id = $1 AND break_in IS NULL
             ORDER BY break_out DESC
             LIMIT 1`,
            [employeeId]
        );
        
        if (activeBreak.rows.length === 0) {
            return res.status(400).json({ 
                error: 'No active break found! Please click Break first.' 
            });
        }
        
        const breakId = activeBreak.rows[0].id;
        await pool.query(`UPDATE break_log SET break_in = $1 WHERE id = $2`, [breakIn, breakId]);
        
        console.log('✅ Break ended for:', employeeName);
        res.json({ 
            success: true, 
            message: `✅ ${employeeName} ended break at ${breakIn}`
        });
    } catch (error) {
        console.error('Error in /api/break-in:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete break
app.delete('/api/breaks/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM break_log WHERE id = $1', [id]);
        res.json({ success: true, message: 'Break deleted successfully!' });
    } catch (error) {
        console.error('Error in /api/breaks/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get today's summary
app.get('/api/today/:employeeName', async (req, res) => {
    const { employeeName } = req.params;
    try {
        const query = `
            SELECT 
                COUNT(*) FILTER (WHERE break_in IS NOT NULL) AS breaks_today,
                COALESCE(SUM(break_in - break_out) FILTER (WHERE break_in IS NOT NULL), INTERVAL '0') AS total_time_used,
                COUNT(*) FILTER (WHERE break_in IS NULL) AS active_breaks
            FROM break_log b
            JOIN employees e ON b.employee_id = e.id
            WHERE e.name = $1 AND b.break_date = CURRENT_DATE
        `;
        const result = await pool.query(query, [employeeName]);
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error in /api/today/:employeeName:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// REPORT ROUTE
// =============================================

app.get('/api/break-report', async (req, res) => {
    try {
        const query = `
            SELECT 
                e.name AS employee_name,
                e.employee_type,
                d.name as department,
                TO_CHAR(b.break_date, 'DD Mon YYYY') AS break_date,
                TO_CHAR(b.break_out, 'HH24:MI') AS break_out,
                CASE 
                    WHEN b.break_in IS NOT NULL THEN TO_CHAR(b.break_in, 'HH24:MI')
                    ELSE 'Active'
                END AS break_in,
                CASE 
                    WHEN b.break_in IS NOT NULL THEN TO_CHAR(b.break_in - b.break_out, 'HH24:MI')
                    ELSE 'In Progress'
                END AS duration,
                CASE 
                    WHEN b.break_in IS NULL THEN 'On Break'
                    ELSE 'Completed'
                END AS status
            FROM break_log b
            JOIN employees e ON b.employee_id = e.id
            JOIN departments d ON e.department_id = d.id
            ORDER BY b.break_date DESC, b.break_out DESC
            LIMIT 500
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error in /api/break-report:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// START SERVER
// =============================================

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`👑 Main Admin: admin / 535680`);
    console.log(`📦 Database: PostgreSQL`);
    console.log(`📊 Departments: Betrealated, Banking, CS, Checking`);
    console.log(`👥 Employee Types: Local & Expat`);
});
