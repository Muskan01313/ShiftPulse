<div align="center">

<img src="web/public/favicon.svg" width="72" alt="ShiftPulse logo" />

# ShiftPulse

**Time tracking for shift teams.** Analysts log each ticket and its time in one screen; managers see their team's hours by day and week.

React · .NET 8 · MongoDB

</div>

---

## What it does

| | Analyst (Member) | Manager | Admin |
|---|:-:|:-:|:-:|
| Log tickets and time for the current shift | ✅ | ✅ | ✅ |
| Change work after Submit or after the shift ends | ❌ locked | ✅ corrections, audit-logged | ✅ |
| See other people's work | ❌ | ✅ own teams only | ✅ all teams |
| Daily and weekly time summary, CSV export | ❌ | ✅ | ✅ |
| Edit dropdowns (New/BAU, Form Complexity, Status) | ❌ | ✅ | ✅ |
| Add analysts to the team | ❌ | ✅ | ✅ |
| People, roles, teams, shift times, tenant import | ❌ | ❌ | ✅ |

- **One screen per ticket.** Twelve square tiles in the team's familiar order: Recorded Time, Ticket Number, Stub Name, Domain, Analyst, New/BAU, Form Complexity, Completed Count, Total AHT, Comments, VSTS Number, Status. Press **Enter** to move to the next tile.
- **Search every dropdown.** Type "abil" to find AbileneChristianUniversity. Domain only offers the chosen tenant's programs.
- **The clock never loses time.** The server stores when you pressed Start, so a reload, a closed tab or a laptop restart doesn't matter. One timer runs at a time.
- **Shifts lock themselves.** Work belongs to the team's shift (3 PM to 12 AM IST by default; anything before 4 AM counts toward the night before). Anything left open is submitted and locked when the shift is over, and a running clock stops at the shift's end.
- **Reports arrive on their own.** A scheduled job emails each team's daily summary after the shift and the Monday–Friday summary after Friday's shift.
- **Access is enforced by the API.** Every request reloads the user from the database, so a role change or a switched-off account applies immediately.

## How it fits together

```
 React (Vite)  ──HTTPS + JWT──▶  .NET 8 API  ──▶  MongoDB Atlas
   web/                          api/              (free M0)
   Vercel / Netlify              Render (Docker)
                                    ▲
                     GitHub Actions cron (close shifts, email reports)
```

```
api/ShiftPulse.Api      Minimal API: Auth, Tickets, Manage, Admin, Jobs endpoints
api/ShiftPulse.Tests    xUnit tests for the shift and timer rules
web/                    React + TypeScript: Tracker, Team, Admin pages
render.yaml             One-click Render blueprint for the API
.github/workflows/      CI, and the scheduled shift jobs
```

## Run it on your computer

You need the [.NET 8 SDK](https://dotnet.microsoft.com/download), [Node 20+](https://nodejs.org) and MongoDB (a free Atlas cluster, or `docker run -p 27017:27017 mongo:7`).

```bash
# 1. API on http://localhost:5080 (uses api/ShiftPulse.Api/appsettings.Development.json)
cd api/ShiftPulse.Api
ASPNETCORE_URLS=http://localhost:5080 dotnet run

# 2. Web app on http://localhost:5173 (forwards /api to the API)
cd web
npm install
npm run dev
```

Sign in as `admin@shiftpulse.local` / `ChangeMe123!` (development only), then:

1. **Admin → Tenant list:** upload the tenants CSV. Only TenantId, Caption and IsActive are kept.
2. **Admin → People:** add your managers (role Manager) and analysts (role Member).
3. **Admin → Teams:** rename "My team", tick its managers, check the shift times and add report emails.

Run the tests with `dotnet test ShiftPulse.sln`.

## Put it online for free

**1. Database: MongoDB Atlas.** Create a free **M0** cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas). Add a database user, allow access from anywhere (`0.0.0.0/0`, because Render's free IPs change), and copy the connection string.

**2. API: Render.** At [render.com](https://render.com), choose **New → Blueprint** and pick this repository. Render reads `render.yaml` and asks for:

| Setting | Value |
|---|---|
| `App__MongoUri` | Atlas connection string |
| `App__CorsOrigins` | your web app's URL (fill in after step 3) |
| `App__BootstrapAdminEmail` / `App__BootstrapAdminPassword` | the first admin login, created on first start |
| `App__Smtp__*` | optional: an SMTP account for report emails (e.g. Brevo's free tier) |

`App__JwtSecret` and `App__JobKey` are generated for you.

**3. Web app: Vercel.** Import the repository at [vercel.com](https://vercel.com), set **Root Directory** to `web`, and add the environment variable `VITE_API_URL` = your Render URL. Then put the Vercel URL into Render's `App__CorsOrigins`.

**4. Scheduled jobs: GitHub Actions.** In the repository's **Settings → Secrets and variables → Actions**, add `SHIFTPULSE_API_URL` (the Render URL) and `SHIFTPULSE_JOB_KEY` (copy `App__JobKey` from Render).

> **Free-tier note.** Render's free API sleeps after 15 minutes without visitors, and the first request then takes 30–60 seconds. The job workflow wakes it before each run. If analysts find the wait annoying at the start of a shift, Render's $7/month plan keeps it awake.

## API at a glance

| Who | Endpoints |
|---|---|
| Everyone | `POST /api/auth/login` · `GET /api/me` · `POST /api/me/password` · `GET /api/options` · `GET /api/tenants` |
| Analyst (own work only) | `GET /api/tickets/shift` · `POST /api/tickets` · `PUT /api/tickets/{id}` · `POST /api/tickets/{id}/start\|pause\|time` · `DELETE /api/tickets/{id}` · `POST /api/tickets/submit` |
| Manager (own teams) | `GET /api/manage/teams` · `GET /api/manage/teams/{id}/summary\|tickets\|export.csv` · `PUT /api/manage/teams/{id}/options` · `POST /api/manage/teams/{id}/members` · `PUT /api/manage/tickets/{id}` |
| Admin | `/api/admin/users` · `/api/admin/teams` · `POST /api/admin/tenants/import` |
| Scheduler (`X-Job-Key`) | `POST /api/jobs/close-shifts\|daily-report\|weekly-report` |
