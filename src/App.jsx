import React, { useState, useEffect, useCallback } from 'react'
import ContributionGraph from './components/ContributionGraph.jsx'
import HabitTracker from './components/HabitTracker.jsx'
import TodoList from './components/TodoList.jsx'
import Login from './components/Login.jsx'
import { apiFetch } from './api.js'

function today() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [habits, setHabits] = useState([])
  const [habitCompletions, setHabitCompletions] = useState({})
  const [todos, setTodos] = useState([])
  const [graphData, setGraphData] = useState({})
  const [loading, setLoading] = useState(true)

  const todayStr = today()

  function handleLogin(newToken) {
    localStorage.setItem('token', newToken)
    setToken(newToken)
  }

  function handleLogout() {
    localStorage.removeItem('token')
    setToken(null)
  }

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [habitsRes, completionsRes, todosRes, graphRes] = await Promise.all([
        apiFetch('/api/habits'),
        apiFetch('/api/habit-completions'),
        apiFetch(`/api/todos?date=${todayStr}`),
        apiFetch('/api/graph-data'),
      ])

      if (habitsRes.ok) setHabits(await habitsRes.json())
      if (completionsRes.ok) setHabitCompletions(await completionsRes.json())
      if (todosRes.ok) setTodos(await todosRes.json())
      if (graphRes.ok) setGraphData(await graphRes.json())
    } catch {
      // Network error — leave state as-is
    } finally {
      setLoading(false)
    }
  }, [todayStr])

  useEffect(() => {
    if (token) fetchAll()
  }, [token, fetchAll])

  // ── Streak helper ──────────────────────────────────────────────────────────
  const getStreak = useCallback(
    (habitId) => {
      let streak = 0
      const d = new Date()
      while (true) {
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        const dateStr = `${yyyy}-${mm}-${dd}`
        const ids = habitCompletions[dateStr] || []
        if (ids.includes(habitId)) {
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

  // ── Habit handlers ─────────────────────────────────────────────────────────
  const handleAddHabit = useCallback(async (name) => {
    const newHabit = {
      id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      created_at: new Date().toISOString(),
    }
    // Optimistic update
    setHabits((prev) => [...prev, newHabit])
    try {
      await apiFetch('/api/habits', {
        method: 'POST',
        body: JSON.stringify(newHabit),
      })
    } catch {
      // Rollback on failure
      setHabits((prev) => prev.filter((h) => h.id !== newHabit.id))
    }
  }, [])

  const handleDeleteHabit = useCallback(async (habitId) => {
    setHabits((prev) => prev.filter((h) => h.id !== habitId))
    // Remove from completions optimistically
    setHabitCompletions((prev) => {
      const updated = {}
      for (const [date, ids] of Object.entries(prev)) {
        const filtered = ids.filter((id) => id !== habitId)
        if (filtered.length > 0) updated[date] = filtered
      }
      return updated
    })
    try {
      await apiFetch(`/api/habits/${habitId}`, { method: 'DELETE' })
      // Refresh graph data after delete (cascade removes completions)
      const graphRes = await apiFetch('/api/graph-data')
      if (graphRes.ok) setGraphData(await graphRes.json())
    } catch {
      // Re-fetch to restore consistent state
      fetchAll()
    }
  }, [fetchAll])

  const handleToggleHabit = useCallback(async (habitId, date) => {
    const existing = habitCompletions[date] || []
    const alreadyDone = existing.includes(habitId)

    // Optimistic update
    setHabitCompletions((prev) => {
      const cur = prev[date] || []
      const updated = alreadyDone ? cur.filter((id) => id !== habitId) : [...cur, habitId]
      return { ...prev, [date]: updated }
    })

    // Update graph data optimistically
    setGraphData((prev) => {
      const current = prev[date] || 0
      return { ...prev, [date]: alreadyDone ? Math.max(0, current - 1) : current + 1 }
    })

    try {
      if (alreadyDone) {
        await apiFetch(`/api/habit-completions/${habitId}/${date}`, { method: 'DELETE' })
      } else {
        await apiFetch(`/api/habit-completions/${habitId}/${date}`, { method: 'POST' })
      }
    } catch {
      // Rollback
      setHabitCompletions((prev) => {
        const cur = prev[date] || []
        const reverted = alreadyDone ? [...cur, habitId] : cur.filter((id) => id !== habitId)
        return { ...prev, [date]: reverted }
      })
      setGraphData((prev) => {
        const current = prev[date] || 0
        return { ...prev, [date]: alreadyDone ? current + 1 : Math.max(0, current - 1) }
      })
    }
  }, [habitCompletions])

  // ── Todo handlers ──────────────────────────────────────────────────────────
  const handleAddTodo = useCallback(async (text, date) => {
    const newTodo = {
      id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date,
      text: text.trim(),
      completed: false,
    }
    // Optimistic update
    setTodos((prev) => [...prev, newTodo])
    try {
      await apiFetch('/api/todos', {
        method: 'POST',
        body: JSON.stringify({ id: newTodo.id, date: newTodo.date, text: newTodo.text }),
      })
    } catch {
      setTodos((prev) => prev.filter((t) => t.id !== newTodo.id))
    }
  }, [])

  const handleDeleteTodo = useCallback(async (todoId) => {
    const removed = todos.find((t) => t.id === todoId)
    setTodos((prev) => prev.filter((t) => t.id !== todoId))
    // Update graph if the todo was completed
    if (removed && removed.completed) {
      setGraphData((prev) => {
        const date = removed.date
        return { ...prev, [date]: Math.max(0, (prev[date] || 0) - 1) }
      })
    }
    try {
      await apiFetch(`/api/todos/${todoId}`, { method: 'DELETE' })
    } catch {
      if (removed) setTodos((prev) => [...prev, removed])
    }
  }, [todos])

  const handleToggleTodo = useCallback(async (todoId) => {
    const todo = todos.find((t) => t.id === todoId)
    if (!todo) return
    const nowCompleted = !todo.completed

    // Optimistic update
    setTodos((prev) =>
      prev.map((t) => (t.id === todoId ? { ...t, completed: nowCompleted } : t))
    )
    setGraphData((prev) => {
      const date = todo.date
      const current = prev[date] || 0
      return { ...prev, [date]: nowCompleted ? current + 1 : Math.max(0, current - 1) }
    })

    try {
      await apiFetch(`/api/todos/${todoId}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: nowCompleted }),
      })
    } catch {
      // Rollback
      setTodos((prev) =>
        prev.map((t) => (t.id === todoId ? { ...t, completed: todo.completed } : t))
      )
      setGraphData((prev) => {
        const date = todo.date
        const current = prev[date] || 0
        return { ...prev, [date]: nowCompleted ? Math.max(0, current - 1) : current + 1 }
      })
    }
  }, [todos])

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!token) {
    return <Login onLogin={handleLogin} />
  }

  // Build todos map for today (TodoList expects { [date]: [todo, ...] } shape)
  const todosMap = { [todayStr]: todos }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="header-logo">
            <span className="header-icon">◆</span>
            <span className="header-title">tempo</span>
          </div>
          <div className="header-right">
            <div className="header-date">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </div>
            <button className="logout-btn" onClick={handleLogout} title="Sign out">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <span>Loading your data…</span>
          </div>
        ) : (
          <>
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
                todos={todosMap}
                today={todayStr}
                onToggleTodo={(todoId) => handleToggleTodo(todoId)}
                onAddTodo={handleAddTodo}
                onDeleteTodo={(todoId) => handleDeleteTodo(todoId)}
              />
            </div>
          </>
        )}
      </main>
    </div>
  )
}
