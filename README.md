# University Automation System (CampusFlow)

A web application for running the academic side of a university: student records and registration, faculty accounts, courses and semesters, attendance, teacher feedback, and exam hall tickets. It has three roles (Admin, Faculty, Student), each with its own workspace.

- **Frontend:** React 18 with Vite, plain CSS, `lucide-react` icons
- **Backend:** Node.js 20+ with Express 4
- **Database, authentication and file storage:** Supabase (PostgreSQL, Auth, Storage)
- **PDF and email:** `pdfkit` for generated documents, `nodemailer` for SMTP email

## Contents

1. [Features](#features)
2. [How it works](#how-it-works)
3. [Project structure](#project-structure)
4. [Data model](#data-model)
5. [Setup guide](#setup-guide)
6. [Configuration reference](#configuration-reference)
7. [Running the project](#running-the-project)
8. [Branch curriculum data](#branch-curriculum-data)
9. [Testing](#testing)
10. [Deployment](#deployment)
11. [API reference](#api-reference)
12. [Security notes](#security-notes)
13. [Current limitations](#current-limitations)

---

## Features

### Student registration and verification
- Students sign up with their name, email and password. The account stays in a pending state and cannot reach any student page until an Admin approves it.
- Approval is a single database transaction. It creates the student record, links it to the login, generates the next Student ID (`STU000001`, `STU000002`, ...) from a database sequence, and writes an audit log entry. Two Admins approving at once cannot produce the same ID.
- Admins can also reject a registration. Rejected and inactive accounts see a clear message instead of an empty dashboard.
- Admins can create a student directly. This creates the login (email and password), the profile and the student record together, and removes the login again if any later step fails.

### Admin workspace
- **Student management:** paginated search by ID, name or email; filters for department, course and status; create, edit, view, deactivate and reactivate. Editing can also reset the student's password. A student's course enrollments appear in a collapsible list per row.
- **Course enrollment:** inside the student form the Admin picks a branch and a semester once, then adds courses from that semester's list. Selected courses are shown as removable chips. Removed courses are marked withdrawn rather than deleted, so history is kept.
- **Academic management:** academic years, semesters, departments and courses. Each course belongs to a department, is assigned to one semester, and can have several professors. The screen enforces sensible rules: semester dates must sit inside their academic year, and a course cannot be deactivated while it still has active subjects.
- **Faculty management:** create faculty accounts (login, profile and faculty record), assign a department and designation, search, and activate or deactivate.
- **Admin management:** create additional Admin accounts.
- **Exam and feedback rounds:** described below.

### Faculty workspace
- A dashboard with the faculty member's profile and the courses assigned to them.
- **Attendance:** choose a course and a date, mark each enrolled student as present, absent or late with optional remarks, add a lecture topic and notes, and save. A saved session can be edited until it is submitted.
- **Submit and email:** submitting locks the session, generates a PDF attendance report, and emails it to the faculty member. A submitted session can be reopened for corrections.
- All faculty members assigned to a course share its sessions. Deactivated students do not block submission.

### Student workspace
- **Profile:** Student ID, name, email, department, admission year, and the list of enrolled courses with their semesters. Students can update their phone number and upload, change or remove a profile photo.
- **Courses and subjects:** the courses a student is enrolled in and the subjects of each.
- **Attendance:** a per-subject summary (sessions, present, late, absent, last session date, percentage) and a list of recent sessions. Attendance appears as soon as a faculty member saves it, and each row shows whether the session is saved or submitted.
- **Feedback:** the teacher feedback form and hall ticket download.
- **Timetable, academic calendar and fees:** these pages exist and are marked "To be implemented soon".

### Profile photos
Only students can upload a photo, and only their own. Images are cropped to a square and shrunk in the browser, checked on the server by their file signature (JPEG, PNG or WebP, under 700 KB), and stored in a private Supabase Storage bucket named `student-photos`. The page receives a temporary link that expires after an hour. The bucket is created automatically on the first upload.

### Teacher feedback and hall tickets
This is how an exam cycle runs:

1. **The Admin opens a feedback round.** A round is defined by a branch, a semester and an exam type (**MST** or **ESE**). The Admin sets a feedback deadline and, for each subject, an exam date and start and end time. Laboratory courses (course codes ending in `L`) are not listed, because they have no written exam.
2. **Students give feedback.** Students enrolled in the round's subjects see the round under **Feedback**. The form is a table: one row per question, one column per subject and teacher. Each cell is a dropdown with five answers: Worst, Bad, Good, Very good, Excellent. Every cell must be filled before the form can be submitted, and a submission cannot be changed afterwards. An optional comment box sits under each teacher.
3. **The hall ticket unlocks.** Once feedback is submitted, the student can download a PDF admit card: institute emblem and name, "Examination Admit Card", Student ID, name, degree and branch, semester in roman numerals, exam name, the student's photo, a table of subjects with exam date and time and a column for the invigilator's signature, and a candidate signature line. Before submitting, the ticket is locked.
4. **The Admin reads the results.** Each round shows how many students have submitted out of how many are eligible. The results view gives the average rating per question for every teacher and subject. Answers are anonymous.

Admins can edit a round's deadline and schedule, close and reopen it, and delete it only while nobody has submitted. After the deadline passes (or the round is closed) students can no longer submit. Students who already submitted can still download their ticket.

The five questions are defined in `backend/src/feedback-config.js`:

1. Has the Teacher covered the entire syllabus as prescribed by the University?
2. Motivation and inspiration for students to learn
3. Willingness to offer help and advice to students
4. Effectiveness of the Teacher in terms of technical content and course content
5. Effectiveness of the Teacher in terms of communication skills

To change the questions, edit that list. The student form, validation and the Admin results all follow it.

### Themes and layout
Light and dark mode with the choice remembered in the browser, a responsive layout, and consistent tables, dialogs and forms across roles.

---

## How it works

```
Browser (React)
   |  1. Sign in / sign up directly with Supabase Auth
   |  2. Every other call goes to the API with the Supabase access token
   v
Express API (backend)
   |  - validates the token with Supabase
   |  - loads the user's profile (role, account status)
   |  - checks the role for the route (Admin, Faculty, verified Student)
   v
Supabase PostgreSQL / Storage   (accessed with the service-role key)
```

- The browser only holds the Supabase **publishable** key. All reads and writes of application data go through the backend, which uses the private service-role key.
- Row Level Security is enabled on every table. The policies protect direct access with the publishable key; the backend enforces roles and ownership itself because the service-role key bypasses RLS.
- Roles live in the `profiles` table. A role is never read from user-editable metadata.
- In production the same Express server also serves the built frontend, so the whole application runs from one address.

---

## Project structure

```
.
|-- package.json                  Root scripts used by hosting (build, start)
|-- backend/
|   |-- assets/vjti-emblem.png    Emblem drawn on hall tickets
|   |-- data/curriculum.json      Branch and semester course lists
|   |-- scripts/seed-curriculum.js
|   |-- src/
|   |   |-- server.js             App setup, security headers, static frontend
|   |   |-- routes.js             Route table, students and admins endpoints
|   |   |-- config.js             Environment settings and CORS rules
|   |   |-- supabase.js           Service-role client
|   |   |-- middleware/auth.js    Token check and role guards
|   |   |-- academic.js           Years, semesters, departments, courses
|   |   |-- student-verification.js   Registration review
|   |   |-- student-enrollments.js    Course enrollments
|   |   |-- student-profile.js    Student profile and attendance view
|   |   |-- student-photo.js      Profile photo storage
|   |   |-- faculty.js            Faculty dashboard
|   |   |-- faculty-management.js Faculty accounts
|   |   |-- faculty-attendance.js Attendance sessions, PDF and email
|   |   |-- exam-feedback.js      Feedback rounds, submissions, hall tickets
|   |   |-- feedback-config.js    Questions, rating scale, validators
|   |   |-- hall-ticket.js        Admit card PDF
|   |   `-- curriculum.js         Curriculum loader
|   `-- test/                     Node test runner tests
|-- frontend/
|   |-- src/
|   |   |-- App.jsx               Sign-in, navigation, student and admin pages
|   |   |-- components/           Academic, faculty, feedback screens
|   |   |-- lib/api.js            API client
|   |   |-- lib/supabase.js       Browser Supabase client
|   |   `-- styles.css
|   `-- vite.config.js
|-- supabase/migrations/          Numbered SQL files, 001 to 014
`-- docs/                         Extra setup notes
```

---

## Data model

| Area | Tables |
|---|---|
| Accounts | `profiles` (role and account status), `students`, `faculty` |
| Academic structure | `academic_years`, `semesters`, `departments`, `courses`, `subjects`, `subject_offerings` |
| Assignments | `course_semester_assignments`, `course_faculty_assignments`, `faculty_subject_assignments` |
| Enrollment | `student_semester_enrollments` (status: enrolled, completed, withdrawn) |
| Attendance | `attendance_sessions` (open or submitted), `attendance_records` (present, absent, late) |
| Feedback and exams | `exam_feedback_rounds`, `exam_round_subjects`, `feedback_submissions`, `feedback_responses` |
| Other | `audit_logs`, `profile_correction_requests`, `import_jobs`, `import_row_errors` |

Notes:
- A course here is a teachable unit with its own code, such as `R5IT3001T` (Machine Learning). It belongs to one department and one semester.
- Semesters are numbered 1 to 8 and each belongs to an academic year.
- Student IDs come from the `generate_student_code()` database function.
- `profile_correction_requests`, `import_jobs` and `import_row_errors` have tables but no application screens yet.

---

## Setup guide

### 1. Requirements
- Node.js 20 or newer and npm
- A Supabase account and a new project
- Git
- Optional: a Gmail account with an app password (or any SMTP server) for attendance report emails

### 2. Create the Supabase project
1. In the Supabase dashboard, create a project and wait for it to finish provisioning.
2. Open **Project Settings > API**. Note the **Project URL** and the **publishable key**.
3. In **Project Settings > API Keys**, note the private **secret** (service-role) key. It belongs only in the backend.
4. Open **Authentication > URL Configuration**. Set the Site URL to `http://localhost:5173` and add `http://localhost:5173/**` as a redirect URL.

### 3. Create the database
Open **SQL Editor > New query** and run the files in `supabase/migrations/` one at a time, in this order. Wait for "Success" before running the next.

| Order | File | Purpose |
|---|---|---|
| 1 | `001_initial_schema.sql` | Core tables and the new-user trigger |
| 2 | `002_rls_policies.sql` | Row Level Security |
| 3 | `003_student_id_sequence.sql` | Student ID sequence and generator |
| 4 | `004_student_email_unique.sql` | Unique student emails |
| 5 | `005_student_code_generator_repair.sql` | Repairs the ID generator if it is missing or behind |
| 6 | `007_atomic_student_approval.sql` | Transactional registration approval |
| 7 | `008_academic_management.sql` | Academic years, semesters, enrollments |
| 8 | `009_faculty_module.sql` | Faculty role and links |
| 9 | `010_course_faculty_assignments.sql` | Professors per course |
| 10 | `011_faculty_attendance.sql` | Attendance tables |
| 11 | `012_course_semester_assignments.sql` | Course to semester link |
| 12 | `013_fix_student_enrollments_and_faculty_email.sql` | Enrollment constraints, faculty email backfill |
| 13 | `014_exam_feedback_and_hall_tickets.sql` | Feedback rounds and responses |

Skip `006_pending_student_id_correction.sql` on a new database. It is kept only because it may already have been applied on older installations; migration 007 removes what it left behind.

Every file is wrapped in a transaction, so a failed run changes nothing and can be re-run after fixing the cause.

### 4. Create the first Admin
There is deliberately no public Admin sign-up.
1. In Supabase, open **Authentication > Users > Add user**, create the Admin with an email and password, and tick "Auto Confirm User".
2. Copy the new user's UUID from the users list.
3. In the SQL Editor, run (replace the UUID and name):

```sql
insert into public.profiles (id, role, account_status, full_name)
values ('PASTE-USER-UUID-HERE', 'admin', 'active', 'Administrator')
on conflict (id) do update
set role = 'admin', account_status = 'active';
```

Other Admins, faculty and students are then created from inside the application. More detail is in `docs/ADMIN_SETUP.md`.

### 5. Configure environment files
Copy the examples and fill them in:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

On Windows PowerShell use `Copy-Item` instead of `cp`. Both `.env` files are ignored by Git. See the [configuration reference](#configuration-reference).

### 6. Install dependencies
```bash
cd backend
npm install
cd ../frontend
npm install
```

### 7. Optional: load the branch curriculum
```bash
cd backend
npm run seed:curriculum
```
This adds the courses for five branches and assigns them to semesters. See [Branch curriculum data](#branch-curriculum-data). It requires departments with matching names to exist (create them first under **Academic Management**).

---

## Configuration reference

### `backend/.env`

| Variable | Required | Description |
|---|---|---|
| `PORT` | no | Port for the API. Default 4000. Hosting platforms set this themselves. |
| `FRONTEND_ORIGIN` | for split hosting | Allowed browser origin(s), comma separated. Not needed when the backend serves the frontend. In development the API also allows `localhost` and `127.0.0.1` on ports 5173 to 5199. |
| `SUPABASE_URL` | yes | Project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Private service-role (secret) key. Never expose it. |
| `SMTP_HOST` | for email | For example `smtp.gmail.com`. |
| `SMTP_PORT` | for email | For example `587`. |
| `SMTP_SECURE` | for email | `true` for port 465, otherwise `false`. |
| `SMTP_USER` | for email | SMTP login. |
| `SMTP_PASS` | for email | SMTP password or Gmail app password. |
| `SMTP_FROM` | for email | Sender address. Falls back to `SMTP_USER`. |
| `NODE_ENV` | production | Set to `production` when deployed. |

If SMTP is not configured, attendance still submits and the PDF is still generated; the response says the email could not be sent.

### `frontend/.env`

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Project URL. |
| `VITE_SUPABASE_ANON_KEY` | Publishable key. Visible in the browser by design. |
| `VITE_API_BASE_URL` | API address. `http://localhost:4000/api` locally, `/api` when the backend serves the frontend. |

`VITE_` values are fixed when the frontend is built, so rebuild after changing them.

---

## Running the project

Use two terminals.

```bash
# Terminal 1: API on http://localhost:4000
cd backend
npm run dev
```

```bash
# Terminal 2: frontend on http://localhost:5173
cd frontend
npm run dev
```

Open `http://localhost:5173` and sign in with the Admin created earlier. A new student can use **Need a student account? Sign up**, and an Admin approves them under **Student verification**.

### Scripts

| Location | Command | What it does |
|---|---|---|
| `backend` | `npm run dev` | API with automatic restart |
| `backend` | `npm start` | API |
| `backend` | `npm test` | Run the test suite |
| `backend` | `npm run seed:curriculum` | Load the branch curriculum (add `-- --dry` to preview) |
| `frontend` | `npm run dev` | Development server |
| `frontend` | `npm run build` | Production build into `frontend/dist` |
| root | `npm run build` | Install and build frontend and backend |
| root | `npm start` | Start the API, which also serves `frontend/dist` if present |

---

## Branch curriculum data

`backend/data/curriculum.json` lists which courses each branch offers in each semester. It covers Electrical Engineering, Electronics Engineering, Computer Engineering, Information Technology, and Electronics and Telecommunication, for semesters 1 to 8, with core courses and concrete elective options. Placeholder slots, honors and minors are left out. The data was derived from the open-source repository https://github.com/aitwehrrg/Vijitedia.

It is used in two ways:
- **Enrollment form:** the branch and semester dropdowns offer the matching courses.
- **Seeding:** `npm run seed:curriculum` creates any missing courses and assigns each to the semester of its first appearance. It never changes or removes existing courses, so it is safe to run repeatedly.

A few first-year courses are placed in semester 1 for some branches and semester 2 for others. Each course is stored once, in its first semester; enrollment accepts either semester, but attendance follows the stored one.

---

## Testing

```bash
cd backend
npm test
```

The suite uses Node's built-in test runner with mocked database calls, so it needs no network. It covers academic validation rules, student verification and approval, the student profile, faculty dashboard scoping, feedback rating validation, date and time formatting, laboratory course detection, and hall ticket PDF generation.

---

## Deployment

The project deploys as a single web service: the Express server serves the API under `/api` and the built frontend for every other address. Supabase stays as the hosted database. These steps use Render; any host that runs a Node web service works the same way.

1. Push the repository to GitHub.
2. In Render choose **New > Web Service** and select the repository.
3. Settings: leave **Root Directory** empty, **Build Command** `npm run build`, **Start Command** `npm start`.
4. Add environment variables:

```
NODE_ENV=production
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_API_BASE_URL=/api
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SMTP_HOST=...
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=...
```

5. Deploy, then open the service address (`https://<name>.onrender.com`).
6. In Supabase, under **Authentication > URL Configuration**, set the Site URL to that address and add `<address>/**` to the redirect URLs.

Notes:
- `NODE_ENV=production` makes `npm install` skip dev tools by default, so the root build script installs the frontend with `--include=dev`.
- Changing a `VITE_` value requires a rebuild (clear the build cache and deploy).
- Free tiers put an idle service to sleep, so the first request afterwards can take around a minute.
- To host the frontend separately (for example on a static host), set `VITE_API_BASE_URL` to the full backend address and `FRONTEND_ORIGIN` on the backend to the frontend address.

The server sends a Content Security Policy that allows the application's own files, Google Fonts, and the project's Supabase address. If you add other external resources, extend the policy in `backend/src/server.js`.

---

## API reference

All routes are under `/api`. Unless marked public, requests need `Authorization: Bearer <Supabase access token>`.

### General
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/health` | public | Service status |
| POST | `/registrations/validate` | public | Check sign-up name and email |
| GET | `/auth/me` | any signed in user | Current user and profile |
| GET | `/reports/summary` | Admin | Counts of active students, faculty, departments, courses, subjects |

### Admin
| Method | Path | Description |
|---|---|---|
| GET, POST | `/admins` | List or create Admins |
| GET | `/registrations/pending` | Pending student registrations |
| POST | `/registrations/:profileId/review` | Approve or reject (`decision`: `approve` or `reject`) |
| GET | `/students` | Search and list. Query: `q`, `department_id`, `course_id`, `status`, `limit`, `offset` |
| GET | `/students/options` | Departments, courses (with their semester) and semesters for forms |
| GET | `/students/curriculum` | Branch curriculum resolved to database ids |
| GET | `/students/:id` | One student with enrollments |
| POST | `/students` | Create a student with login |
| PATCH | `/students/:id` | Edit details, optionally set a new password |
| PATCH | `/students/:id/status` | Activate or deactivate |
| GET, PUT | `/students/:id/enrollments` | Read or replace course enrollments |
| GET | `/faculty-management`, `/faculty-management/options` | Faculty list and department options |
| POST | `/faculty-management` | Create a faculty account |
| PATCH | `/faculty-management/:id/status` | Activate or deactivate |
| GET | `/academic` | All academic data in one call |
| POST, PATCH | `/academic/{years,semesters,departments,courses}[/:id]` | Create or update records |
| GET | `/exam-feedback/admin/options` | Branches, semesters and exam types |
| GET, POST | `/exam-feedback/admin/rounds` | List or create feedback rounds |
| GET, PUT, DELETE | `/exam-feedback/admin/rounds/:id` | Read, edit (deadline, status, schedule) or delete a round |
| GET | `/exam-feedback/admin/rounds/:id/results` | Anonymous averages per teacher and subject |

### Faculty
| Method | Path | Description |
|---|---|---|
| GET | `/faculty/me/dashboard` | Profile and assigned courses |
| GET | `/faculty/me/attendance/courses` | Assigned courses with their semester |
| GET | `/faculty/me/attendance/sessions` | Sessions for a course and semester |
| GET | `/faculty/me/attendance/roster` | Enrolled students and any saved marks for a date |
| POST | `/faculty/me/attendance/sessions` | Create or update a session |
| POST | `/faculty/me/attendance/sessions/:id/submit` | Submit, build the PDF, send the email |
| POST | `/faculty/me/attendance/sessions/:id/reopen` | Reopen for edits |

### Student
| Method | Path | Description |
|---|---|---|
| GET, PATCH | `/profile/me` | Read the profile, or update the phone number |
| PUT, DELETE | `/profile/me/photo` | Upload (base64 JSON body) or remove the photo |
| GET | `/profile/me/attendance` | Per-subject attendance and recent sessions |
| GET | `/exam-feedback/student/rounds` | Rounds that apply to the student |
| GET | `/exam-feedback/student/rounds/:id` | Subjects, teachers, questions and answer scale |
| POST | `/exam-feedback/student/rounds/:id/submit` | Submit feedback |
| GET | `/exam-feedback/student/rounds/:id/hallticket` | Hall ticket PDF (after submitting) |

---

## Security notes

- Keep `SUPABASE_SERVICE_ROLE_KEY` and `SMTP_PASS` out of Git and out of the frontend. `.env` files are ignored by default.
- The backend authorises every route by the role stored in `profiles`, and student routes also require an active student record. Admins and faculty cannot use student-only routes such as photo upload, and the reverse also holds.
- Responses to unexpected errors do not include internal details, and an unhandled failure in one request does not stop the server.
- Passwords are handled by Supabase Auth and are never stored in application tables.
- If a key is ever exposed, rotate it in Supabase and update the backend environment.

---

## Current limitations

- **Timetable, academic calendar and fees** are placeholders with no data model yet.
- **Profile correction requests, CSV import and export, and detailed reports** have database tables but no screens.
- **Audit logging** covers registration approvals only.
- **Password reset** has no in-app flow; Admins can set a new password for a student, and Supabase's own recovery email works if enabled.
- **Rate limiting** on sign-in and sign-up is not implemented. Add it before exposing the application to the open internet.
- A student's **branch** is not stored on the student record; it is chosen when enrolling.
- Attendance allows **one session per course per day**.
- Admins cannot view or correct attendance; only faculty can.
