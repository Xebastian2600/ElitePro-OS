ELITEPRO OS LITE — README
=========================

ElitePro OS Lite is a small CRM for the front desk and management:
customers, vehicles, leads, quotes, jobs, follow-ups, the Command Center
and the activity log. It runs in the browser (React + Vite) on a
Supabase database (Postgres).

Picture overview of what the app can do: docs/app-summary.png

This file covers (Summary):
1. What you need: Git, Node.js 22 or newer, and Docker Desktop.
2. First-time start: clone, install, start the local database, create .env.local, run the app, open http://localhost:5173. It warns never to use the service-role key.
3. Starting again on later days, including applying new database changes after a git pull.
4. Creating a user account: the app has no sign-up screen, so accounts are created in Supabase Studio at http://127.0.0.1:54323.
5. How to use each part: Pricing setup first, then the Front desk, new leads, working a lead, quotes, jobs, follow-ups, the Command Center, Activity, and Integrations with the CSV import format.
6. Stopping the app, with a warning that npx supabase db reset deletes all local data.
7. Running the tests.
8. Troubleshooting: Docker not running, missing .env.local, sign-in problems, the port already in use, errors after pulling new code, and "Tax rule not configured".


1. WHAT YOU NEED
----------------
- Git
- Node.js 22 or newer (check with: node -v)
- Docker Desktop, installed and running. The local database runs in
  Docker containers.

No other installs are needed. The Supabase command-line tool comes with
the project and is run with "npx supabase ...".


2. START THE APP LOCALLY (FIRST TIME)
-------------------------------------
Run these in a terminal, from the project folder.

  a) Get the code and install packages

       git clone https://github.com/Xebastian2600/ElitePro-OS.git
       cd ElitePro-OS
       npm install

  b) Start Docker Desktop and wait until it says it is running.

  c) Start the local database

       npx supabase start

     The first run downloads the Docker images and takes a few minutes.
     When it finishes it creates all tables from supabase/migrations.

  d) Create the settings file .env.local in the project folder

     Show the local connection values:

       npx supabase status -o env

     Create a file named .env.local with these two lines, copying the
     values from that output:

       VITE_SUPABASE_URL=<value of API_URL>
       VITE_SUPABASE_ANON_KEY=<value of ANON_KEY>

     Use ANON_KEY only. NEVER put SERVICE_ROLE_KEY in this file or in any
     VITE_ setting: it bypasses all security and would be sent to the
     browser. .env.local is ignored by git; never commit it.

     Optional: VITE_KB_SEARCH_URL=<knowledge base search endpoint>. Leave
     it out until a knowledge base is connected. The KB panel then shows
     "Knowledge base not connected".

  e) Start the app

       npm run dev

     Open http://localhost:5173 in your browser.

  f) Create a user account (see section 4) and sign in.


3. START THE APP AGAIN (EVERY OTHER DAY)
----------------------------------------
  1. Start Docker Desktop.
  2. npx supabase start
  3. npm run dev
  4. Open http://localhost:5173

Your data is kept between restarts.

If someone added new database migrations (git pull brought new files in
supabase/migrations), apply them with:

       npx supabase migration up


4. CREATE A USER ACCOUNT
------------------------
The app has no sign-up screen. Create accounts in Supabase Studio:

  1. Open http://127.0.0.1:54323
  2. Go to Authentication > Users > Add user > Create new user.
  3. Enter an email and a password, then create the user.
  4. Sign in to the app with that email and password.

Every signed-in user can use every part of the app, including Pricing
settings. There are no roles yet.


5. HOW TO OPERATE THE APP
-------------------------
Top menu: Customers, Leads, Jobs, Quotes, Pricing, Command Center,
Follow-ups, Activity, Integrations. On narrower screens the menu is behind
the menu button in the top-left corner. A separate "VIN tool" button next
to your account email (top-right) opens a side panel for scanning or
checking VINs; see VIN TOOL below.

FIRST-TIME SETUP: PRICING (do this before quoting)
  Open Pricing. No prices or tax rates are filled in; the app never
  guesses them. Set:
  - Tax: the rate in percent, and which item types are taxable.
    Quotes cannot be presented until tax is set.
  - Glass / Labor / ADAS calibration / Additional part (optional):
    "Markup % of cost", "Markup $ on cost" or "Fixed price". These fill in
    suggested prices when you click "Use rule" on a quote line.
  - Discount (optional): the maximum discount percent.
  Changes only affect quotes saved afterwards. Saved quotes keep the rules
  they were saved with.

FRONT DESK (home page)
  Search for a customer by name, phone or email, or click "New lead".

NEW LEAD
  1. Leads > New lead (or "New lead" on the home page).
  2. Enter the phone or email first. If the customer already exists, the
     app shows the match so you don't create a duplicate.
  3. Pick or add the vehicle (VIN, year/make/model, glass type, ADAS
     status).
  4. Enter the source and request, then Create lead.

WORKING A LEAD
  On the lead page you can:
  - change the status (New, Contacted, Qualified, Quoted, Follow-up,
    Booked, Lost). Lost requires a reason.
  - see the Copilot: missing information and the next step, e.g. "Ask
    customer for VIN."
  - search the knowledge base (once one is connected).
  - add follow-ups.
  - start a quote: "New quote".

QUOTES
  1. From a lead, click "New quote", then "Create quote".
  2. Add lines (Glass, Labor, ADAS calibration, Additional part,
     Discount). "Use rule" fills the price from Pricing settings.
  3. Click Save. The breakdown shows every line, subtotal, tax and total.
  4. Move the status: Draft > Presented > Follow-up > Approved (or Lost,
     which requires a reason). Save changes before changing the status.
     Presenting a quote moves its lead to "Quoted".
  5. "Customer-ready summary" gives text you can copy to the customer.
  6. Approved quotes are locked. Use "Create job" on the approved quote to
     book the job; the lead becomes "Booked".

JOBS
  Jobs lists all jobs. On a job page you can change the status, set the
  appointment, address and notes, and add follow-ups.

FOLLOW-UPS
  Add a follow-up from any lead, quote or job page ("Add follow-up": what
  to do, when, and who owns it). The Follow-ups page lists them as
  Overdue, Due today, Upcoming, All open and Done, filtered by owner.
  One-click buttons:
  - Contacted: marks it done. A New lead becomes Contacted; a Presented
    quote becomes Follow-up.
  - Booked: marks it done and books the lead, approves the quote, or books
    the job.
  - Lost: asks for a reason, then marks the lead, quote or job as Lost.
  - Snooze: moves the due time (1 hour, tomorrow 9am or 3 days).
  If the action isn't allowed (e.g. "Booked" on a draft quote), the app
  says why and the follow-up stays open.

COMMAND CENTER (for management)
  Counts for Today, 7 days or 30 days: leads, quotes, booked, conversion,
  overdue follow-ups, jobs scheduled and completed, open and lost leads.
  Below that: follow-ups due, today's leads, open quotes, today's
  appointments and recent activity. Every number comes from the database.
  The page refreshes automatically every minute; the Refresh button
  updates it at once.

ACTIVITY
  Everything that changes is recorded automatically. The Activity page
  shows it all, filtered by date, user and record type.

INTEGRATIONS
  Dialpad, GoHighLevel and Housecall Pro are shown as "Not connected".
  They are placeholders; no data is exchanged yet.
  CSV lead import: upload or paste a CSV with a header row. Needed
  columns: a name column (name / full name / customer) and a phone
  (phone / mobile) or email column. Optional: address, source,
  request/notes. Check the preview, then click "Import N valid rows".
  Existing customers are reused; bad rows are skipped and listed.
  The event log at the bottom records every import.

VIN TOOL
  Click "VIN tool" in the header to open a side panel with three ways to
  get a VIN:
  - Photo: choose a file, take a photo (on a phone), drag and drop an
    image, or paste one with Ctrl+V (Cmd+V on Mac) while the panel is
    open. It reads the VIN out of the photo and shows what it found.
  - Text: paste a window sticker, title, or any text and click "Find
    VINs" to pull out any VIN-like strings.
  - Check a single VIN: type or paste a VIN directly and see its format
    and check-digit status as you type.
  Every match shows the VIN, whether its check digit is valid, and a
  Copy button. Click "Decode" on any VIN to look up make, model, year,
  trim and other details.
  Photo text recognition runs entirely in your browser (no photo is
  uploaded anywhere). The first scan downloads the text-recognition
  engine and English language data (several MB) from a public CDN
  (jsdelivr); later scans use the browser's cached copy.
  "Decode" sends the VIN to NHTSA's public VIN decoder API
  (vpic.nhtsa.dot.gov); nothing else about the vehicle or customer is
  sent.


6. STOP THE APP
---------------
- Stop the web app: press Ctrl+C in the terminal running "npm run dev".
- Stop the database: npx supabase stop
  Your data is kept and comes back on the next "npx supabase start".

WARNING: "npx supabase db reset" deletes ALL local data and rebuilds the
database from the migrations. Only use it if you really want a fresh
start.


7. RUN THE TESTS
----------------
  npm run typecheck          TypeScript check
  npm test                   unit tests (no database needed)
  npm run build              production build (output in dist/)

Database tests need the local database running and a file named
.env.test.local with the same two lines as .env.local:

  npm run test:integration


8. TROUBLESHOOTING
------------------
- "npx supabase start" fails
    Make sure Docker Desktop is running, then try again.

- Blank page, or an error about Supabase URL or key
    .env.local is missing or wrong. Redo step 2d, then stop and restart
    "npm run dev".

- Cannot sign in
    Create the user in Studio (section 4). Check the email and password.

- Port 5173 already in use
    Another "npm run dev" is still running. Close that terminal, or
    run "npm run dev -- --port 5174" and open http://localhost:5174.

- Errors after pulling new code
    Run "npm install" and "npx supabase migration up", then restart
    "npm run dev".

- "Tax rule not configured" on a quote
    Set tax in Pricing settings, then save the quote again.


More detail for developers:
  docs/workstream-a-data.md   customers, vehicles, leads, jobs
  docs/workstream-b-data.md   quotes, pricing rules, knowledge base
  docs/workstream-c-data.md   follow-ups, metrics, activity, integrations
