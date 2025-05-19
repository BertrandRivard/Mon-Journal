// Import required modules
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Secret key for JWT
const JWT_SECRET = 'your-secret-key'; // Replace with a secure key in production

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
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin'))
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
        'What’s a new thing you learned recently?',
        'What’s a goal you’re excited about?',
        'What’s a memory that makes you happy?',
        'What’s something you’re grateful for today?'
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
app.post('/login', (req, res) => {
  const { email, password } = req.body;
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

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, role: user.role });
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

// Route to submit an answer
app.post('/submit', authenticateToken, (req, res) => {
  const { question_id, text } = req.body;
  if (!text || !question_id) {
    return res.status(400).json({ error: 'Text and question_id required' });
  }
  const date = new Date().toISOString();
  db.run('INSERT INTO answers (question_id, user_id, text, date) VALUES (?, ?, ?, ?)', [question_id, req.user.id, text, date], (err) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to save answer' });
    } else {
      res.json({ success: true });
    }
  });
});

// Route to get all answers for the authenticated user
app.get('/entries', authenticateToken, (req, res) => {
  db.all(`
    SELECT answers.id, answers.question_id, answers.text, answers.date, questions.text as question_text
    FROM answers
    JOIN questions ON answers.question_id = questions.id
    WHERE answers.user_id = ?
    ORDER BY answers.date DESC
  `, [req.user.id], (err, rows) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch entries' });
    } else {
      res.json(rows);
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

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});