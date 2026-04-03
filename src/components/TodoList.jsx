import React, { useState, useCallback, useEffect, useRef } from 'react'
import { TbBellPlus } from 'react-icons/tb'
import { apiFetch } from '../api.js'

const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function getDayChipLabel(dateStr, today) {
  if (dateStr === today) return 'Today'
  if (dateStr === addDays(today, 1)) return 'Tomorrow'
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function ReminderModal({ todo, onClose }) {
  const now = new Date()
  const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const [time, setTime] = useState(defaultTime)
  const [saved, setSaved] = useState(false)
  const modalRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (modalRef.current && !modalRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [onClose])

  async function handleSave() {
    const [hour, minute] = time.split(':').map(Number)
    const id = `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    await apiFetch('/api/reminders', {
      method: 'POST',
      body: JSON.stringify({ id, label: todo.text, hour, minute, timezone: TIMEZONE }),
    })
    setSaved(true)
    setTimeout(onClose, 900)
  }

  return (
    <div className="reminder-modal-backdrop">
      <div className="reminder-modal" ref={modalRef}>
        <div className="reminder-modal-title">Set reminder</div>
        <div className="reminder-modal-label">{todo.text}</div>
        <input
          type="time"
          className="settings-time-input"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          autoFocus
        />
        <div className="reminder-modal-actions">
          <button className="reminder-modal-cancel" onClick={onClose}>Cancel</button>
          <button className="settings-save-btn" onClick={handleSave}>
            {saved ? 'Saved!' : 'Set reminder'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TodoRow({ todo, onToggle, onDelete, onRemind }) {
  return (
    <div className="todo-row">
      <button
        className={`todo-checkbox${todo.completed ? ' checked' : ''}`}
        onClick={() => onToggle(todo.id)}
        aria-label={todo.completed ? 'Mark incomplete' : 'Mark complete'}
        title={todo.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {todo.completed ? '✓' : ''}
      </button>

      <span className={`todo-text${todo.completed ? ' done' : ''}`}>
        {todo.text}
      </span>

      <button
        className="todo-remind-btn"
        onClick={() => onRemind(todo)}
        aria-label="Set reminder"
        title="Set reminder"
      >
        <TbBellPlus size={15} />
      </button>

      <button
        className="delete-btn"
        onClick={() => onDelete(todo.id)}
        aria-label="Delete task"
        title="Delete task"
      >
        ✕
      </button>
    </div>
  )
}

export default function TodoList({
  todos,
  today,
  onToggleTodo,
  onAddTodo,
  onDeleteTodo,
}) {
  const [inputValue, setInputValue] = useState('')
  const [selectedDate, setSelectedDate] = useState(today)
  const [reminderTodo, setReminderTodo] = useState(null)

  // Keep selectedDate in sync if today changes (e.g. day rollover)
  useEffect(() => {
    setSelectedDate(today)
  }, [today])

  const todayTodos = todos[today] || []
  const completedCount = todayTodos.filter((t) => t.completed).length
  const totalCount = todayTodos.length

  // Future dates that have planned todos
  const futureDates = Object.keys(todos)
    .filter((d) => d > today)
    .sort()

  // Day chips: today + next 6 days
  const dayChips = Array.from({ length: 7 }, (_, i) => addDays(today, i))

  const handleAdd = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    onAddTodo(trimmed, selectedDate)
    setInputValue('')
  }, [inputValue, onAddTodo, selectedDate])

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') handleAdd()
    },
    [handleAdd]
  )

  const chipLabel = getDayChipLabel(selectedDate, today).toLowerCase()
  const placeholder = selectedDate === today
    ? 'Add a task for today…'
    : `Add a task for ${chipLabel}…`

  return (
    <div className="tracker-card">
      {reminderTodo && (
        <ReminderModal todo={reminderTodo} onClose={() => setReminderTodo(null)} />
      )}

      <div className="tracker-card-header">
        <h3 className="tracker-card-title">Today's Tasks</h3>
        <div className="tracker-card-meta">
          {totalCount > 0 && (
            <span className="badge">
              {completedCount}/{totalCount} done
            </span>
          )}
          <span className="badge-date">{formatDisplayDate(today)}</span>
        </div>
      </div>

      <div className="tracker-list">
        {todayTodos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">○</div>
            <div>No tasks for today.</div>
            <div>Add something to get going!</div>
          </div>
        ) : (
          todayTodos.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              onToggle={onToggleTodo}
              onDelete={onDeleteTodo}
              onRemind={setReminderTodo}
            />
          ))
        )}
      </div>

      {totalCount > 0 && completedCount === totalCount && (
        <div className="celebration-banner">
          <span>✅</span>
          <span>All tasks complete! Enjoy your day!</span>
        </div>
      )}

      <div className="add-input-area">
        <div className="day-picker">
          {dayChips.map((date) => (
            <button
              key={date}
              className={`day-chip${selectedDate === date ? ' selected' : ''}`}
              onClick={() => setSelectedDate(date)}
            >
              {getDayChipLabel(date, today)}
            </button>
          ))}
        </div>
        <div className="add-input-row">
          <input
            className="add-input"
            type="text"
            placeholder={placeholder}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={120}
          />
          <button
            className="add-btn"
            onClick={handleAdd}
            aria-label="Add task"
            title="Add task"
            disabled={!inputValue.trim()}
          >
            +
          </button>
        </div>
      </div>

      {futureDates.length > 0 && (
        <div className="upcoming-section">
          <div className="upcoming-section-title">Upcoming</div>
          {futureDates.map((date) => {
            const dateTodos = todos[date] || []
            const doneCount = dateTodos.filter((t) => t.completed).length
            return (
              <div key={date} className="upcoming-group">
                <div className="upcoming-date-header">
                  <span>{formatDisplayDate(date)}</span>
                  <span className="badge">{doneCount}/{dateTodos.length} done</span>
                </div>
                {dateTodos.map((todo) => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    onToggle={onToggleTodo}
                    onDelete={onDeleteTodo}
                    onRemind={setReminderTodo}
                  />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
