import React, { useState, useCallback, useRef, useEffect } from 'react'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDateStr(date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  // Use local date to avoid UTC shift
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getLevel(count) {
  if (!count || count === 0) return 0
  if (count <= 2) return 1
  if (count <= 4) return 2
  if (count <= 7) return 3
  return 4
}

function buildWeeks() {
  // Today
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = formatDateStr(today)

  // Find the most recent Sunday (start of current week)
  const currentSunday = new Date(today)
  currentSunday.setDate(today.getDate() - today.getDay())

  // Go back 51 more weeks to get the start Sunday (52 total weeks)
  const startSunday = new Date(currentSunday)
  startSunday.setDate(currentSunday.getDate() - 51 * 7)

  const weeks = []
  const cursor = new Date(startSunday)

  for (let w = 0; w < 52; w++) {
    const week = []
    for (let d = 0; d < 7; d++) {
      const dateStr = formatDateStr(cursor)
      const isFuture = cursor > today
      week.push({
        dateStr,
        isFuture,
        isToday: dateStr === todayStr,
        month: cursor.getMonth(),
        year: cursor.getFullYear(),
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  }

  return weeks
}

function buildMonthLabels(weeks) {
  // For each week column, figure out if we should show a month label
  // Show the month label when the month changes from the previous week
  const labels = []

  let prevMonth = null
  for (let w = 0; w < weeks.length; w++) {
    const week = weeks[w]
    // Use the first non-null cell's month
    const firstCell = week[0]
    const month = firstCell ? firstCell.month : null

    if (month !== null && month !== prevMonth) {
      labels.push({ weekIndex: w, label: MONTHS[month] })
      prevMonth = month
    } else {
      labels.push(null)
    }
  }

  return labels
}

// Width of each cell + gap
const CELL_SIZE = 11
const CELL_GAP = 2
const COL_STEP = CELL_SIZE + CELL_GAP

export default function ContributionGraph({ completionData }) {
  const [tooltip, setTooltip] = useState(null)
  const scrollRef = useRef(null)

  const weeks = buildWeeks()
  const monthLabels = buildMonthLabels(weeks)

  // Scroll to the rightmost (most recent) week on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
    }
  }, [])

  const handleMouseEnter = useCallback((e, cell) => {
    if (cell.isFuture) return
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltip({
      x: rect.left + rect.width / 2,
      y: rect.top + window.scrollY,
      dateStr: cell.dateStr,
      count: completionData[cell.dateStr] || 0,
    })
  }, [completionData])

  const handleMouseLeave = useCallback(() => {
    setTooltip(null)
  }, [])

  // Build month label groups: each group spans all weeks in that month
  const monthGroups = []
  for (let i = 0; i < monthLabels.length; i++) {
    const lbl = monthLabels[i]
    if (lbl) {
      let span = 1
      for (let j = i + 1; j < monthLabels.length; j++) {
        if (monthLabels[j]) break
        span++
      }
      // Width = N cells + (N-1) gaps, matching the week columns below
      monthGroups.push({
        label: lbl.label,
        weekIndex: i,
        width: span * CELL_SIZE + (span - 1) * CELL_GAP,
      })
    }
  }

  return (
    <div className="graph-wrapper" ref={scrollRef}>
      <div className="graph-inner">
        {/* Graph body: day labels | (month row above grid columns) */}
        <div className="graph-body">
          {/* Day labels */}
          <div className="graph-day-labels">
            {DAYS.map((day, di) => (
              <div key={day} className="graph-day-label">
                {di % 2 === 1 ? day.slice(0, 1) : ''}
              </div>
            ))}
          </div>

          {/* Right side: month labels perfectly above grid columns */}
          <div className="graph-right">
            {/* One label div per week — same width as week column, text overflows right */}
            <div className="graph-month-row">
              {weeks.map((week, wi) => {
                const lbl = monthLabels[wi]
                return (
                  <div key={`ml-${wi}`} className="graph-month-label">
                    {lbl ? lbl.label : ''}
                  </div>
                )
              })}
            </div>

            {/* Week columns */}
            <div className="graph-columns">
              {weeks.map((week, wi) => (
                <div key={`week-${wi}`} className="graph-week-col">
                  {week.map((cell, di) => {
                    const count = completionData[cell.dateStr] || 0
                    const level = cell.isFuture ? 0 : getLevel(count)
                    let cellClass = 'graph-cell'
                    if (cell.isFuture) cellClass += ' future'

                    return (
                      <div
                        key={`${wi}-${di}`}
                        className={cellClass}
                        data-level={level}
                        title=""
                        onMouseEnter={(e) => handleMouseEnter(e, cell)}
                        onMouseLeave={handleMouseLeave}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="graph-legend">
          <span className="graph-legend-label">Less</span>
          <div className="graph-legend-cells">
            {[0, 1, 2, 3, 4].map((lvl) => (
              <div
                key={lvl}
                className="graph-legend-cell"
                data-level={lvl}
                style={{
                  background:
                    lvl === 0
                      ? 'var(--level-0)'
                      : lvl === 1
                      ? 'var(--level-1)'
                      : lvl === 2
                      ? 'var(--level-2)'
                      : lvl === 3
                      ? 'var(--level-3)'
                      : 'var(--level-4)',
                }}
              />
            ))}
          </div>
          <span className="graph-legend-label">More</span>
        </div>
      </div>

      {/* Tooltip rendered via fixed position */}
      {tooltip && (
        <div
          className="graph-tooltip"
          style={{
            left: tooltip.x,
            top: tooltip.y - 8,
          }}
        >
          {tooltip.count === 0
            ? `No completions — ${formatDisplayDate(tooltip.dateStr)}`
            : `${tooltip.count} completion${tooltip.count !== 1 ? 's' : ''} — ${formatDisplayDate(tooltip.dateStr)}`}
        </div>
      )}
    </div>
  )
}
