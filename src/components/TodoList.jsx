import React, { useState, useCallback } from 'react'

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

export default function TodoList({
  todos,
  today,
  onToggleTodo,
  onAddTodo,
  onDeleteTodo,
}) {
  const [inputValue, setInputValue] = useState('')

  const todayTodos = todos[today] || []
  const completedCount = todayTodos.filter((t) => t.completed).length
  const totalCount = todayTodos.length

  const handleAdd = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    onAddTodo(trimmed, today)
    setInputValue('')
  }, [inputValue, onAddTodo, today])

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') handleAdd()
    },
    [handleAdd]
  )

  return (
    <div className="tracker-card">
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
            <div key={todo.id} className="todo-row">
              <button
                className={`todo-checkbox${todo.completed ? ' checked' : ''}`}
                onClick={() => onToggleTodo(todo.id, today)}
                aria-label={todo.completed ? 'Mark incomplete' : 'Mark complete'}
                title={todo.completed ? 'Mark incomplete' : 'Mark complete'}
              >
                {todo.completed ? '✓' : ''}
              </button>

              <span className={`todo-text${todo.completed ? ' done' : ''}`}>
                {todo.text}
              </span>

              <button
                className="delete-btn"
                onClick={() => onDeleteTodo(todo.id, today)}
                aria-label="Delete task"
                title="Delete task"
              >
                ✕
              </button>
            </div>
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
        <input
          className="add-input"
          type="text"
          placeholder="Add a task for today…"
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
  )
}
