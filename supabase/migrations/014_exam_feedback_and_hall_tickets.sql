-- Migration 014: faculty feedback rounds and exam hall tickets.
--
-- Admin opens a feedback round for a branch, semester and exam (MST or ESE),
-- sets a deadline and the exam date/time of each subject. Students rate the
-- teacher of every subject they are enrolled in; once their feedback is
-- submitted they can download the hall ticket for that exam.
-- All access goes through the backend (service role), so no client policies.

BEGIN;

CREATE TABLE IF NOT EXISTS public.exam_feedback_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_code text NOT NULL,
  program_name text NOT NULL,
  semester_id uuid NOT NULL
    REFERENCES public.semesters(id) ON DELETE RESTRICT,
  exam_type text NOT NULL CHECK (exam_type IN ('MST', 'ESE')),
  deadline timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_feedback_rounds_unique
    UNIQUE (program_code, semester_id, exam_type)
);

CREATE TABLE IF NOT EXISTS public.exam_round_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL
    REFERENCES public.exam_feedback_rounds(id) ON DELETE CASCADE,
  course_id uuid NOT NULL
    REFERENCES public.courses(id) ON DELETE RESTRICT,
  exam_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_round_subjects_unique UNIQUE (round_id, course_id),
  CONSTRAINT exam_round_subjects_valid_time CHECK (start_time < end_time)
);

CREATE TABLE IF NOT EXISTS public.feedback_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL
    REFERENCES public.exam_feedback_rounds(id) ON DELETE CASCADE,
  student_id uuid NOT NULL
    REFERENCES public.students(id) ON DELETE RESTRICT,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_submissions_unique UNIQUE (round_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.feedback_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL
    REFERENCES public.feedback_submissions(id) ON DELETE CASCADE,
  course_id uuid NOT NULL
    REFERENCES public.courses(id) ON DELETE RESTRICT,
  faculty_id uuid NOT NULL
    REFERENCES public.faculty(id) ON DELETE RESTRICT,
  -- {"communication": 1..5, "knowledge": 1..5, ...}; 1 = worst, 5 = excellent
  ratings jsonb NOT NULL,
  comments text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_responses_unique
    UNIQUE (submission_id, course_id, faculty_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_round_subjects_round
  ON public.exam_round_subjects(round_id);
CREATE INDEX IF NOT EXISTS idx_feedback_submissions_student
  ON public.feedback_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_feedback_responses_submission
  ON public.feedback_responses(submission_id);
CREATE INDEX IF NOT EXISTS idx_feedback_responses_faculty
  ON public.feedback_responses(faculty_id, course_id);

ALTER TABLE public.exam_feedback_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_round_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_responses ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

COMMIT;
