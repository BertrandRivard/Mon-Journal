// Import required modules
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
const sgMail = require('@sendgrid/mail');

const app = express();
app.use(express.json());
app.use(cors());

// SendGrid configuration
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Secret key for JWT
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Initialize SQLite database
const dbPath = path.join(__dirname, 'journal.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err);
  } else {
    console.log('Connected to SQLite database');
  }
});

// Create tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
    two_factor_enabled BOOLEAN DEFAULT 0,
    two_factor_secret TEXT
  )`);

  // Two-factor verification table
  db.run(`CREATE TABLE IF NOT EXISTS two_factor_verification (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Questions table
  db.run(`CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    user_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Answers table
  db.run(`CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER,
    user_id INTEGER,
    text TEXT NOT NULL,
    date TEXT NOT NULL,
    FOREIGN KEY (question_id) REFERENCES questions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Seed questions (run only if table is empty)
  db.get('SELECT COUNT(*) as count FROM questions', (err, row) => {
    if (row.count === 0) {
      const questions = [
        'What made you smile today? 😊',
        'What\'s a new thing you learned recently?',
        'What\'s a goal you\'re excited about?',
        'What\'s a memory that makes you happy?',
        'What\'s something you\'re grateful for today?'
      ];
      const stmt = db.prepare('INSERT INTO questions (text, user_id) VALUES (?, NULL)');
      questions.forEach(q => stmt.run(q));
      stmt.finalize();
    }
  });
});

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Route to register a new user
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  db.run('INSERT INTO users (email, password, role) VALUES (?, ?, ?)', [email, hashedPassword, 'user'], (err) => {
    if (err) {
      console.error(err);
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.json({ success: true });
  });
});

// Route to login
app.post('/login', async (req, res) => {
  const { email, password, verificationCode } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // If 2FA is enabled, verify the code
    if (user.two_factor_enabled) {
      if (!verificationCode) {
        return res.status(400).json({ error: 'Verification code required' });
      }

      // Check if the code is valid and not expired
      db.get('SELECT * FROM two_factor_verification WHERE user_id = ? AND code = ? AND expires_at > ? ORDER BY id DESC LIMIT 1',
        [user.id, verificationCode, new Date().toISOString()],
        (err, verification) => {
          if (err || !verification) {
            return res.status(401).json({ error: 'Invalid or expired verification code' });
          }

          // Code is valid, generate token
          const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
          res.json({ token, role: user.role });
        }
      );
    } else {
      // 2FA not enabled, proceed with normal login
      const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
      res.json({ token, role: user.role });
    }
  });
});

// Route to get a random question
app.get('/question', authenticateToken, (req, res) => {
  db.get('SELECT * FROM questions WHERE user_id IS NULL OR user_id = ? ORDER BY RANDOM() LIMIT 1', [req.user.id], (err, row) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch question' });
    } else {
      res.json(row);
    }
  });
});

// Route to check if an answer can be modified
app.get('/answer/:id/can-edit', authenticateToken, (req, res) => {
  const answerId = req.params.id;
  const today = new Date().toISOString().split('T')[0];
  
  db.get('SELECT date FROM answers WHERE id = ? AND user_id = ?', [answerId, req.user.id], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ error: 'Answer not found' });
    }
    
    const answerDate = row.date.split('T')[0];
    const canEdit = answerDate === today;
    
    res.json({ canEdit });
  });
});

// Route to submit an answer
app.post('/submit', authenticateToken, (req, res) => {
  const { question_id, text, answer_id } = req.body;
  if (!text || !question_id) {
    return res.status(400).json({ error: 'Text and question_id required' });
  }

  // If answer_id is provided, check if it can be modified
  if (answer_id) {
    const today = new Date().toISOString().split('T')[0];
    db.get('SELECT date FROM answers WHERE id = ? AND user_id = ?', [answer_id, req.user.id], (err, row) => {
      if (err || !row) {
        return res.status(404).json({ error: 'Answer not found' });
      }
      
      const answerDate = row.date.split('T')[0];
      if (answerDate !== today) {
        return res.status(403).json({ error: 'Cannot modify answers from previous days' });
      }
      
      // If we can modify, update the answer
      db.run('UPDATE answers SET text = ? WHERE id = ?', [text, answer_id], (err) => {
        if (err) {
          console.error(err);
          res.status(500).json({ error: 'Failed to update answer' });
        } else {
          res.json({ success: true });
        }
      });
    });
  } else {
    // Create new answer
    const date = new Date().toISOString();
    db.run('INSERT INTO answers (question_id, user_id, text, date) VALUES (?, ?, ?, ?)', 
      [question_id, req.user.id, text, date], (err) => {
      if (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save answer' });
      } else {
        res.json({ success: true });
      }
    });
  }
});

// Route to get all answers for the authenticated user
app.get('/entries', authenticateToken, (req, res) => {
  const { page = 1, limit = page === 1 ? 6 : 3, search = '', searchType = 'all' } = req.query;
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT answers.id, answers.question_id, answers.text, answers.date, questions.text as question_text
    FROM answers
    JOIN questions ON answers.question_id = questions.id
    WHERE answers.user_id = ?
  `;
  
  const params = [req.user.id];
  
  if (search) {
    switch (searchType) {
      case 'keyword':
        query += ` AND (answers.text LIKE ? OR questions.text LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
        break;
      case 'question':
        query += ` AND questions.text LIKE ?`;
        params.push(`%${search}%`);
        break;
      case 'date':
        query += ` AND answers.date LIKE ?`;
        params.push(`%${search}%`);
        break;
      default:
        query += ` AND (answers.text LIKE ? OR questions.text LIKE ? OR answers.date LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
  }
  
  query += ` ORDER BY answers.date DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch entries' });
    } else {
      // Get total count for pagination
      let countQuery = `
        SELECT COUNT(*) as total
        FROM answers
        JOIN questions ON answers.question_id = questions.id
        WHERE answers.user_id = ?
      `;
      
      const countParams = [req.user.id];
      
      if (search) {
        switch (searchType) {
          case 'keyword':
            countQuery += ` AND (answers.text LIKE ? OR questions.text LIKE ?)`;
            countParams.push(`%${search}%`, `%${search}%`);
            break;
          case 'question':
            countQuery += ` AND questions.text LIKE ?`;
            countParams.push(`%${search}%`);
            break;
          case 'date':
            countQuery += ` AND answers.date LIKE ?`;
            countParams.push(`%${search}%`);
            break;
          default:
            countQuery += ` AND (answers.text LIKE ? OR questions.text LIKE ? OR answers.date LIKE ?)`;
            countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
      }
      
      db.get(countQuery, countParams, (err, countRow) => {
        if (err) {
          console.error(err);
          res.status(500).json({ error: 'Failed to fetch total count' });
        } else {
          res.json({
            entries: rows,
            total: countRow.total,
            hasMore: countRow.total > offset + rows.length
          });
        }
      });
    }
  });
});

// Admin route to get all users (for admin only)
app.get('/admin/users', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  db.all('SELECT id, email, role FROM users', [], (err, rows) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch users' });
    } else {
      res.json(rows);
    }
  });
});

// Route to enable 2FA
app.post('/enable-2fa', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  
  // Generate a random 6-digit code
  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 10 * 60000); // 10 minutes from now

  // Store the code in the database
  db.run('INSERT INTO two_factor_verification (user_id, code, expires_at) VALUES (?, ?, ?)',
    [userId, code, expiresAt.toISOString()],
    async (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to enable 2FA' });
      }

      // Send the code via email
      const msg = {
        to: req.user.email,
        from: 'your-verified-sender@yourdomain.com', // Must be verified in SendGrid
        subject: 'Code de vérification pour Mon Journal',
        text: `Votre code de vérification est : ${code}. Ce code expirera dans 10 minutes.`,
        html: `<p>Votre code de vérification est : <strong>${code}</strong></p><p>Ce code expirera dans 10 minutes.</p>`
      };

      try {
        await sgMail.send(msg);
        db.run('UPDATE users SET two_factor_enabled = 1 WHERE id = ?', [userId]);
        res.json({ success: true, message: '2FA enabled successfully' });
      } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ error: 'Failed to send verification code' });
      }
    }
  );
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});