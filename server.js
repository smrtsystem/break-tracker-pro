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

// PostgreSQL Connection - Use environment variable for production
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:535680@localhost:5432/break_tracker_db',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
});

// Test database connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        return;
    }
    console.log('✅ Connected to PostgreSQL successfully!');
    release();
});

// =============================================
// CREATE TABLES FUNCTION (for production)
// =============================================

async function createTables() {
    try {
        // Create employees table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS employees (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                total_break_allowance INTERVAL DEFAULT '2 hours 30 minutes',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ employees table created');

        // Create break_log table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS break_log (
                id SERIAL PRIMARY KEY,
                employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                break_date DATE NOT NULL,
                break_out TIME NOT NULL,
                break_in TIME,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT valid_break_times CHECK (break_in IS NULL OR break_in > break_out)
            )
        `);
        console.log('✅ break_log table created');

        // Create users table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                password VARCHAR(100) NOT NULL,
                role VARCHAR(20) DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ users table created');

        // Create indexes
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_break_log_employee_date 
            ON break_log(employee_id, break_date)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_break_log_active 
            ON break_log(employee_id, break_date) 
            WHERE break_in IS NULL
        `);
        console.log('✅ Indexes created');

        // Insert default admin
        const adminCheck = await pool.query('SELECT id FROM users WHERE username = $1', ['admin']);
        if (adminCheck.rows.length === 0) {
            await pool.query(
                'INSERT INTO users (username, password, role) VALUES ($1, $2, $3)',
                ['admin', 'admin123', 'admin']
            );
            console.log('✅ Default admin user created');
        }

        // Insert default employees
        const defaultEmployees = [
            'Pradeep Singh', 'Arunava Hazra', 'Sonu Shaw', 'Ashish Mushla',
            'Modallil Ahmed Baig', 'Vicky Patel', 'Souvik Nag', 'Chandan Gupta',
            'Hemang Kerung', 'Devbrat Ojha', 'MD Safik Kureshi', 'Mithilesh Saini',
            'Lokender Singh', 'Pushkar Kathik', 'Vikash Bundela', 'Mahalu Chaudhari',
            'Sanjay Shrestha', 'Ayush Gupta'
        ];

        for (const empName of defaultEmployees) {
            const empCheck = await pool.query('SELECT id FROM employees WHERE name = $1', [empName]);
            if (empCheck.rows.length === 0) {
                await pool.query('INSERT INTO employees (name) VALUES ($1)', [empName]);
            }
        }
        console.log('✅ Default employees created');

        // Create user for Pradeep Singh
        const userCheck = await pool.query('SELECT id FROM users WHERE username = $1', ['Pradeep Singh']);
        if (userCheck.rows.length === 0) {
            await pool.query(
                'INSERT INTO users (username, password, role) VALUES ($1, $2, $3)',
                ['Pradeep Singh', 'user123', 'user']
            );
            console.log('✅ Default user created');
        }
        
        console.log('✅ All tables and default data created successfully!');
    } catch (error) {
        console.error('❌ Error creating tables:', error);
    }
}

// Call createTables on startup
createTables();

// =============================================
// API ROUTES (Same as before - keep all your routes)
// =============================================

// Test route
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Server is running!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

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
                    role: user.role
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
        const result = await pool.query('SELECT id, username, role, created_at FROM users ORDER BY username');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add new user
app.post('/api/users', async (req, res) => {
    const { username, password, role } = req.body;
    
    try {
        const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        let employee = await pool.query('SELECT id FROM employees WHERE name = $1', [username]);
        let employeeCreated = false;
        
        if (employee.rows.length === 0) {
            const newEmployee = await pool.query(
                'INSERT INTO employees (name) VALUES ($1) RETURNING id',
                [username]
            );
            employee = newEmployee;
            employeeCreated = true;
            console.log(`✅ Auto-created employee: ${username}`);
        }
        
        const result = await pool.query(
            'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role',
            [username, password || 'user123', role || 'user']
        );
        
        const message = employeeCreated 
            ? `User "${username}" added successfully! Employee auto-created.` 
            : `User "${username}" added successfully!`;
        
        res.json({ 
            success: true, 
            user: result.rows[0],
            message: message
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
            return res.status(400).json({ error: 'Cannot rename admin user' });
        }
        
        const existing = await pool.query('SELECT id FROM users WHERE username = $1', [newUsername]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        const employee = await pool.query('SELECT id FROM employees WHERE name = $1', [newUsername]);
        if (employee.rows.length === 0) {
            return res.status(400).json({ error: 'Employee not found. Please add employee first.' });
        }
        
        await pool.query('UPDATE users SET username = $1 WHERE username = $2', [newUsername, oldUsername]);
        
        res.json({ success: true, message: `Username updated from "${oldUsername}" to "${newUsername}"` });
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
        if (currentUser && currentUser.role !== 'admin' && currentUser.username !== username) {
            return res.status(403).json({ error: 'You can only reset your own password' });
        }
        
        await pool.query('UPDATE users SET password = $1 WHERE username = $2', [newPassword, username]);
        
        res.json({ success: true, message: `Password updated for "${username}"` });
    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update user role
app.put('/api/users/:username', async (req, res) => {
    const { username } = req.params;
    const { role } = req.body;
    
    try {
        if (username === 'admin') {
            return res.status(400).json({ error: 'Cannot change admin role' });
        }
        
        await pool.query('UPDATE users SET role = $1 WHERE username = $2', [role, username]);
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
            return res.status(400).json({ error: 'Cannot delete admin user' });
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

// Get all employees
app.get('/api/employees', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM employees ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        console.error('Error in /api/employees:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add multiple employees
app.post('/api/employees/bulk', async (req, res) => {
    const { employees } = req.body;
    
    try {
        for (const name of employees) {
            await pool.query(
                'INSERT INTO employees (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
                [name]
            );
        }
        res.json({ success: true, message: 'Employees added successfully!' });
    } catch (error) {
        console.error('Error in /api/employees/bulk:', error);
        res.status(500).json({ error: error.message });
    }
});

// Edit employee name
app.put('/api/employees/:oldName', async (req, res) => {
    const { oldName } = req.params;
    const { newName } = req.body;
    
    try {
        const employee = await pool.query('SELECT id FROM employees WHERE name = $1', [oldName]);
        if (employee.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        
        const existing = await pool.query('SELECT id FROM employees WHERE name = $1', [newName]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Employee name already exists' });
        }
        
        await pool.query('UPDATE employees SET name = $1 WHERE name = $2', [newName, oldName]);
        await pool.query('UPDATE users SET username = $1 WHERE username = $2', [newName, oldName]);
        
        res.json({ 
            success: true, 
            message: `Employee renamed from "${oldName}" to "${newName}"`
        });
    } catch (error) {
        console.error('Error editing employee:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete employee
app.delete('/api/employees/:name', async (req, res) => {
    const { name } = req.params;
    
    try {
        const employee = await pool.query('SELECT id FROM employees WHERE name = $1', [name]);
        if (employee.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        
        const employeeId = employee.rows[0].id;
        await pool.query('DELETE FROM break_log WHERE employee_id = $1', [employeeId]);
        await pool.query('DELETE FROM employees WHERE id = $1', [employeeId]);
        
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
                e.name AS employee_name,
                b.id AS break_id,
                TO_CHAR(b.break_out, 'HH24:MI') AS break_out,
                TO_CHAR(b.break_date, 'DD Mon YYYY') AS break_date
            FROM break_log b
            JOIN employees e ON b.employee_id = e.id
            WHERE b.break_in IS NULL AND b.break_date = CURRENT_DATE
            ORDER BY b.break_out ASC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error in /api/active-breaks:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get break report
app.get('/api/break-report', async (req, res) => {
    try {
        const query = `
            SELECT 
                e.name AS employee_name,
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
            ORDER BY b.break_date DESC, b.break_out DESC
            LIMIT 1000
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error in /api/break-report:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get breaks for specific employee
app.get('/api/breaks/:employeeName', async (req, res) => {
    const { employeeName } = req.params;
    
    try {
        const query = `
            WITH daily_breaks AS (
                SELECT 
                    e.id AS employee_id,
                    e.name AS employee_name,
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
                WHERE e.name = $1
            )
            SELECT 
                break_id AS id,
                TO_CHAR(break_date, 'DD Mon YYYY') AS date,
                employee_name AS "Employee Name",
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
        const result = await pool.query(query, [employeeName]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error in /api/breaks:', error);
        res.status(500).json({ error: error.message });
    }
});

// Check active break
app.get('/api/active-break/:employeeName', async (req, res) => {
    const { employeeName } = req.params;
    
    try {
        const query = `
            SELECT 
                b.id,
                b.break_out,
                b.break_date
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

// Start break
app.post('/api/break-out', async (req, res) => {
    const { employeeName, breakDate, breakOut } = req.body;
    
    try {
        let employee = await pool.query('SELECT id FROM employees WHERE name = $1', [employeeName]);
        if (employee.rows.length === 0) {
            const newEmp = await pool.query(
                'INSERT INTO employees (name) VALUES ($1) RETURNING id',
                [employeeName]
            );
            employee = newEmp;
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

// End break
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
// START SERVER
// =============================================

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Open http://localhost:${PORT} in your browser`);
    console.log(`👤 Default Admin: admin / admin123`);
    console.log(`👤 Default User: Pradeep Singh / user123`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});