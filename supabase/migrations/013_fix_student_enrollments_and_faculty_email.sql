-- Migration 013: make student course enrollments usable and backfill faculty email.
--
-- Migration 008 created student_semester_enrollments with constraints that do not
-- match how the application uses it:
--   * a composite FK (student_id, course_id) -> students(id, course_id) forced every
--     enrollment course to equal students.course_id, which is not set for new students;
--   * UNIQUE (student_id, semester_id) allowed only one course per semester, while the
--     Admin UI supports several courses and the API upserts on
--     (student_id, course_id, semester_id), a constraint that did not exist.
-- This migration is idempotent and preserves existing enrollment rows.

BEGIN;

ALTER TABLE public.student_semester_enrollments
  DROP CONSTRAINT IF EXISTS student_enrollments_student_course_fk;

ALTER TABLE public.student_semester_enrollments
  DROP CONSTRAINT IF EXISTS student_enrollments_unique_student_semester;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'student_enrollments_student_fk'
      AND conrelid = 'public.student_semester_enrollments'::regclass
  ) THEN
    ALTER TABLE public.student_semester_enrollments
      ADD CONSTRAINT student_enrollments_student_fk
      FOREIGN KEY (student_id)
      REFERENCES public.students(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'student_enrollments_unique_student_course_semester'
      AND conrelid = 'public.student_semester_enrollments'::regclass
  ) THEN
    ALTER TABLE public.student_semester_enrollments
      ADD CONSTRAINT student_enrollments_unique_student_course_semester
      UNIQUE (student_id, course_id, semester_id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_student_enrollments_student
  ON public.student_semester_enrollments(student_id, status);

CREATE INDEX IF NOT EXISTS idx_student_enrollments_course_semester
  ON public.student_semester_enrollments(course_id, semester_id, status);

-- Faculty accounts created before this migration did not store their email.
UPDATE public.faculty AS f
SET email = u.email
FROM auth.users AS u
WHERE u.id = f.profile_id
  AND (f.email IS NULL OR btrim(f.email) = '');

NOTIFY pgrst, 'reload schema';

COMMIT;
