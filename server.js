import express from 'express'
import Database from 'better-sqlite3'
import jwt from 'jsonwebtoken'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PORT = process.env.PORT || 3000
const DB_PATH = process.env.DB_PATH || './tempo.db'
const JWT_SECRET = process.env.JWT_SECRET || 'changeme'
const APP_USERNAME = process.env.APP_USERNAME || 'admin'
const APP_PASSWORD = process.env.APP_PASSWORD || 'password'

// ── Database setup ──────────────────────────────────────────────────────────
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS habit_completions (
    habit_id TEXT NOT NULL,
    date TEXT NOT NULL,
    PRIMARY KEY (habit_id, date),
    FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    text TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0
  );
`)

// ── Auth middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization']
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' })
  }
  const token = authHeader.slice(7)
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// ── Express app ──────────────────────────────────────────────────────────────
const app = express()
app.use(express.json())

// ── Auth route ───────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {}
  if (username === APP_USERNAME && password === APP_PASSWORD) {
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '30d' })
    return res.json({ token })
  }
  return res.status(401).json({ error: 'Invalid credentials' })
})

// ── Habits ───────────────────────────────────────────────────────────────────
app.get('/api/habits', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id, name, created_at FROM habits ORDER BY created_at ASC').all()
  res.json(rows)
})

app.post('/api/habits', requireAuth, (req, res) => {
  const { id, name, created_at } = req.body || {}
  if (!id || !name || !created_at) {
    return res.status(400).json({ error: 'id, name, and created_at are required' })
  }
  db.prepare('INSERT OR REPLACE INTO habits (id, name, created_at) VALUES (?, ?, ?)').run(
    id,
    name,
    created_at
  )
  res.json({ success: true })
})

app.delete('/api/habits/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM habits WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

// ── Habit completions ────────────────────────────────────────────────────────
app.get('/api/habit-completions', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT habit_id, date FROM habit_completions').all()
  const result = {}
  for (const row of rows) {
    if (!result[row.date]) result[row.date] = []
    result[row.date].push(row.habit_id)
  }
  res.json(result)
})

app.post('/api/habit-completions/:habitId/:date', requireAuth, (req, res) => {
  const { habitId, date } = req.params
  db.prepare(
    'INSERT OR IGNORE INTO habit_completions (habit_id, date) VALUES (?, ?)'
  ).run(habitId, date)
  res.json({ success: true })
})

app.delete('/api/habit-completions/:habitId/:date', requireAuth, (req, res) => {
  const { habitId, date } = req.params
  db.prepare('DELETE FROM habit_completions WHERE habit_id = ? AND date = ?').run(habitId, date)
  res.json({ success: true })
})

// ── Todos ─────────────────────────────────────────────────────────────────────
app.get('/api/todos', requireAuth, (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'date query param required' })
  const rows = db
    .prepare('SELECT id, date, text, completed FROM todos WHERE date = ? ORDER BY rowid ASC')
    .all(date)
  res.json(rows.map((r) => ({ ...r, completed: r.completed === 1 })))
})

app.post('/api/todos', requireAuth, (req, res) => {
  const { id, date, text } = req.body || {}
  if (!id || !date || !text) {
    return res.status(400).json({ error: 'id, date, and text are required' })
  }
  db.prepare('INSERT OR REPLACE INTO todos (id, date, text, completed) VALUES (?, ?, ?, 0)').run(
    id,
    date,
    text
  )
  res.json({ success: true })
})

app.delete('/api/todos/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM todos WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

app.patch('/api/todos/:id', requireAuth, (req, res) => {
  const { completed } = req.body || {}
  if (completed === undefined) {
    return res.status(400).json({ error: 'completed field required' })
  }
  db.prepare('UPDATE todos SET completed = ? WHERE id = ?').run(completed ? 1 : 0, req.params.id)
  res.json({ success: true })
})

// ── Graph data ───────────────────────────────────────────────────────────────
app.get('/api/graph-data', requireAuth, (req, res) => {
  // Compute cutoff date (400 days ago)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 400)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const result = {}

  // Habit completions grouped by date
  const habitRows = db
    .prepare(
      `SELECT date, COUNT(*) as cnt
       FROM habit_completions
       WHERE date >= ?
       GROUP BY date`
    )
    .all(cutoffStr)
  for (const row of habitRows) {
    result[row.date] = (result[row.date] || 0) + row.cnt
  }

  // Completed todos grouped by date
  const todoRows = db
    .prepare(
      `SELECT date, COUNT(*) as cnt
       FROM todos
       WHERE completed = 1 AND date >= ?
       GROUP BY date`
    )
    .all(cutoffStr)
  for (const row of todoRows) {
    result[row.date] = (result[row.date] || 0) + row.cnt
  }

  res.json(result)
})

// ── SPA fallback (serve built frontend) ─────────────────────────────────────
app.use(express.static(join(__dirname, 'dist')))

app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Tempo server running on port ${PORT}`)
})
