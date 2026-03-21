import React, { useState, useEffect, useCallback } from 'react'
import ContributionGraph from './components/ContributionGraph.jsx'
import HabitTracker from './components/HabitTracker.jsx'
import TodoList from './components/TodoList.jsx'

function today() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // quota exceeded or private mode — silently fail
  }
}

export default function App() {
  const [habits, setHabits] = useState(() => loadFromStorage('habits', []))
  const [habitCompletions, setHabitCompletions] = useState(() =>
    loadFromStorage('habitCompletions', {})
  )
  const [todos, setTodos] = useState(() => loadFromStorage('todos', {}))

  // Persist habits
  useEffect(() => {
    saveToStorage('habits', habits)
  }, [habits])

  // Persist habitCompletions
  useEffect(() => {
    saveToStorage('habitCompletions', habitCompletions)
  }, [habitCompletions])

  // Persist todos
  useEffect(() => {
    saveToStorage('todos', todos)
  }, [todos])

  // Build completionData map: { "YYYY-MM-DD": count }
  const completionData = useCallback(() => {
    const data = {}

    // Count habit completions per day
    for (const [date, ids] of Object.entries(habitCompletions)) {
      if (!data[date]) data[date] = 0
      data[date] += ids.length
    }

    // Count completed todos per day
    for (const [date, items] of Object.entries(todos)) {
      const completed = items.filter((t) => t.completed).length
      if (completed > 0) {
        if (!data[date]) data[date] = 0
        data[date] += completed
      }
    }

    return data
  }, [habitCompletions, todos])

  // Compute streak for a given habit (consecutive days completed up to today)
  const getStreak = useCallback(
    (habitId) => {
      let streak = 0
      const d = new Date()
      // Start from today and go backwards
      while (true) {
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        const dateStr = `${yyyy}-${mm}-${dd}`
        const completedIds = habitCompletions[dateStr] || []
        if (completedIds.includes(habitId)) {
          streak++
          d.setDate(d.getDate() - 1)
        } else {
          break
        }
      }
      return streak
    },
    [habitCompletions]
  )

  // Habit handlers
  const handleAddHabit = useCallback((name) => {
    const newHabit = {
      id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      createdAt: new Date().toISOString(),
    }
    setHabits((prev) => [...prev, newHabit])
  }, [])

  const handleDeleteHabit = useCallback((habitId) => {
    setHabits((prev) => prev.filter((h) => h.id !== habitId))
    // Clean up completions for this habit
    setHabitCompletions((prev) => {
      const updated = {}
      for (const [date, ids] of Object.entries(prev)) {
        const filtered = ids.filter((id) => id !== habitId)
        if (filtered.length > 0) updated[date] = filtered
      }
      return updated
    })
  }, [])

  const handleToggleHabit = useCallback((habitId, date) => {
    setHabitCompletions((prev) => {
      const existing = prev[date] || []
      const alreadyDone = existing.includes(habitId)
      const updated = alreadyDone
        ? existing.filter((id) => id !== habitId)
        : [...existing, habitId]
      return { ...prev, [date]: updated }
    })
  }, [])

  // Todo handlers
  const handleAddTodo = useCallback((text, date) => {
    const newTodo = {
      id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      text: text.trim(),
      completed: false,
    }
    setTodos((prev) => {
      const existing = prev[date] || []
      return { ...prev, [date]: [...existing, newTodo] }
    })
  }, [])

  const handleDeleteTodo = useCallback((todoId, date) => {
    setTodos((prev) => {
      const existing = prev[date] || []
      const updated = existing.filter((t) => t.id !== todoId)
      if (updated.length === 0) {
        const next = { ...prev }
        delete next[date]
        return next
      }
      return { ...prev, [date]: updated }
    })
  }, [])

  const handleToggleTodo = useCallback((todoId, date) => {
    setTodos((prev) => {
      const existing = prev[date] || []
      const updated = existing.map((t) =>
        t.id === todoId ? { ...t, completed: !t.completed } : t
      )
      return { ...prev, [date]: updated }
    })
  }, [])

  const todayStr = today()
  const graphData = completionData()

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="header-logo">
            <span className="header-icon">◆</span>
            <span className="header-title">Daily Tracker</span>
          </div>
          <div className="header-date">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
        </div>
      </header>

      <main className="app-main">
        <section className="graph-section">
          <div className="section-header">
            <h2 className="section-title">Activity</h2>
            <span className="section-subtitle">Last 52 weeks</span>
          </div>
          <div className="card graph-card">
            <ContributionGraph completionData={graphData} />
          </div>
        </section>

        <div className="trackers-grid">
          <HabitTracker
            habits={habits}
            habitCompletions={habitCompletions}
            today={todayStr}
            onToggleHabit={handleToggleHabit}
            onAddHabit={handleAddHabit}
            onDeleteHabit={handleDeleteHabit}
            getStreak={getStreak}
          />
          <TodoList
            todos={todos}
            today={todayStr}
            onToggleTodo={handleToggleTodo}
            onAddTodo={handleAddTodo}
            onDeleteTodo={handleDeleteTodo}
          />
        </div>
      </main>
    </div>
  )
}
