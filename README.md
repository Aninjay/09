# TAPMI Volunteer Allocation System

A static Cultural Committee portal built with HTML, CSS, and JavaScript. It runs on Netlify without a server, database, account service, or environment variables.

## Demo sign-in

The login page matches the TAPMI reference styling and offers quick-fill buttons for Convenor, Co-convenor, and Volunteer. Each fills a demo email and password; use **Sign in** to enter the corresponding view. Demo accounts use the password `tapmi-demo`.

This is a role-based interface demo, not security authentication: the sample credentials and role checks are in browser JavaScript and can be inspected or bypassed. Do not use it to protect confidential volunteer data. App changes save to the current browser's local storage and do not sync across devices.

## Volunteer roles and department heads

The staffing roles follow the CSV's `department_preference` categories: Event Planning & Execution, Finance & Budgeting, Logistics, Marketing & Promotions, Public Relations & Outreach, Sponsorships, Stage/ Backstage Management, Artist/ Participant Coordination, Vendor Management, and Hospitality. All skill names from the CSV are available in the catalog. The roster keeps the Import CSV control; importing an ID already in the roster updates that record. The optional `role` or `position` CSV column can set `Volunteer` or `Department Head`; otherwise the role defaults to Volunteer. Organizers can also assign a Department Head for each department on the Core Committee page from either the committee or volunteer list.

## Deploy on Netlify

1. Put the project in a GitHub repository. Keep `volunteers_complete.csv` and `output/*.xlsx` out of a public repository; `.gitignore` excludes them for new commits.
2. In Netlify, choose **Add new site → Import an existing project** and connect the repository.
3. Netlify reads `netlify.toml`: build command `python3 scripts/build_site.py`, publish directory `dist`.
4. Deploy. No Supabase project, credentials, or server configuration is needed.

The build script copies only browser files into `dist/`, excluding the roster CSV, Python optimizer, and Excel output. The web starter data has no real volunteer or committee personal records. For a private demo, import the roster after opening the site; that roster remains in that browser only.

## Local preview

Run `python3 scripts/build_site.py`, then serve `dist/` with any static file server. For example: `python3 -m http.server -d dist 8000`.

## Python optimizer

Install `pandas numpy matplotlib openpyxl "pulp==2.9.0"` and run `python event_staffing_optimizer.py` locally. The model reads `volunteers_complete.csv` and writes the detailed workbook/charts locally. Its generated website starter data contains no volunteer or committee records.
