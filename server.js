import express from 'express'
import pg from 'pg'
import jwt from 'jsonwebtoken'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PORT = process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET || 'changeme'
const APP_USERNAME = process.env.APP_USERNAME || 'admin'
const APP_PASSWORD = process.env.APP_PASSWORD || 'password'

// ── Database setup ──────────────────────────────────────────────────────────
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

async function initDb() {
  await pool.query(`
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
      completed BOOLEAN NOT NULL DEFAULT FALSE
    );
  `)
}

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
app.get('/api/habits', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, created_at FROM habits ORDER BY created_at ASC')
  res.json(rows)
})

app.post('/api/habits', requireAuth, async (req, res) => {
  const { id, name, created_at } = req.body || {}
  if (!id || !name || !created_at) {
    return res.status(400).json({ error: 'id, name, and created_at are required' })
  }
  await pool.query(
    'INSERT INTO habits (id, name, created_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, created_at = EXCLUDED.created_at',
    [id, name, created_at]
  )
  res.json({ success: true })
})

app.delete('/api/habits/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM habits WHERE id = $1', [req.params.id])
  res.json({ success: true })
})

// ── Habit completions ────────────────────────────────────────────────────────
app.get('/api/habit-completions', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT habit_id, date FROM habit_completions')
  const result = {}
  for (const row of rows) {
    if (!result[row.date]) result[row.date] = []
    result[row.date].push(row.habit_id)
  }
  res.json(result)
})

app.post('/api/habit-completions/:habitId/:date', requireAuth, async (req, res) => {
  const { habitId, date } = req.params
  await pool.query(
    'INSERT INTO habit_completions (habit_id, date) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [habitId, date]
  )
  res.json({ success: true })
})

app.delete('/api/habit-completions/:habitId/:date', requireAuth, async (req, res) => {
  const { habitId, date } = req.params
  await pool.query('DELETE FROM habit_completions WHERE habit_id = $1 AND date = $2', [habitId, date])
  res.json({ success: true })
})

// ── Todos ─────────────────────────────────────────────────────────────────────
app.get('/api/todos', requireAuth, async (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'date query param required' })
  const { rows } = await pool.query(
    'SELECT id, date, text, completed FROM todos WHERE date = $1 ORDER BY ctid ASC',
    [date]
  )
  res.json(rows)
})

app.post('/api/todos', requireAuth, async (req, res) => {
  const { id, date, text } = req.body || {}
  if (!id || !date || !text) {
    return res.status(400).json({ error: 'id, date, and text are required' })
  }
  await pool.query(
    'INSERT INTO todos (id, date, text, completed) VALUES ($1, $2, $3, FALSE) ON CONFLICT (id) DO UPDATE SET date = EXCLUDED.date, text = EXCLUDED.text',
    [id, date, text]
  )
  res.json({ success: true })
})

app.delete('/api/todos/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM todos WHERE id = $1', [req.params.id])
  res.json({ success: true })
})

app.patch('/api/todos/:id', requireAuth, async (req, res) => {
  const { completed } = req.body || {}
  if (completed === undefined) {
    return res.status(400).json({ error: 'completed field required' })
  }
  await pool.query('UPDATE todos SET completed = $1 WHERE id = $2', [completed, req.params.id])
  res.json({ success: true })
})

// ── Graph data ───────────────────────────────────────────────────────────────
app.get('/api/graph-data', requireAuth, async (req, res) => {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 400)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const result = {}

  const { rows: habitRows } = await pool.query(
    `SELECT date, COUNT(*) as cnt FROM habit_completions WHERE date >= $1 GROUP BY date`,
    [cutoffStr]
  )
  for (const row of habitRows) {
    result[row.date] = (result[row.date] || 0) + parseInt(row.cnt)
  }

  const { rows: todoRows } = await pool.query(
    `SELECT date, COUNT(*) as cnt FROM todos WHERE completed = TRUE AND date >= $1 GROUP BY date`,
    [cutoffStr]
  )
  for (const row of todoRows) {
    result[row.date] = (result[row.date] || 0) + parseInt(row.cnt)
  }

  res.json(result)
})

// ── SPA fallback (serve built frontend) ─────────────────────────────────────
app.use(express.static(join(__dirname, 'dist')))

app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

// ── Start ─────────────────────────────────────────────────────────────────────
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Tempo server running on port ${PORT}`)
    })
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err)
    process.exit(1)
  })
