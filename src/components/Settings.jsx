import React, { useState, useEffect } from 'react'
import { apiFetch } from '../api.js'

const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

function pad(n) {
  return String(n).padStart(2, '0')
}

function toTimeString(hour, minute) {
  return `${pad(hour)}:${pad(minute)}`
}

function fromTimeString(str) {
  const [h, m] = str.split(':').map(Number)
  return { hour: h, minute: m }
}

export default function Settings({ onBack }) {
  const [dailyTime, setDailyTime] = useState('09:00')
  const [dayStartTime, setDayStartTime] = useState('00:00')
  const [reminders, setReminders] = useState([])
  const [newLabel, setNewLabel] = useState('')
  const [newTime, setNewTime] = useState('09:00')
  const [saved, setSaved] = useState(false)
  const [dayStartSaved, setDayStartSaved] = useState(false)

  useEffect(() => {
    apiFetch('/api/notification-settings')
      .then((r) => r.json())
      .then((d) => {
        setDailyTime(toTimeString(d.hour, d.minute))
        setDayStartTime(toTimeString(d.day_start_hour ?? 0, d.day_start_minute ?? 0))
      })

    apiFetch('/api/reminders')
      .then((r) => r.json())
      .then(setReminders)
  }, [])

  async function saveDailyTime() {
    const { hour, minute } = fromTimeString(dailyTime)
    const { hour: dsh, minute: dsm } = fromTimeString(dayStartTime)
    await apiFetch('/api/notification-settings', {
      method: 'POST',
      body: JSON.stringify({ hour, minute, timezone: TIMEZONE, day_start_hour: dsh, day_start_minute: dsm }),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function saveDayStart() {
    const { hour, minute } = fromTimeString(dailyTime)
    const { hour: dsh, minute: dsm } = fromTimeString(dayStartTime)
    await apiFetch('/api/notification-settings', {
      method: 'POST',
      body: JSON.stringify({ hour, minute, timezone: TIMEZONE, day_start_hour: dsh, day_start_minute: dsm }),
    })
    setDayStartSaved(true)
    setTimeout(() => setDayStartSaved(false), 2000)
  }

  async function addReminder(e) {
    e.preventDefault()
    if (!newLabel.trim()) return
    const { hour, minute } = fromTimeString(newTime)
    const id = `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const reminder = { id, label: newLabel.trim(), hour, minute, timezone: TIMEZONE }
    setReminders((prev) =>
      [...prev, reminder].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
    )
    setNewLabel('')
    await apiFetch('/api/reminders', {
      method: 'POST',
      body: JSON.stringify(reminder),
    })
  }

  async function deleteReminder(id) {
    setReminders((prev) => prev.filter((r) => r.id !== id))
    await apiFetch(`/api/reminders/${id}`, { method: 'DELETE' })
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="header-logo">
            <span className="header-icon">◆</span>
            <span className="header-title">tempo</span>
          </div>
          <div className="header-right">
            <button className="logout-btn" onClick={onBack}>
              ← Back
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        <section>
          <div className="section-header">
            <h2 className="section-title">Notifications</h2>
            <span className="section-subtitle">{TIMEZONE}</span>
          </div>

          {/* Daily reminder */}
          <div className="card settings-card">
            <div className="settings-section-title">Daily habit reminder</div>
            <p className="settings-description">
              Get a daily nudge to log your habits.
            </p>
            <div className="settings-row">
              <input
                type="time"
                className="settings-time-input"
                value={dailyTime}
                onChange={(e) => setDailyTime(e.target.value)}
              />
              <button className="settings-save-btn" onClick={saveDailyTime}>
                {saved ? 'Saved!' : 'Save'}
              </button>
            </div>
          </div>

          {/* Day start */}
          <div className="card settings-card" style={{ marginTop: 16 }}>
            <div className="settings-section-title">Day starts at</div>
            <p className="settings-description">
              Habits and tasks completed after midnight but before this time will count for the previous day.
            </p>
            <div className="settings-row">
              <input
                type="time"
                className="settings-time-input"
                value={dayStartTime}
                onChange={(e) => setDayStartTime(e.target.value)}
              />
              <button className="settings-save-btn" onClick={saveDayStart}>
                {dayStartSaved ? 'Saved!' : 'Save'}
              </button>
            </div>
          </div>

          {/* Custom reminders */}
          <div className="card settings-card" style={{ marginTop: 16 }}>
            <div className="settings-section-title">Custom reminders</div>
            <p className="settings-description">
              Set reminders for specific tasks at specific times, every day.
            </p>

            {reminders.length > 0 && (
              <ul className="reminders-list">
                {reminders.map((r) => (
                  <li key={r.id} className="reminder-item">
                    <span className="reminder-time">{toTimeString(r.hour, r.minute)}</span>
                    <span className="reminder-label">{r.label}</span>
                    <button
                      className="reminder-delete-btn"
                      onClick={() => deleteReminder(r.id)}
                      title="Delete"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form className="reminder-form" onSubmit={addReminder}>
              <input
                type="time"
                className="settings-time-input"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
              />
              <input
                type="text"
                className="reminder-label-input"
                placeholder="Reminder message…"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
              <button type="submit" className="settings-save-btn">Add</button>
            </form>
          </div>
        </section>
      </main>
    </div>
  )
}
