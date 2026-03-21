import express from 'express'
import pg from 'pg'
import jwt from 'jsonwebtoken'
import webpush from 'web-push'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PORT = process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET || 'changeme'
const APP_USERNAME = process.env.APP_USERNAME || 'admin'
const APP_PASSWORD = process.env.APP_PASSWORD || 'password'

webpush.setVapidDetails(
  'mailto:admin@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

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

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      endpoint TEXT UNIQUE NOT NULL,
      subscription JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_settings (
      id INT PRIMARY KEY DEFAULT 1,
      hour INT NOT NULL DEFAULT 9,
      minute INT NOT NULL DEFAULT 0,
      timezone TEXT NOT NULL DEFAULT 'UTC'
    );
    INSERT INTO notification_settings (id, hour, minute, timezone) VALUES (1, 9, 0, 'UTC') ON CONFLICT DO NOTHING;
    ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      hour INT NOT NULL,
      minute INT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'UTC'
    );
    ALTER TABLE reminders ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
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

// ── Push notifications ───────────────────────────────────────────────────────
app.post('/api/push-subscribe', requireAuth, async (req, res) => {
  const subscription = req.body
  await pool.query(
    'INSERT INTO push_subscriptions (endpoint, subscription) VALUES ($1, $2) ON CONFLICT (endpoint) DO UPDATE SET subscription = EXCLUDED.subscription',
    [subscription.endpoint, JSON.stringify(subscription)]
  )
  res.json({ success: true })
})

// ── Notification settings ────────────────────────────────────────────────────
app.get('/api/notification-settings', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT hour, minute FROM notification_settings WHERE id = 1')
  res.json(rows[0] || { hour: 9, minute: 0 })
})

app.post('/api/notification-settings', requireAuth, async (req, res) => {
  const { hour, minute, timezone } = req.body || {}
  if (hour === undefined || minute === undefined) {
    return res.status(400).json({ error: 'hour and minute are required' })
  }
  await pool.query(
    'UPDATE notification_settings SET hour = $1, minute = $2, timezone = $3 WHERE id = 1',
    [hour, minute, timezone || 'UTC']
  )
  res.json({ success: true })
})

// ── Reminders ────────────────────────────────────────────────────────────────
app.get('/api/reminders', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT id, label, hour, minute FROM reminders ORDER BY hour ASC, minute ASC')
  res.json(rows)
})

app.post('/api/reminders', requireAuth, async (req, res) => {
  const { id, label, hour, minute, timezone } = req.body || {}
  if (!id || !label || hour === undefined || minute === undefined) {
    return res.status(400).json({ error: 'id, label, hour, and minute are required' })
  }
  await pool.query(
    'INSERT INTO reminders (id, label, hour, minute, timezone) VALUES ($1, $2, $3, $4, $5)',
    [id, label, hour, minute, timezone || 'UTC']
  )
  res.json({ success: true })
})

app.delete('/api/reminders/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM reminders WHERE id = $1', [req.params.id])
  res.json({ success: true })
})

// ── Push send helper ─────────────────────────────────────────────────────────
async function pushToAll(title, body) {
  const { rows } = await pool.query('SELECT subscription FROM push_subscriptions')
  const payload = JSON.stringify({ title, body })
  for (const row of rows) {
    try {
      await webpush.sendNotification(row.subscription, payload)
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [
          row.subscription.endpoint,
        ])
      }
    }
  }
}

// ── Scheduler (checks every minute) ─────────────────────────────────────────
function localTimeInZone(timezone) {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour12: false,
  }).formatToParts(now)
  const get = (type) => parseInt(parts.find((p) => p.type === type).value)
  // hour12:false can return 24 for midnight — normalise to 0
  const hour = get('hour') % 24
  const minute = get('minute')
  const dateStr = `${get('year')}-${String(get('month')).padStart(2, '0')}-${String(get('day')).padStart(2, '0')}`
  return { hour, minute, dateStr }
}

function startScheduler() {
  const firedToday = new Set()

  setInterval(async () => {
    // Daily reminder
    const { rows: [settings] } = await pool.query(
      'SELECT hour, minute, timezone FROM notification_settings WHERE id = 1'
    )
    if (settings) {
      const { hour, minute, dateStr } = localTimeInZone(settings.timezone || 'UTC')
      const dailyKey = `daily-${dateStr}`
      if (settings.hour === hour && settings.minute === minute && !firedToday.has(dailyKey)) {
        firedToday.add(dailyKey)
        await pushToAll('Tempo', "Don't forget to log your habits today!")
      }
    }

    // Custom reminders
    const { rows: reminders } = await pool.query(
      'SELECT id, label, hour, minute, timezone FROM reminders'
    )
    for (const reminder of reminders) {
      const { hour, minute, dateStr } = localTimeInZone(reminder.timezone || 'UTC')
      const key = `reminder-${reminder.id}-${dateStr}`
      if (reminder.hour === hour && reminder.minute === minute && !firedToday.has(key)) {
        firedToday.add(key)
        await pushToAll('Tempo', reminder.label)
      }
    }

    // Clear fired set at UTC midnight
    const nowUtc = new Date()
    if (nowUtc.getUTCHours() === 0 && nowUtc.getUTCMinutes() === 0) firedToday.clear()
  }, 60 * 1000)
}

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
    startScheduler()
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err)
    process.exit(1)
  })
