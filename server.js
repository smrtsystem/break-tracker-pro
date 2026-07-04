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

        // 3. Check and add department_id column
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
            
            // Set default department
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

        // 5. Check and add can_manage_users column
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

        // 7. Insert sample employees if missing
        const empCount = await client.query('SELECT COUNT(*) FROM employees');
        if (parseInt(empCount.rows[0].count) === 0) {
            console.log('🔧 Inserting sample employees...');
            const depts = await client.query('SELECT id, name FROM departments');
            const deptMap = {};
            depts.rows.forEach(d => { deptMap[d.name] = d.id; });

            const sampleEmployees = [
                { name: 'Rajesh Sharma', dept: 'Betrealated', type: 'local' },
                { name: 'Priya Patel', dept: 'Betrealated', type: 'local' },
                { name: 'John Smith', dept: 'Betrealated', type: 'expat' },
                { name: 'Amit Kumar', dept: 'Banking', type: 'local' },
                { name: 'Sneha Reddy', dept: 'Banking', type: 'local' },
                { name: 'David Wilson', dept: 'Banking', type: 'expat' },
                { name: 'Vikram Singh', dept: 'CS', type: 'local' },
                { name: 'Ananya Gupta', dept: 'CS', type: 'local' },
                { name: 'Michael Brown', dept: 'CS', type: 'expat' },
                { name: 'Deepak Verma', dept: 'Checking', type: 'local' },
                { name: 'Kavita Nair', dept: 'Checking', type: 'local' },
                { name: 'Robert Taylor', dept: 'Checking', type: 'expat' }
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
            console.log('✅ Sample employees inserted');
        }

        // 8. Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);
            CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);
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
            
            // Run auto-migration
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
// =============================================
// ALL YOUR EXISTING ROUTES GO HERE
// =============================================
// =============================================

// =============================================
// TEST ROUTES
// =============================================

app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Server is running!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
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

app.get('/api/departments', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM departments ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({ error: error.message });
    }
});

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

app.post('/api/users', async (req, res) => {
    const { username, password, role, can_manage_users } = req.body;
    try {
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
        res.json({ success: true, message: `Username updated from "${oldUsername}" to "${newUsername}"` });
    } catch (error) {
        console.error('Error updating username:', error);
        res.status(500).json({ error: error.message });
    }
});

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

app.get('/api/employees', async (req, res) => {
    try {
        const query = `
            SELECT 
                e.id,
                e.name,
                e.employee_type,
                e.total_break_allowance,
                d.name as department,
                d.id as department_id,
                e.created_at
            FROM employees e
            JOIN departments d ON e.department_id = d.id
            ORDER BY d.name, e.employee_type, e.name
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error in /api/employees:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/employees', async (req, res) => {
    const { name, department, employee_type } = req.body;
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
        res.json({ success: true, message: `Employee "${name}" added successfully!` });
    } catch (error) {
        console.error('Error adding employee:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/employees/:id', async (req, res) => {
    const { id } = req.params;
    const { name, department, employee_type } = req.body;
    try {
        let deptId = null;
        if (department) {
            const deptResult = await pool.query('SELECT id FROM departments WHERE name = $1', [department]);
            if (deptResult.rows.length === 0) {
                return res.status(400).json({ error: 'Department not found' });
            }
            deptId = deptResult.rows[0].id;
        }
        let query = 'UPDATE employees SET ';
        const params = [];
        let paramCount = 1;
        if (name) {
            query += `name = $${paramCount}, `;
            params.push(name);
            paramCount++;
        }
        if (deptId) {
            query += `department_id = $${paramCount}, `;
            params.push(deptId);
            paramCount++;
        }
        if (employee_type) {
            query += `employee_type = $${paramCount}, `;
            params.push(employee_type);
            paramCount++;
        }
        query = query.slice(0, -2);
        query += ` WHERE id = $${paramCount}`;
        params.push(id);
        await pool.query(query, params);
        res.json({ success: true, message: 'Employee updated successfully!' });
    } catch (error) {
        console.error('Error editing employee:', error);
        res.status(500).json({ error: error.message });
    }
});

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

app.get('/api/active-breaks', async (req, res) => {
    const employeeName = req.query.employeeName;
    try {
        let query = `
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
            WHERE b.break_in IS NULL AND b.break_date = CURRENT_DATE
        `;
        const params = [];
        if (employeeName) {
            const empResult = await pool.query(
                'SELECT employee_type FROM employees WHERE name = $1',
                [employeeName]
            );
            if (empResult.rows.length > 0) {
                const empType = empResult.rows[0].employee_type;
                if (empType === 'expat') {
                    query += ` AND e.employee_type = 'expat'`;
                }
            }
        }
        query += ` ORDER BY b.break_out ASC`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error in /api/active-breaks:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/break-report', async (req, res) => {
    const { employeeName, role } = req.query;
    try {
        let query = `
            SELECT 
                e.id as employee_id,
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
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;
        if (role !== 'admin' && role !== 'sub-admin') {
            if (employeeName) {
                query += ` AND e.name = $${paramCount}`;
                params.push(employeeName);
                paramCount++;
            }
        }
        query += ` ORDER BY b.break_date DESC, b.break_out DESC LIMIT 1000`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error in /api/break-report:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/breaks/:employeeId', async (req, res) => {
    const { employeeId } = req.params;
    try {
        const query = `
            WITH daily_breaks AS (
                SELECT 
                    e.id AS employee_id,
                    e.name AS employee_name,
                    d.name as department,
                    e.employee_type,
                    b.id AS break_id,
                    b.break_date,
                    b.break_out,
                    b.break_in,
                    (b.break_in - b.break_out) AS break_duration,
                    COALESCE(
                        SUM(CASE 
                            WHEN b.break_in IS NOT NULL THEN (b.break_in - b.break_out)
                            ELSE INTERVAL '0'
                        END) OVER (
                            PARTITION BY e.id 
                            ORDER BY b.break_date, b.break_out
                            ROWS UNBOUNDED PRECEDING
                        ),
                        INTERVAL '0'
                    ) AS used_break_time,
                    e.total_break_allowance,
                    CASE WHEN b.break_in IS NULL THEN true ELSE false END AS is_active
                FROM break_log b
                JOIN employees e ON b.employee_id = e.id
                JOIN departments d ON e.department_id = d.id
                WHERE e.id = $1
            )
            SELECT 
                break_id AS id,
                TO_CHAR(break_date, 'DD Mon YYYY') AS date,
                employee_name AS "Employee Name",
                department AS "Department",
                CASE 
                    WHEN employee_type = 'local' THEN '🇱🇰 Local'
                    ELSE '🌍 Expat'
                END AS "Type",
                TO_CHAR(break_out, 'HH24:MI') AS "Break",
                CASE 
                    WHEN break_in IS NOT NULL THEN TO_CHAR(break_in, 'HH24:MI')
                    ELSE 'Active'
                END AS "IN",
                CASE 
                    WHEN break_in IS NOT NULL THEN TO_CHAR(break_duration, 'HH24:MI')
                    ELSE '--:--'
                END AS "Duration",
                CASE 
                    WHEN break_in IS NOT NULL THEN TO_CHAR(used_break_time, 'HH24:MI')
                    ELSE TO_CHAR(used_break_time, 'HH24:MI')
                END AS "Used",
                CASE 
                    WHEN break_in IS NOT NULL THEN TO_CHAR(total_break_allowance - used_break_time, 'HH24:MI')
                    ELSE TO_CHAR(total_break_allowance - used_break_time, 'HH24:MI')
                END AS "Remaining",
                TO_CHAR(total_break_allowance, 'HH24:MI') AS "Total",
                is_active
            FROM daily_breaks
            ORDER BY break_date DESC, break_out DESC;
        `;
        const result = await pool.query(query, [employeeId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error in /api/breaks:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/active-break/:employeeName', async (req, res) => {
    const { employeeName } = req.params;
    try {
        const query = `
            SELECT 
                b.id,
                b.break_out,
                b.break_date,
                e.id as employee_id
            FROM break_log b
            JOIN employees e ON b.employee_id = e.id
            WHERE e.name = $1 
            AND b.break_date = CURRENT_DATE
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

app.post('/api/break-out', async (req, res) => {
    const { employeeName, breakDate, breakOut } = req.body;
    try {
        let employee = await pool.query('SELECT id FROM employees WHERE name = $1', [employeeName]);
        if (employee.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        const employeeId = employee.rows[0].id;
        const activeBreak = await pool.query(
            `SELECT id FROM break_log 
             WHERE employee_id = $1 AND break_date = $2 AND break_in IS NULL`,
            [employeeId, breakDate]
        );
        if (activeBreak.rows.length > 0) {
            return res.status(400).json({ 
                error: 'Employee already has an active break! Please click In first.' 
            });
        }
        await pool.query(
            `INSERT INTO break_log (employee_id, break_date, break_out) 
             VALUES ($1, $2, $3)`,
            [employeeId, breakDate, breakOut]
        );
        res.json({ 
            success: true, 
            message: `✅ ${employeeName} started break at ${breakOut}` 
        });
    } catch (error) {
        console.error('Error in /api/break-out:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/break-in', async (req, res) => {
    const { employeeName, breakDate, breakIn } = req.body;
    try {
        const employee = await pool.query('SELECT id FROM employees WHERE name = $1', [employeeName]);
        if (employee.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        const employeeId = employee.rows[0].id;
        const activeBreak = await pool.query(
            `SELECT id, break_out FROM break_log 
             WHERE employee_id = $1 AND break_date = $2 AND break_in IS NULL
             ORDER BY break_out DESC
             LIMIT 1`,
            [employeeId, breakDate]
        );
        if (activeBreak.rows.length === 0) {
            return res.status(400).json({ 
                error: 'No active break found! Please click Break first.' 
            });
        }
        const breakId = activeBreak.rows[0].id;
        await pool.query(`UPDATE break_log SET break_in = $1 WHERE id = $2`, [breakIn, breakId]);
        const duration = await pool.query(
            `SELECT (break_in - break_out) AS duration FROM break_log WHERE id = $1`,
            [breakId]
        );
        res.json({ 
            success: true, 
            message: `✅ ${employeeName} ended break at ${breakIn}`,
            duration: duration.rows[0].duration
        });
    } catch (error) {
        console.error('Error in /api/break-in:', error);
        res.status(500).json({ error: error.message });
    }
});

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
// START SERVER
// =============================================

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`👑 Main Admin: admin / 535680`);
    console.log(`📦 Database: PostgreSQL`);
});
