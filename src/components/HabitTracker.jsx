import React, { useState, useCallback } from 'react'

export default function HabitTracker({
  habits,
  habitCompletions,
  today,
  onToggleHabit,
  onAddHabit,
  onDeleteHabit,
  getStreak,
}) {
  const [inputValue, setInputValue] = useState('')

  const todayCompletions = habitCompletions[today] || []
  const doneCount = habits.filter((h) => todayCompletions.includes(h.id)).length
  const totalCount = habits.length
  const allDone = totalCount > 0 && doneCount === totalCount

  const handleAdd = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    onAddHabit(trimmed)
    setInputValue('')
  }, [inputValue, onAddHabit])

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') handleAdd()
    },
    [handleAdd]
  )

  return (
    <div className="tracker-card">
      <div className="tracker-card-header">
        <h3 className="tracker-card-title">Daily Habits</h3>
        <div className="tracker-card-meta">
          {totalCount > 0 && (
            <span className="badge">
              {doneCount}/{totalCount} done
            </span>
          )}
        </div>
      </div>

      <div className="tracker-list">
        {habits.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">✦</div>
            <div>No habits yet.</div>
            <div>Add one to get started!</div>
          </div>
        ) : (
          habits.map((habit) => {
            const isDone = todayCompletions.includes(habit.id)
            const streak = getStreak(habit.id)
            return (
              <div key={habit.id} className="habit-row">
                <button
                  className={`habit-toggle${isDone ? ' done' : ''}`}
                  onClick={() => onToggleHabit(habit.id, today)}
                  aria-label={isDone ? 'Mark incomplete' : 'Mark complete'}
                  title={isDone ? 'Mark incomplete' : 'Mark complete'}
                >
                  {isDone ? '✓' : ''}
                </button>

                <div className="habit-info">
                  <span className={`habit-name${isDone ? ' done' : ''}`}>
                    {habit.name}
                  </span>
                  {streak > 0 && (
                    <span className="streak-badge" title={`${streak} day streak`}>
                      <span className="streak-icon">🔥</span>
                      {streak}
                    </span>
                  )}
                </div>

                <button
                  className="delete-btn"
                  onClick={() => onDeleteHabit(habit.id)}
                  aria-label="Delete habit"
                  title="Delete habit"
                >
                  ✕
                </button>
              </div>
            )
          })
        )}
      </div>

      {allDone && (
        <div className="celebration-banner">
          <span>🎉</span>
          <span>All habits done for today! Great work!</span>
        </div>
      )}

      <div className="add-input-area">
        <input
          className="add-input"
          type="text"
          placeholder="Add a new habit…"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={80}
        />
        <button
          className="add-btn"
          onClick={handleAdd}
          aria-label="Add habit"
          title="Add habit"
          disabled={!inputValue.trim()}
        >
          +
        </button>
      </div>
    </div>
  )
}
