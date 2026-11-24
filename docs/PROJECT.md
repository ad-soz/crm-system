# CRM project: charter, backlog, and ledger

Brief (from `.kiro/product.md`): for small and medium businesses; lightweight, feature-rich, very user friendly; fully customisable UI; **the application must always run**.

## Roles

| Role | Responsibility | Decides |
| ---- | -------------- | ------- |
| **SME** (sales manager at a 15-person business) | Says what is valuable, writes acceptance criteria, accepts or rejects the build with evidence | Value and "done" |
| **Developer** | Builds the smallest thing that meets the criteria; tests it; reports honestly | How |
| **PM / leader** | Owns scope, order, risk, and the budget. Accountable for the result. Can cut or defer anything | What ships, and when to stop |

Rules of engagement
1. Nothing is built without an SME story that has acceptance criteria.
2. Nothing is "done" until the SME has checked each criterion against evidence (a test, a measured result, or a live check), not the developer's say-so.
3. The live database is never touched by tests. Schema changes are backed up first and verified on a copy.
4. The app must be left running at the end of every story.
5. The PM keeps a reserve of the budget for fixes and a clean finish.

## Budget

The total is 300 credits. The credit balance is not visible from inside this session, so the PM plans in work units and the owner should watch Kiro's usage display as the real meter. Rough unit costs, from the work so far: a small story is about 5 credits, a medium one about 12, a large one about 25.

| Phase | Plan | Credits |
| ----- | ---- | ------- |
| Sprint 1: protect the data, forecast what will close, show what needs attention | 3 stories | 60 |
| Sprint 2: find things fast, keep the data clean, learn from losses | 4 stories | 90 |
| Sprint 3: trust and reach (history, more import/export, quick wins) | 3 stories | 60 |
| Reserve (fixes, hardening, docs, final verification) | | 60 |
| Contingency | | 30 |

Checkpoints: the PM reports after each sprint with what shipped, what was cut, and what is left. If the owner reports that usage is ahead of plan, the PM cuts the lowest-value stories first.

## Backlog (SME priority, PM-ordered)

Value is how much a sales manager would feel it. Cost is the PM's estimate. Risk covers both data and the "must always run" rule.

| # | Story | Value | Cost | Risk | Sprint |
| - | ----- | ----- | ---- | ---- | ------ |
| S1 | As the owner, I want automatic daily backups I can restore, so one bad day never loses the customer list | High | S | Low | 1 |
| S2 | As a sales manager, I want a weighted forecast (stage probability x amount, by expected close month), so I know what will actually close | High | M | Low | 1 |
| S3 | As a rep, I want the dashboard to show what needs my attention (overdue tasks, deals with no activity in N days, deals past their close date), so nothing slips | High | M | Low | 1 |
| S4 | As a user, I want to sort and filter every list (stage, owner, industry, status), so I can find things without scrolling | High | M | Low | 2 |
| S5 | As a manager, I want a required "lost reason" when a deal is lost, and a win/loss summary, so we learn why we lose | High | M | Med (schema) | 2 |
| S6 | As a user, I want duplicate warnings on contacts and companies (same email or name), so the data stays clean | Med | M | Low | 2 |
| S7 | As a user, I want "My day": tasks due today, calls to make, deals closing this week | Med | S | Low | 2 |
| S8 | As an owner, I want a change history on deals (who moved it, when, amount changes), so there is accountability | Med | M | Med (schema) | 3 |
| S9 | As a user, I want to import and export companies and deals, not only contacts | Med | M | Low | 3 |
| S10 | As a user, I want keyboard shortcuts and a quick-add button, so entering data takes seconds | Low-Med | S | Low | 3 |
| S11 | As a manager, I want a comment to be **required** whenever a deal is moved to another stage, saved with the date/time and the user who moved it, so every move is explained and accountable. *(Requested by the owner, "in due course".)* | High | M | Med (schema) | **Done** (S5 and S8 still open) |
| S12 | As a manager, I want a **Reports** page where I can see how deals change over time (created, moved between stages, won and lost, by month), so I can see whether the pipeline is growing and where deals stall. *(Owner asked where it was; it had not been planned.)* | High | M-L | Low (read-only) | Next |

| S13 | As a user, I want to **edit a task** (title, description, due date, priority, status, assignee, and what it is linked to), and delete one, so I can correct or update it after creating it. *(Owner: "I can't edit a task". Today only the status can be changed, from the Tasks list.)* | High | S | Low (the server already accepts task edits) | **Done** (deployed) |

| S14 | As the owner, I want **every action logged** in a simple audit trail, so I can trace a record, and the values of its fields, over time. *(Owner: "All actions in the system must be logged. Don't over-do this... trace records and fields/values in records over time. You might find some native capability to help.")* | High | M | Med (touches every table; must not break saving) | **Done** (deployed) |

| S15 | As a manager, I want to **click a top-line dashboard card** and get a rich environment to analyse the data behind it (search, filter, group, chart, sort, choose columns, export). *(Owner request.)* | High | M-L | Low (read-only; no database change) | **Done** (deployed) |

| S16 | As a rep, I want to **quickly duplicate a deal** from the UI, so repeat and renewal deals take seconds to enter. *(Owner request.)* | Med-High | S | Low (uses the ordinary create call; no database change) | **Done** (deployed) |

S13 acceptance criteria (proposed, for the owner to confirm):
1. Every task, on the Tasks page and in the task lists on a person and on a deal, has an **Edit** action, shown only to people with the edit-tasks permission.
2. Edit opens the same task form used to create one, filled in with the task's current values.
3. All fields can be changed. The contact a task came from can be removed (the task stays). Changing the person or deal to one that contradicts its contact is refused with a plain message, as on creation.
4. A refused save keeps the form open with what was typed, and shows the reason.
5. A **Delete** action with a confirmation, shown only with the delete-tasks permission.
6. After saving, every list showing that task updates without a reload.
7. Tests for the form, the permission rules and the refusals; no change needed to the database.

PM note: S13 is small and fills a basic gap, so it goes ahead of the Sprint 2 stories. Whether people can also edit a **deal** and a **person** from their list pages should be checked at the same time; they have edit buttons on their own pages, which is why only tasks were reported.

S11 acceptance criteria (agreed up front):
1. Moving a deal to a different stage, by drag-and-drop on the board or from the deal page, asks for a comment first. The move does not happen without one.
2. The comment is saved with the exact date/time, the user, the old stage and the new stage, and is shown in the deal's history.
3. The rule is enforced on the server and in the database, not only on screen, so the API cannot skip it.
4. Nothing else moves a deal today (the import covers contacts only, and seed data is created, not moved). Any future way of moving deals must go through the same service, and the database rule catches anything that does not.
5. Existing deals are not affected; the history starts from the first move after release.

PM note: S5 (required lost reason) and S8 (deal change history) need the same stage-change record, so these three are built together as one piece of work, in Sprint 2. Building them separately would mean changing the same code and database table three times.

S12 acceptance criteria (proposed, for the owner to confirm):
1. A **Reports** item in the menu opens a Reports page, shown to people who can view deals.
2. **Deals over time**, by month for a chosen period (3, 6 or 12 months): deals created (count and value), deals moved into each stage, deals won and lost (count and value).
3. **Where deals stall**: how long deals have been sitting in their current stage, longest first.
4. Simple charts drawn without a new charting library (the product is meant to stay lightweight), each with the same figures in a table so nothing is only visible as a picture.
5. The figures are checked against a hand calculation from the same data, as the forecast was.
6. Export of what is on screen to CSV.
7. A visible note says what the history covers. See the data limit below.

**Data limit the owner should know about.** The CRM only began recording stage moves with timestamps when S11 shipped (8 Nov 2026). For anything before that it knows only when each deal was created and which stage it is in now; it cannot know when an older deal was won, lost, or moved. So "deals created over time" and the current pipeline are complete from day one, but "moved, won and lost over time" will fill in from S11 onward and cannot be reconstructed for the past. The page will say so rather than show numbers it cannot back up. A "closed on" date for won and lost deals would make win/loss reporting more complete, and fits naturally with S5.

Deliberately out of scope (PM decision): email sync, calendar sync, multi-currency, mobile apps, plugin system. They are not lightweight, and each would put the "always runs" rule at risk.

## Ledger

| Story | Status | SME acceptance | Credits (est.) |
| ----- | ------ | -------------- | -------------- |
| S1 | **Accepted** | See S1 acceptance below | ~10 |
| S2 | **Accepted** | See S2 acceptance below | ~14 |
| S3 | **Accepted** | See S3 acceptance below | ~12 |
| S11 | **Accepted** | See S11 acceptance below | ~16 |
| S12 | Deployed | Reports built and deployed; not yet looked at in a browser against live data | ~25 |
| R1 | **Accepted** | Rename: see "Vocabulary change" below | ~35 (higher than the ~20 first quoted) |
| S13 | Deployed, awaiting the owner's look in a browser | See S13 record below | ~6 |
| S14 | Deployed, awaiting the owner's look in a browser | See S14 record below | ~14 |
| S15 | Deployed, awaiting the owner's look in a browser | See S15 record below | ~16 |
| S16 | Deployed, awaiting the owner's look in a browser | See S16 record below | ~4 |
| R2 | Deployed, awaiting the owner's look in a browser | Tasks from contacts, deals in the task family: see below | ~15 |

## Defects

| # | Found by | Defect | Severity | Plan |
| - | -------- | ------ | -------- | ---- |
| D1 | Developer, while rehearsing the S2 migration | Prisma reports a refusal from one of our database rules (SQLite `RAISE(ABORT)`) as a generic foreign-key error (`P2003`) and drops our plain-language `CRM_REF:` message. The change is still refused, so data is safe, but the user can see a wrong explanation (e.g. "That deal stage does not exist" for a retired stage, or "in use, retire it instead" when refusing to retire the last active value). This also means `classifyDbError`'s "guard" branch can never fire in production, and earlier claims that these messages reach users were wrong. | Medium (misleading text, no data risk) | Fix in Sprint 2, immediately after S2: have each service diagnose the real cause when it sees `P2003` and give an accurate message, with an end-to-end test per rule. The database rules stay as the backstop. |

| D2 (**fixed**) | PM, reviewing the S2 deployment log | On the first start after a build, the supervisor logged "no build found; building" and then "build failed" within the same second. Its own build log shows a clean build, and the app started 15 seconds later on its automatic retry. So the supervisor's judgement of the build step is wrong in at least this case. No data or availability impact seen (it recovered unaided), but the "application must always run" rule makes any wrong step in the supervisor worth fixing. Cause not yet confirmed. | Low-Medium | Sprint 2 hardening: reproduce with the app stopped, then make the supervisor check for the build outputs rather than trusting a shell exit code. Related: `crm-services.ps1 update`/`stop` also throw on harmless output (seen earlier). Fix both together. |

**D2 resolution.** The cause was not the build. The scheduled task restarts the supervisor within a minute whenever it ends (that is what keeps the app up after a crash), so `crm-services.ps1 stop` never kept anything stopped: Windows relaunched the supervisor mid-deploy, and two builds collided. Fixed in three parts: `stop` now leaves a note that a relaunched supervisor honours (valid for the current sign-in only, removed by `start`, so it can never keep the app off for good); native commands no longer turn harmless output into a failure; and a build is judged by what it produced and retried once. Proof: 24 checks in `scripts/selftest-services.ps1`, and a live run in which the app was stopped, a full build ran for over a minute with no relaunch, and `start` brought it back.

## Vocabulary (since the rename)

| Word | Meaning | Table |
| ---- | ------- | ----- |
| **Person** | Someone you deal with (was "Contact") | `people` |
| **Company** | An organisation | `companies` |
| **Contact** | One touchpoint: a call, email, meeting or note, logged against a person and/or a deal (was "Activity") | `contacts` |
| **Contact type** | Call, Email, Meeting, Note (was "Activity type") | `contact_types` |
| **Task** | Something to do, with a due date, priority, status and assignee. May follow up a Contact | `tasks` |
| **Deal** | A sale being worked, with a stage. Shown in the Tasks list as part of the task family, and may have any number of tasks | `deals` |

The word "contact" changed meaning, so the rename was done in two steps (Contact to Person, then Activity to Contact) and nothing was renamed by a blind find-and-replace. The permission keys changed to match (`people.*`, `contacts.*`).

## Acceptance records

### R1: vocabulary change (accepted)

Owner request: Contacts become People, Activities become Contacts, everywhere including the database, API and code.

| Criterion | Evidence |
| --------- | -------- |
| No live data lost | Before and after on the live database: 2 users, 4 companies, 6 people, 4 contacts, 4 tasks, 4 deals, 1 stage change, 4 contact types. Stored role permissions rewritten to the new keys (27 for administrator, 23 for sales rep, unchanged in number). |
| Done as renames, not drop-and-create | The two migrations (`20261109000000_rename_contacts_to_people`, `20261109000100_rename_activities_to_contacts`) rename tables and columns in place. Rehearsed on a copy of the live database first: 23 checks, and a schema comparison reported zero drift. |
| Database rules still hold | The 10 rules that named the old tables were dropped by the migration and recreated under the new names at start-up; the app refuses to run if any is missing. |
| Nothing else broke | 96 end-to-end tests, 235 unit tests and 169 client tests passed after the rename; deployed; 12 of 12 read-only checks on live data passed. |

### D3: global search was broken (fixed, deployed)

**Reported:** "The global search bar is broken."

**Causes found** (all reproduced against the real API before any fix; six end-to-end tests failed):
1. **The break itself.** When deal stages moved into the reference lists, a deal's stage became a record. The search still sent it where the screen expected text, and the screen does not know how to draw a record, so as soon as any search matched a deal the whole page went blank. The old unit test hid this by pretending the stage was the text "LEAD".
2. **Full names found nobody.** "Quentin Zorblax" returned nothing, because each word had to match one single field. Now every word may match anywhere in the record, in any order.
3. **`%` and `_` matched every record**, because the database treats them as wildcards. They are now plain characters.
4. **Weaker points fixed alongside:** a slow earlier answer could replace a newer one; a failed search showed nothing at all (it now says "Search is not available right now"); the screen could be taken down by any unexpected data (anything that is not text is now left out instead).

**Changed for the better:** people are also found by phone and company, deals by company and person, names that start with what you typed come first, and each result says more (a deal reads "Won · $75,000 · Acme Corporation 1"; a person reads "email · company"). A company or person is never used to find, or described in, a result for someone whose role profile may not view companies or people.

| Evidence | |
| -------- | - |
| Reproduced first | 6 end-to-end tests failed on the old code, including the object-where-text-belongs one. |
| Fixed | 14 end-to-end tests of search on the real stack now pass, 14 server unit tests, 11 screen tests (including a slow-first-answer race, a failure, and malformed data). |
| On your live data | Read-only: a real person is found by full name, name backwards and a 3-letter start; a real company and a real deal are found; the deal reads with its stage name; `%` and `_` find nothing; a role limited to deals sees only deals and no company name. |
| Tests overall | 171 end-to-end, 277 server unit, 308 client; all pass. |

Lesson recorded: the test that should have caught this used invented data in the old shape. The new tests run the real server against a real database and check what the screen will receive.

### S16: duplicate a deal (deployed)

A copy button on each deal on the board and in the table, and a **Duplicate** button on the deal's own page. All three open the same dialog (`DuplicateDealDialog`): the new deal's form, already filled in from the original, with the title selected so a new name can be typed straight over it. Enter saves. From the deal's own page the new deal then opens; from the list you stay where you are and the list refreshes, so several copies can be made in a row.

| Decision | Reason |
| -------- | ------ |
| Copies title (with " (copy)"), amount, company, person and expected close date | The parts that are usually the same for a repeat or renewal deal. All can be edited before saving. |
| Starts at the **default stage**, even when the original is won | A copy is a new opportunity. A copy that started as "Won" would put money in the won figures that has not been won, and would skip the required stage-move comment. The stage can still be chosen in the form. |
| Contacts, tasks and stage history are **not** copied | They describe what happened on the original. |
| The person making the copy owns it | Same as any new deal; the original's owner is not changed. |
| Needs the right to create deals | The buttons are hidden without `deals.create`, and the server refuses (403) anyway. |
| No server change | The copy goes through the ordinary create call, so every database rule, the audit log and the permission checks apply to it exactly as to any new deal. |

| Criterion | Evidence |
| --------- | -------- |
| One click, name, Enter | Tests: the dialog opens filled in, the title is selected and focused, and typing then Enter creates the copy with the typed name. |
| Works from the board, the table and the deal page | 9 page tests, including that clicking the copy button does not open the deal or start a drag. |
| A won deal copies safely | Tests at the screen (no stage is sent) and at the API (copy of a won deal is created at the default stage with no reason needed, and the original stays won). |
| Nothing leaks across | API tests: no contacts, tasks or history on the copy; original unchanged; copies owned by the copier; each copy a separate deal. |
| Audited | API test: the copy is one "create" line in the audit log, credited to whoever made it. |
| Errors are shown | A refused copy keeps the form open with what was typed and shows the reason. |
| Tests | 157 end-to-end (8 new), 299 client (21 new). |

Not included, by decision: copying open tasks along with the deal (easy to add as a tick box if wanted), and duplicating several deals at once. Not verified: the screens in a real browser.

### S15: drill-down from the dashboard cards (deployed)

Each of the five top-line cards (Total People, Total Companies, Open Deals, Pipeline Value, Weighted Forecast) now opens an analysis page (`/analyse/<card>`) on the rows behind its figure. Rows come from one read-only endpoint (`GET /api/analyse/people|companies|deals`); the screen does the analysis, so every click is instant and no new query is needed per filter.

| Criterion | Evidence |
| --------- | -------- |
| The card and its rows agree, to the cent | End-to-end tests compare each card with the sum of its rows, and the forecast with a hand calculation from the stage list. Also run read-only against the live data after deployment: People 6, Companies 5, Open Deals 2, Pipeline $135,000, Forecast $61,500, all equal. |
| Search, filter, group, sort, columns, export | Search words; tick-value filters for every category, min/max for every number, date ranges; group by any category or by month; measure by any number (count, total, average, share); sortable columns; column chooser; CSV of exactly what is on screen (needs the export permission). |
| Drill further | Clicking a group, or a stage on the dashboard, narrows the page to those rows. Every choice is kept in the address, so a view can be bookmarked or sent. |
| Chart and table agree | The bar chart sits above a table of the same figures, with totals, averages and shares. A company with several industries appears in each group, and the page says so. |
| Respects permissions | Each area needs its own view permission (403 otherwise). Columns from areas the person may not see (contacts, tasks) come back empty and are left out, not shown as blanks. |
| Correct maths | 35 unit tests of the engine, each figure worked out by hand (sums, averages that skip empty values, shares that total 100, month grouping, sort order with empty values last, filter edges, address round-trip). |
| Tests | 149 end-to-end (12 new), 266 unit, 278 client (66 new). |

Also fixed: the end-to-end runner stopped before running any test when Prisma printed an "update available" notice on the error stream (same family as defect D2); it now judges those steps by exit code and silences the notice.

Not included, by decision: saved views (the address already does this), drill-down from the attention and forecast month rows (the forecast month table on the Weighted Forecast page does it), and charts other than bars. Datasets are capped at 5,000 rows per area, with a visible warning if exceeded. Not verified: the screens in a real browser.

### S14: audit log (deployed)

**Design choice.** The "native capability" is SQLite triggers. Alternatives considered: (a) logging in each service by hand, which a new endpoint can forget; (b) a Prisma middleware or extension, which cannot see side effects such as a task losing its person when that person is deleted, and does not cover imports or scripts. Triggers see every change, and the history row and the change are saved together or not at all. "Who" is the one thing the database cannot know, so the server names the signed-in user for the length of each write request; write requests therefore run one at a time (SQLite allows one writer anyway).

| Criterion | Evidence |
| --------- | -------- |
| Every create, change and delete is logged, with old and new values | 44 triggers (3 per table) installed on live. 20 unit tests against a real SQLite database, and 15 end-to-end tests through the API. |
| New tables and fields are covered automatically | Triggers are built from the live column list at every start-up. Tested: add a column and a table, and both are logged. An end-to-end test fails if any table lacks triggers. |
| Who made it | Tested with 24 overlapping requests from two users: each is credited to the right person. A script or the scheduled backup shows as *System*. A stale name left by a crash is ignored after 2 minutes. |
| Side effects are logged | Tested: deleting a person logs the task's person being cleared, by the person who deleted. |
| Secrets never recorded | Passwords and tokens are excluded by column name. Tested: no hash appears anywhere in the log. Failed sign-ins record the address tried, never the password. |
| Cannot be edited or deleted | Two database rules refuse both for everyone. Tested through Prisma and raw SQL. |
| Other actions | Sign-in, failed sign-in (capped at 200 per 10 minutes, so guessing cannot fill the log), CSV export, manual backup. |
| Simple to use | Settings → Audit log (filters: who, kind of record, action, dates; paging; shareable address), and a History card on person, company and deal pages. Ids are shown as names ("Stage: Lead to Qualified"); a deleted record is still named. 17 client tests. |
| Existing data untouched | Migration adds two empty tables. Rehearsed on a copy of live data: same counts, integrity ok, zero foreign-key problems, zero schema drift, 3 real writes logged correctly, live file untouched. On live after deploy: same counts, 44 triggers, 0 audit rows yet. |
| Tests | 137 end-to-end (15 new), 266 unit (24 new), 212 client (19 new). |

Defects found by my own tests while building this, both fixed: (1) the start-up code matched trigger names with a SQL `LIKE` pattern, where `_` means "any character", so it deleted the rules that protect the log (`crm_audit_log_*`) at every start. A test caught that the log could be edited; it now compares names as plain text and has a test for exactly this. (2) Run before the migration, the set-up would have installed triggers pointing at tables that did not exist yet, making every save fail; it now installs nothing until the tables exist.

Limits the owner should know: the log starts from deployment (earlier changes are not in it; the screen says when recording began). Changes made directly on the database file by a person outside the app are recorded but show as *System*. Names shown for linked values are the current names, so a renamed stage reads with its new name. The log only grows (a few hundred bytes per change). Because the log is part of the database, it is included in backups, and a restore returns it to the backup's moment. Reading data is not logged. A first start after this release shows a one-off "Restored 2 missing database rule(s)" warning; that is the two log-protection rules being created, and is expected.

Note for developers: a migration that recreates a table drops that table's audit triggers (the server restores them at start), and a table rename can make SQLite rewrite a trigger. Rehearse every migration on a copy of the live database; the rehearsal exercises exactly this.

Not verified: the screens in a real browser, and a live write by a real signed-in user (the first sign-in will be the first line).

### S13: edit and delete a task (deployed)

| Criterion | Evidence |
| --------- | -------- |
| Edit on every task list | One component (`TaskActions`) used by the Tasks page and by the task lists on a person and on a deal. |
| Only for people allowed | Edit needs `tasks.edit`, Delete needs `tasks.delete`; a view-only role sees neither. Tested on screen logic, and the server refuses with 403 (tested with a view-only and an edit-only role). |
| Same form as creating, filled in | 12 new component tests, including the filled-in values. |
| Any field can be changed or emptied | Due date, description, person, deal and contact can be emptied; status, priority and assignee are kept when not changed. Tested at the API with exactly what the form sends. |
| Contact link can be removed | "Remove link" / "Undo" in the form; the task stays. A person that contradicts a kept contact is refused with a reason, and nothing is saved. |
| Failed save keeps what was typed | The reason shows in the form; tested. |
| Delete asks first | Confirmation; "no" does nothing. Deleting a task leaves its contact and deal alone (tested). |
| Lists refresh | Tasks, person, deal and dashboard data are refreshed after a save or delete. |
| No database change | Server change is one include (below), so no migration. |
| Tests | 122 end-to-end (10 new), 242 unit, 193 client (12 new). |

Defect found on the way, fixed: the task list on a person's page asked the server for each task's priority and status but the server did not send them, so those two badges were always blank ("-"). The server now sends them; checked by an end-to-end test.

Not verified: the screens in a real browser.

### R2: tasks from contacts, deals in the task family (deployed)

Owner request: a Contact with a person may spawn tasks; a Deal is a type of task but may also have other tasks. Chosen option B: the deal stays its own record (so the pipeline, forecast, reports and stage history are untouched) and joins the task family on screen.

| Criterion | Evidence |
| --------- | -------- |
| A contact can spawn tasks, many per contact | `tasks.contact_id` (optional; existing tasks have none). A **Follow up** button on every contact (Contacts page, person page, deal page) opens a task form already linked to it. End-to-end test: one contact, four tasks. |
| The task is about the same person and deal as its contact | The server fills person and deal from the contact and refuses a task that names a different one (400, plain message). The database enforces the same rule in three triggers, so it also holds for anything that bypasses the API. Tested both ways. |
| Deleting a contact keeps its tasks | The link is cleared, the task stays. Tested. |
| A deal appears with tasks and may have tasks of its own | The Tasks page lists open deals beside tasks (Type column, close date as due date, owner, stage, "N tasks under this deal", link to the deal). Filter: tasks and deals / tasks only / open deals only. Deals need the `deals.view` permission to appear. |
| Existing data untouched | Migration only adds an empty column and an index. Rehearsed on a live copy: same counts, integrity check ok, zero foreign-key problems, zero schema drift. On live after deploy: same counts, 0 tasks linked yet, 3 new rules present (62 rules in all). |
| Tests | 112 end-to-end (16 new), 242 unit (the one `prisma.service` test that reads the live database failed until the live migration ran, then passed), 181 client (12 new). |

Behaviour to know about: choosing a task status (To Do, Done, ...) on the Tasks page shows tasks only, because a deal has a stage rather than a task status. Rows with no due date now sort last (before, they sorted first).

Not verified: the new screens in a real browser. The tests exercise the components and the API, but nobody has looked at them on screen yet.

### S11: required comment on every stage move (accepted)

| Criterion | Evidence |
| --------- | -------- |
| Moving a deal asks for a comment first; no comment, no move | Board drag-and-drop and the stage buttons open a "Why is it moving?" dialog; the edit form shows a required reason field as soon as a different stage is chosen. 12 dialog tests and 7 form tests (empty, spaces-only, over 1000 characters, put-back-to-original, new deals not asked) |
| Saved with the exact date/time, the user, old and new stage, and shown in the deal's history | End-to-end: a move records comment (trimmed), user id and name, from and to stage, and a timestamp within seconds of the move. Deal page has a "Stage history" card, newest first, with date, time and name. Comment text is shown as plain text (tested with markup) |
| Enforced on the server and in the database, not only on screen | API returns 400 without a comment. Separately, 8 tests go **around the API** straight at the database: a move with no comment is refused; a comment authorises exactly one move (a spent comment cannot be reused); a comment is tied to its deal, starting stage and target stage; blank, over-long, or same-stage records are refused; history cannot be edited or deleted. Rehearsed on a copy of the live database before deployment |
| Existing deals unaffected; history starts at the first new move | Live: 4 deals untouched, history table starts empty, integrity check ok. A safety copy was saved automatically before the migration (`crm-pre-update-20261108-214923-630.db`) |
| The move and its comment cannot exist without each other | Saved in one database transaction; unit test confirms the record is written first, then the move |

Found by the tests and fixed before release: the "history cannot be changed" rule also blocked the database from blanking the link to a person when that person is removed, which would have made removing a user who had moved a deal impossible. The rule now allows exactly two changes: the database's own "used" marker, and blanking a removed user's link (their name stays on the row, so history still reads). A test covers it.

Side effect on D1: the stage-move path now checks the target stage first, so a missing or retired stage gets an accurate message. D1 itself (wrong wording when other database rules refuse a change) is still open.

Not in this story, by decision: a lost reason (S5) and a wider change history for other deal fields (S8). They can reuse this table.
### Settings restructure (owner request, done)

Settings was one long page (two link cards, My details, Appearance, Users, Role profiles, Backups) with Reference lists and Data Model hidden on separate pages behind "Back" buttons. It is now a frame with a left menu, grouped **You** (My details, Appearance), **Organisation** (Users, Role profiles, Reference lists, Backups) and **Advanced** (Data model), and one page per section. A person sees only the items they have permission for, and empty groups disappear. The menu is built from one list (`settingsSections.ts`), so a new section is one entry plus one route. Old `/appearance` links redirect. 11 tests cover the menu per permission set, one-section-at-a-time, the access message, and unknown addresses.

### S3: what needs attention (accepted)

| Criterion | Evidence |
| --------- | -------- |
| Overdue tasks: my open tasks due before today, oldest first | E2E on a real database: only mine, done tasks and other people's excluded. Live: admin sees "Follow up with David" (due Nov 7, today Nov 8) |
| Stale deal: open, mine, no activity on the deal or its contact for 14 days; new deals not flagged | Unit tests at the exact boundary (13 days fine, 14 stale), contact activity counts, new deal not flagged. E2E: logging a call takes a deal off the list |
| Past-due deals: open, mine, close date before today | E2E: shows days late (10), won deals excluded. Live: GreenEnergy has a past close date but is Lost, correctly absent |
| Max 5 shown, true total, links | Unit and screen tests: "and 6 more", each item links to its deal/contact/task |
| Only areas I can view; closed deals and done tasks never appear | E2E with a contacts-only profile: all three sections `null`; no queries made |
| Clear message when nothing needs attention | Screen test: "Nothing needs your attention. You're all caught up." |

Defect found and fixed during S3 (not a user report; caught in design review): the existing dashboard decided "upcoming" using the current clock time, so a task due **today** (stored as midnight) was already "in the past" and appeared in neither upcoming nor overdue. Now one shared definition of today (`dashboard/dates.ts`) is used by upcoming tasks, overdue tasks, past-due deals and the forecast. Proven by a test that overdue ends exactly where upcoming begins, and live: the rep's task due today is correctly not overdue.

## Sprint 1 report (PM)

| | Planned | Actual |
| - | ------- | ------ |
| Stories | S1, S2, S3 | All three accepted |
| Credits | 60 | ~36 (estimates; the real meter is Kiro's usage display) |
| Tests | | Server unit 201, end-to-end 62, client 94, backup scripts 14 checks. All passing |
| Live system | | Running, latest build, backed up, two schema/ops changes applied safely |

What went well: every story was proven on the live data and not just in tests; the first real migration exercised the S1 safety copy as designed.

What did not: the supervisor and `crm-services.ps1` scripts misreport harmless output as failures (D2), which cost time and caused one avoidable outage in the deploy steps. A rule-refusal wording defect (D1) was found late in S2. Both are scheduled first in Sprint 2 so that later stories stand on solid ground.

Sprint 2 order (PM): D1 and D2 fixes, then S5 + S11 + S8 together (stage-change record: required comment, lost reason, history), then S4 (sort/filter), S6 (duplicates), S7 (My day).

### S2: weighted forecast (accepted)

| Criterion | Evidence |
| --------- | -------- |
| Each stage has an editable win chance; existing stages start at 10/25/50/75/100/0 | Migration rehearsed on a copy of the live database first (all six values correct, no data lost), then applied live. Editable in Settings > Reference lists on open stages |
| The database refuses a chance outside 0 to 100 | New database rule; rehearsal showed 150 and -1 refused, 12 accepted. The API also validates (400 for 101, -1, 12.5, "lots") |
| Dashboard shows the weighted forecast of open deals only | Live data, checked against my own deal-by-deal arithmetic: total $255,000, expected **$110,250**, identical. End-to-end test repeats that independent calculation on every run |
| Forecast by close month, with Overdue and No close date rows | Live rows: Nov 2026 $78,750, Dec 2026 $30,000, no date $1,500 (sum = headline). Unit tests cover ordering, today vs yesterday, UTC month edges |
| Changing a win chance changes the forecast straight away | End-to-end test: raising Negotiation from 75 to 100 moves the forecast by exactly 25% of that stage's deals |
| Not shown without Deals access | Server returns `null` and does not query deals; unit and screen tests |
| Won stays 100%, Lost stays 0% | Enforced in the service; end-to-end test tries to set 30 and 60 |

Side effect proving S1: the supervisor saved `crm-pre-update-20261108-211402-416.db` before applying this migration, as designed.

Found while proving it: **D1** (above). It affects how rule refusals are worded, not whether they are enforced.



### S1: automatic backups (accepted)

| Criterion | Evidence |
| --------- | -------- |
| A backup is made automatically at least every 24 hours, and at start-up if the last is older | Live app made `crm-auto-20261108-210403-295.db` about 30 seconds after start, unprompted. Unit tests cover the 24-hour rule, including manual vs safety copies |
| Backups are complete, openable copies | Opened the live backup independently: integrity `ok`, and users/contacts/companies/deals/tasks/activities/stages and all 42 database rules identical to the live database |
| Old backups are pruned, never the only one | Unit test: keeps newest 14 automatic / 10 manual / 5 safety copies, each kind separately |
| A failing backup never stops the app | Unit test: a failing backup is recorded and swallowed. Shown in Settings with "the app is still running" |
| Administrators can see backups and back up now | Settings > Backups card, gated by the new "Manage backups" permission (Administrator has it automatically). E2E: sales rep gets 403 |
| Restore is one command and can be undone | `scripts/restore-backup.ps1`; 14 self-test checks (`scripts/selftest-backup.ps1`) incl. undo, bad input refused with nothing changed |
| Backups are kept out of the synced folder | `%LOCALAPPDATA%\CRM\backups` |
| A copy is taken before database updates | The supervisor saves a safety copy when migrations are pending |

Not covered, by decision: restoring from inside the app. Replacing the live database while the app is running is risky, so restore stays a deliberate command. Backups live on the same computer, so they protect against mistakes and bad updates but not against losing the machine; the owner should copy the backups folder somewhere else now and then.
