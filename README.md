<div align="center">

# ◆ tempo

**I refused to pay $5/month for a habit tracker. Now I pay $5/month to host my own server.**

Built for personal use after not wanting to pay for yet another productivity app. Single-user and self-hosted — includes a GitHub-style heatmap because apparently I can't track my habits without it looking like a contribution graph.

<br/>

[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://postgresql.org)

<br/>

<img src="docs/screenshot-main.png" width="900" alt="tempo main view" />

</div>

---

## What's in it

**Habits** — recurring things you want to do every day. Each one tracks a streak so you can see how long your current run is.

**Tasks** — one-off to-dos tied to a date. Add something for today or pick a day up to two weeks out; anything future shows up in an upcoming section below today's list.

**Heatmap** — 52-week contribution graph that counts completed habits and tasks per day. Useful for seeing gaps and patterns at a glance.

**Reminders** — set a daily nudge at a fixed time, or attach a one-off notification to any individual task.

**Works as a phone app** — open the site in Safari on your iPhone, tap the share button, and choose "Add to Home Screen". It installs like a native app with its own icon, runs full screen, and supports push notifications.

---

## Preview

<details>
<summary><strong>Heatmap</strong></summary>
<br/>
<p align="center">
  <img src="docs/screenshot-heatmap.png" width="860" alt="Activity heatmap" />
</p>
</details>

<details>
<summary><strong>Habits & Tasks</strong></summary>
<br/>
<p align="center">
  <img src="docs/screenshot-habits.png" width="420" alt="Habit tracker" />
  &nbsp;&nbsp;
  <img src="docs/screenshot-tasks.png" width="420" alt="Task planning" />
</p>
</details>

<details>
<summary><strong>Notifications</strong></summary>
<br/>
<p align="center">
  <img src="docs/screenshot-notifications.png" width="500" alt="Notification settings" />
</p>
</details>

---

## Running locally

### Prerequisites
- Node.js 18+
- PostgreSQL

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Create local database (skip if using a hosted DB)
createdb tempo

# 3. Configure environment
cp .env.example .env   # then fill in your values
```

<details>
<summary><strong>.env reference</strong></summary>

```env
DATABASE_URL=postgresql://localhost/tempo
APP_USERNAME=your_username
APP_PASSWORD=your_password
JWT_SECRET=any_random_string
PORT=3000
NODE_ENV=development

# Generate with: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VITE_VAPID_PUBLIC_KEY=...
```

> Using Supabase, Neon, or Railway? Create the database in their dashboard and paste the connection string as `DATABASE_URL`. Tables are created automatically on first run.

</details>

```bash
# 4. Start the backend
npm start          # http://localhost:3000

# 5. Start the frontend (new terminal)
npm run dev        # http://localhost:5173
```

---

## Project structure

```
tempo/
├── server.js                   # Express API + DB schema
├── src/
│   ├── App.jsx                 # Root component, state, data fetching
│   ├── App.css                 # All styles
│   ├── api.js                  # Fetch wrapper with JWT auth
│   ├── push.js                 # Web Push registration
│   └── components/
│       ├── ContributionGraph.jsx
│       ├── HabitTracker.jsx
│       ├── TodoList.jsx
│       ├── Settings.jsx
│       └── Login.jsx
└── public/
    └── sw.js                   # Service worker for push notifications
```
