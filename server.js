const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// PostgreSQL Connection - UPDATE YOUR PASSWORD!
const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '535680',  // ← CHANGE THIS TO YOUR POSTGRESQL PASSWORD
    database: 'Data Pool'
});

// Test database connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Database connection failed:', err.stack);
    } else {
        console.log('✅ Connected to PostgreSQL successfully!');
        release();
    }
});

// =============================================
// AUTHENTICATION ROUTES
// =============================================

// 1. Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1 AND password = $2',
            [username, password]
        );
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role
                }
            });
        } else {
            res.status(401).json({ success: false, message: 'Invalid username or password' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. Get all users (Admin only)
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, role, created_at FROM users ORDER BY username');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Add new user (Admin only)
app.post('/api/users', async (req, res) => {
    const { username, password, role } = req.body;
    
    try {
        // Check if user exists
        const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        // Check if employee exists
        const employee = await pool.query('SELECT id FROM employees WHERE name = $1', [username]);
        if (employee.rows.length === 0) {
            return res.status(400).json({ error: 'Employee not found. Please add employee first.' });
        }
        
        const result = await pool.query(
            'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role',
            [username, password || 'user123', role || 'user']
        );
        
        res.json({ success: true, user: result.rows[0] });
    } catch (error) {
        console.error('Error adding user:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. Update username (Admin only)
app.put('/api/users/:oldUsername/username', async (req, res) => {
    const { oldUsername } = req.params;
    const { newUsername } = req.body;
    
    try {
        // Prevent admin rename
        if (oldUsername === 'admin') {
            return res.status(400).json({ error: 'Cannot rename admin user' });
        }
        
        // Check if new username exists
        const existing = await pool.query('SELECT id FROM users WHERE username = $1', [newUsername]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        // Check if employee exists with new name
        const employee = await pool.query('SELECT id FROM employees WHERE name = $1', [newUsername]);
        if (employee.rows.length === 0) {
            return res.status(400).json({ error: 'Employee not found. Please add employee first.' });
        }
        
        // Update username
        await pool.query('UPDATE users SET username = $1 WHERE username = $2', [newUsername, oldUsername]);
        
        res.json({ success: true, message: `Username updated from "${oldUsername}" to "${newUsername}"` });
    } catch (error) {
        console.error('Error updating username:', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. Reset password (Admin can reset any user, users can reset their own)
app.put('/api/users/:username/password', async (req, res) => {
    const { username } = req.params;
    const { newPassword, currentUser } = req.body;
    
    try {
        // If not admin, verify they are resetting their own password
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

// 6. Update user role (Admin only)
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

// 7. Delete user (Admin only)
app.delete('/api/users/:username', async (req, res) => {
    const { username } = req.params;
    
    try {
        // Prevent deleting admin
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

// 8. Get all employees
app.get('/api/employees', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM employees ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        console.error('Error in /api/employees:', error);
        res.status(500).json({ error: error.message });
    }
});

// 9. Add multiple employees at once
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

// 10. Delete an employee and all their breaks
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

// 11. Get currently active breaks (all employees on break)
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

// 12. Get active breaks count
app.get('/api/active-count', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT COUNT(*) AS active_count
            FROM break_log b
            WHERE b.break_in IS NULL AND b.break_date = CURRENT_DATE
        `);
        res.json({ count: parseInt(result.rows[0].active_count) });
    } catch (error) {
        console.error('Error in /api/active-count:', error);
        res.status(500).json({ error: error.message });
    }
});

// 13. Get break history for all employees (report)
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
            LIMIT 100
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error in /api/break-report:', error);
        res.status(500).json({ error: error.message });
    }
});

// 14. Get break summary for a specific employee
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

// 15. Check if employee has active break
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

// 16. Add Break (start break)
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

// 17. Add Break In (end break)
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
        
        await pool.query(
            `UPDATE break_log SET break_in = $1 WHERE id = $2`,
            [breakIn, breakId]
        );
        
        const duration = await pool.query(
            `SELECT (break_in - break_out) AS duration FROM break_log WHERE id = $1`,
            [breakId]
        );
        
        const durationStr = duration.rows[0].duration;
        
        res.json({ 
            success: true, 
            message: `✅ ${employeeName} ended break at ${breakIn}`,
            duration: durationStr
        });
    } catch (error) {
        console.error('Error in /api/break-in:', error);
        res.status(500).json({ error: error.message });
    }
});

// 18. Delete a break
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

// 19. Get today's summary for an employee
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
});