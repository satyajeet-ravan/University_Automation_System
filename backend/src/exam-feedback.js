import { Router } from 'express';
import {
  requireAuth,
  requireAdmin,
  requireVerifiedStudent
} from './middleware/auth.js';
import { getCurriculum, resolveCurriculum } from './curriculum.js';
import {
  EXAM_TYPES,
  FEEDBACK_CRITERIA,
  FEEDBACK_LEVELS,
  isLabCourse,
  normalizeRatings,
  shortTime,
  validDate,
  validTime
} from './feedback-config.js';
import { generateHallTicketPdf } from './hall-ticket.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ROUND_SELECT =
  'id, program_code, program_name, semester_id, exam_type, deadline, status, created_at, updated_at, semester:semesters(id, label, semester_number, academic_year:academic_years(id, label, year_code))';

const SUBJECT_SELECT =
  'id, round_id, course_id, exam_date, start_time, end_time, course:courses(id, code, name)';

class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

// PostgREST reports a missing table with this code (migration 014 not applied).
function isMissingTable(error) {
  return error?.code === 'PGRST205' || error?.code === '42P01';
}

function isPastDeadline(round) {
  return new Date(round.deadline).getTime() < Date.now();
}

function acceptsSubmissions(round) {
  return round.status === 'open' && !isPastDeadline(round);
}

function check(result, message) {
  if (result.error) {
    console.error(`[exam-feedback] ${message}:`, result.error.message);
    const missing = isMissingTable(result.error);
    const failure = new HttpError(
      500,
      `Could not ${message}. Verify that migration 014 has been applied.`
    );

    failure.missingTable = missing;
    throw failure;
  }

  return result.data;
}

export function createExamFeedbackRouter(db, photoHandlers) {
  const router = Router();

  // Wraps handlers so thrown HttpErrors become clean JSON responses.
  const handle = fn => async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof HttpError) {
        return res.status(error.status).json({
          error: error.message,
          ...(error.fields ? { fields: error.fields } : {})
        });
      }

      console.error('[exam-feedback] Unexpected failure:', error?.message || error);

      if (!res.headersSent) {
        res.status(500).json({ error: 'Unexpected server error.' });
      }
    }
  };

  function requireUuid(value, label) {
    if (!UUID_PATTERN.test(value || '')) {
      throw new HttpError(400, `Invalid ${label}.`);
    }
  }

  async function loadCurriculumForAdmin() {
    const [departments, semesters, courses] = await Promise.all([
      db.from('departments').select('id, name'),
      db.from('semesters').select('id, semester_number, label, status, academic_year:academic_years(id, label, year_code)'),
      db.from('courses').select('id, code, name').eq('status', 'active')
    ]);

    const semesterRows = check(semesters, 'load semesters');

    return {
      semesters: semesterRows,
      programs: resolveCurriculum({
        curriculum: getCurriculum(),
        departments: check(departments, 'load departments'),
        semesters: semesterRows.filter(item => item.status === 'active'),
        courses: check(courses, 'load courses')
      })
    };
  }

  async function loadRound(id) {
    requireUuid(id, 'feedback round ID');

    const round = check(
      await db.from('exam_feedback_rounds').select(ROUND_SELECT).eq('id', id).maybeSingle(),
      'load the feedback round'
    );

    if (!round) throw new HttpError(404, 'Feedback round not found.');
    return round;
  }

  async function loadSubjects(roundId) {
    const rows = check(
      await db
        .from('exam_round_subjects')
        .select(SUBJECT_SELECT)
        .eq('round_id', roundId),
      'load the exam subjects'
    );

    return rows
      .filter(row => row.course)
      .sort((a, b) =>
        `${a.exam_date}${a.start_time}`.localeCompare(`${b.exam_date}${b.start_time}`)
      );
  }

  async function enrolledCourseIds(studentId, semesterId) {
    const rows = check(
      await db
        .from('student_semester_enrollments')
        .select('course_id')
        .eq('student_id', studentId)
        .eq('semester_id', semesterId)
        .eq('status', 'enrolled'),
      'load student enrollments'
    );

    return new Set(rows.map(row => row.course_id));
  }

  async function findStudent(profileId) {
    const student = check(
      await db
        .from('students')
        .select('id, student_code, full_name, status')
        .eq('profile_id', profileId)
        .maybeSingle(),
      'load the student record'
    );

    if (!student) throw new HttpError(404, 'No student record is linked to this account.');
    return student;
  }

  // The subjects of a round that a student is enrolled in, and the teacher
  // pairs they must rate.
  async function studentRoundScope(round, student) {
    const subjects = await loadSubjects(round.id);
    const enrolled = await enrolledCourseIds(student.id, round.semester_id);
    const mine = subjects.filter(subject => enrolled.has(subject.course_id));

    let items = [];

    if (mine.length) {
      const assignments = check(
        await db
          .from('course_faculty_assignments')
          .select('course_id, faculty:faculty(id, full_name, designation, status)')
          .in('course_id', mine.map(subject => subject.course_id))
          .eq('status', 'active'),
        'load course teachers'
      );

      const subjectById = new Map(mine.map(subject => [subject.course_id, subject]));

      items = assignments
        .filter(item => item.faculty && item.faculty.status === 'active')
        .map(item => ({
          course: subjectById.get(item.course_id).course,
          faculty: {
            id: item.faculty.id,
            full_name: item.faculty.full_name,
            designation: item.faculty.designation
          }
        }))
        .sort((a, b) =>
          a.course.name.localeCompare(b.course.name) ||
          a.faculty.full_name.localeCompare(b.faculty.full_name)
        );
    }

    return { subjects: mine, items };
  }

  async function findSubmission(roundId, studentId) {
    return check(
      await db
        .from('feedback_submissions')
        .select('id, submitted_at')
        .eq('round_id', roundId)
        .eq('student_id', studentId)
        .maybeSingle(),
      'load the feedback submission'
    );
  }

  // ---------------------------------------------------------------- Admin

  const adminOnly = [requireAuth, requireAdmin];

  router.get('/admin/options', adminOnly, handle(async (_req, res) => {
    const { programs, semesters } = await loadCurriculumForAdmin();

    res.json({
      programs,
      semesters: semesters
        .filter(item => item.status === 'active')
        .sort((a, b) => a.semester_number - b.semester_number),
      exam_types: EXAM_TYPES
    });
  }));

  async function validateRoundSubjects(programCode, semesterId, subjectsInput) {
    if (!Array.isArray(subjectsInput) || subjectsInput.length === 0) {
      throw new HttpError(400, 'Add the exam date and time for at least one subject.');
    }

    if (subjectsInput.length > 60) {
      throw new HttpError(400, 'Too many subjects in one round.');
    }

    const { programs } = await loadCurriculumForAdmin();
    const program = programs.find(item => item.id === programCode);

    if (!program) throw new HttpError(400, 'Select a valid branch.');

    const semester = program.semesters.find(item => item.semester_id === semesterId);

    if (!semester) {
      throw new HttpError(400, 'This branch has no courses in the selected semester.');
    }

    const allowed = new Set(semester.courses.map(course => course.id));
    const seen = new Set();
    const rows = [];

    for (const [index, item] of subjectsInput.entries()) {
      const fields = { [`subject_${index}`]: 'Check this subject.' };

      if (!UUID_PATTERN.test(item?.course_id || '') || !allowed.has(item.course_id)) {
        throw new HttpError(400, 'A selected subject does not belong to this branch and semester.', fields);
      }

      if (seen.has(item.course_id)) {
        throw new HttpError(400, 'A subject was added more than once.', fields);
      }

      if (!validDate(item.exam_date)) {
        throw new HttpError(400, 'Enter a valid exam date for every subject.', fields);
      }

      if (!validTime(item.start_time) || !validTime(item.end_time)) {
        throw new HttpError(400, 'Enter a valid start and end time for every subject.', fields);
      }

      if (shortTime(item.start_time) >= shortTime(item.end_time)) {
        throw new HttpError(400, 'The end time must be after the start time.', fields);
      }

      seen.add(item.course_id);
      rows.push({
        course_id: item.course_id,
        exam_date: item.exam_date,
        start_time: shortTime(item.start_time),
        end_time: shortTime(item.end_time)
      });
    }

    return { program, rows };
  }

  function parseDeadline(value) {
    const deadline = new Date(value);

    if (typeof value !== 'string' || Number.isNaN(deadline.getTime())) {
      throw new HttpError(400, 'Enter a valid feedback deadline.', {
        deadline: 'Enter a valid deadline.'
      });
    }

    return deadline;
  }

  router.post('/admin/rounds', adminOnly, handle(async (req, res) => {
    const body = req.body || {};

    if (!EXAM_TYPES.includes(body.exam_type)) {
      throw new HttpError(400, 'Choose MST or ESE.', { exam_type: 'Choose MST or ESE.' });
    }

    if (!UUID_PATTERN.test(body.semester_id || '')) {
      throw new HttpError(400, 'Select a semester.', { semester_id: 'Select a semester.' });
    }

    const deadline = parseDeadline(body.deadline);

    if (deadline.getTime() <= Date.now()) {
      throw new HttpError(400, 'The deadline must be in the future.', {
        deadline: 'Pick a date and time in the future.'
      });
    }

    const { program, rows } = await validateRoundSubjects(
      body.program_code,
      body.semester_id,
      body.subjects
    );

    const created = await db
      .from('exam_feedback_rounds')
      .insert({
        program_code: program.id,
        program_name: program.name,
        semester_id: body.semester_id,
        exam_type: body.exam_type,
        deadline: deadline.toISOString(),
        status: 'open',
        created_by: req.user.id
      })
      .select('id')
      .single();

    if (created.error) {
      if (created.error.code === '23505') {
        throw new HttpError(409, 'A feedback round already exists for this branch, semester and exam. Edit it instead.');
      }

      check(created, 'create the feedback round');
    }

    const inserted = await db
      .from('exam_round_subjects')
      .insert(rows.map(row => ({ ...row, round_id: created.data.id })));

    if (inserted.error) {
      await db.from('exam_feedback_rounds').delete().eq('id', created.data.id);
      check(inserted, 'save the exam subjects');
    }

    res.status(201).json({ round: await loadRound(created.data.id) });
  }));

  router.get('/admin/rounds', adminOnly, handle(async (_req, res) => {
    const rounds = check(
      await db
        .from('exam_feedback_rounds')
        .select(ROUND_SELECT)
        .order('created_at', { ascending: false }),
      'load feedback rounds'
    );

    const detailed = await Promise.all(rounds.map(async round => {
      const [subjects, submissions] = await Promise.all([
        db.from('exam_round_subjects').select('course_id').eq('round_id', round.id),
        db.from('feedback_submissions')
          .select('id', { count: 'exact', head: true })
          .eq('round_id', round.id)
      ]);

      const courseIds = check(subjects, 'load the exam subjects').map(row => row.course_id);
      let eligible = 0;

      if (courseIds.length) {
        const enrolled = check(
          await db
            .from('student_semester_enrollments')
            .select('student_id')
            .eq('semester_id', round.semester_id)
            .eq('status', 'enrolled')
            .in('course_id', courseIds),
          'count eligible students'
        );

        eligible = new Set(enrolled.map(row => row.student_id)).size;
      }

      check(submissions, 'count submissions');

      return {
        ...round,
        subject_count: courseIds.length,
        submission_count: submissions.count || 0,
        eligible_count: eligible,
        accepting: acceptsSubmissions(round)
      };
    }));

    res.json({ rounds: detailed });
  }));

  router.get('/admin/rounds/:id', adminOnly, handle(async (req, res) => {
    const round = await loadRound(req.params.id);
    const subjects = await loadSubjects(round.id);

    res.json({ round, subjects });
  }));

  router.put('/admin/rounds/:id', adminOnly, handle(async (req, res) => {
    const round = await loadRound(req.params.id);
    const body = req.body || {};
    const updates = { updated_at: new Date().toISOString() };

    if (body.deadline !== undefined) {
      updates.deadline = parseDeadline(body.deadline).toISOString();
    }

    if (body.status !== undefined) {
      if (!['open', 'closed'].includes(body.status)) {
        throw new HttpError(400, 'Status must be open or closed.');
      }

      updates.status = body.status;
    }

    let newRows = null;

    if (body.subjects !== undefined) {
      ({ rows: newRows } = await validateRoundSubjects(
        round.program_code,
        round.semester_id,
        body.subjects
      ));
    }

    check(
      await db.from('exam_feedback_rounds').update(updates).eq('id', round.id),
      'update the feedback round'
    );

    if (newRows) {
      const previous = await loadSubjects(round.id);

      check(
        await db.from('exam_round_subjects').delete().eq('round_id', round.id),
        'replace the exam subjects'
      );

      const inserted = await db
        .from('exam_round_subjects')
        .insert(newRows.map(row => ({ ...row, round_id: round.id })));

      if (inserted.error) {
        // Put the previous schedule back so the round is never left empty.
        await db.from('exam_round_subjects').insert(previous.map(item => ({
          round_id: round.id,
          course_id: item.course_id,
          exam_date: item.exam_date,
          start_time: item.start_time,
          end_time: item.end_time
        })));

        check(inserted, 'replace the exam subjects');
      }
    }

    res.json({ round: await loadRound(round.id) });
  }));

  router.delete('/admin/rounds/:id', adminOnly, handle(async (req, res) => {
    const round = await loadRound(req.params.id);

    const submissions = await db
      .from('feedback_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('round_id', round.id);

    check(submissions, 'check submissions');

    if ((submissions.count || 0) > 0) {
      throw new HttpError(409, 'Students have already submitted feedback. Close the round instead of deleting it.');
    }

    check(
      await db.from('exam_feedback_rounds').delete().eq('id', round.id),
      'delete the feedback round'
    );

    res.json({ success: true });
  }));

  // Anonymous aggregate of the feedback given for each teacher and subject.
  router.get('/admin/rounds/:id/results', adminOnly, handle(async (req, res) => {
    const round = await loadRound(req.params.id);

    const submissions = check(
      await db.from('feedback_submissions').select('id').eq('round_id', round.id),
      'load submissions'
    );

    const results = [];

    if (submissions.length) {
      const responses = check(
        await db
          .from('feedback_responses')
          .select('course_id, faculty_id, ratings, course:courses(id, code, name), faculty:faculty(id, full_name)')
          .in('submission_id', submissions.map(item => item.id)),
        'load feedback responses'
      );

      const groups = new Map();

      for (const response of responses) {
        const key = `${response.course_id}:${response.faculty_id}`;
        const group = groups.get(key) || {
          course: response.course,
          faculty: response.faculty,
          count: 0,
          totals: Object.fromEntries(FEEDBACK_CRITERIA.map(item => [item.key, 0]))
        };

        group.count += 1;

        for (const { key: criterion } of FEEDBACK_CRITERIA) {
          group.totals[criterion] += Number(response.ratings?.[criterion]) || 0;
        }

        groups.set(key, group);
      }

      for (const group of groups.values()) {
        const averages = {};
        let sum = 0;

        for (const { key } of FEEDBACK_CRITERIA) {
          averages[key] = Math.round((group.totals[key] / group.count) * 100) / 100;
          sum += averages[key];
        }

        results.push({
          course: group.course,
          faculty: group.faculty,
          responses: group.count,
          averages,
          overall: Math.round((sum / FEEDBACK_CRITERIA.length) * 100) / 100
        });
      }

      results.sort((a, b) =>
        (a.course?.name || '').localeCompare(b.course?.name || '') ||
        (a.faculty?.full_name || '').localeCompare(b.faculty?.full_name || '')
      );
    }

    res.json({
      round,
      criteria: FEEDBACK_CRITERIA,
      submission_count: submissions.length,
      results
    });
  }));

  // -------------------------------------------------------------- Student

  const studentOnly = [requireAuth, requireVerifiedStudent];

  function roundSummary(round, submission, subjectCount) {
    const submitted = Boolean(submission);

    return {
      id: round.id,
      program_name: round.program_name,
      exam_type: round.exam_type,
      semester: round.semester,
      deadline: round.deadline,
      subject_count: subjectCount,
      status: submitted
        ? 'submitted'
        : acceptsSubmissions(round) ? 'open' : 'closed',
      submitted_at: submission?.submitted_at || null
    };
  }

  router.get('/student/rounds', studentOnly, handle(async (req, res) => {
    const student = await findStudent(req.user.id);

    const enrollments = check(
      await db
        .from('student_semester_enrollments')
        .select('course_id, semester_id')
        .eq('student_id', student.id)
        .eq('status', 'enrolled'),
      'load student enrollments'
    );

    const enrolledKeys = new Set(
      enrollments.map(item => `${item.course_id}:${item.semester_id}`)
    );

    if (!enrollments.length) return res.json({ rounds: [] });

    let rounds;

    try {
      rounds = check(
        await db
          .from('exam_feedback_rounds')
          .select(ROUND_SELECT)
          .in('semester_id', [...new Set(enrollments.map(item => item.semester_id))])
          .order('deadline', { ascending: false }),
        'load feedback rounds'
      );
    } catch (error) {
      // Before the feedback tables exist there is simply nothing to show.
      if (error.missingTable) return res.json({ rounds: [] });
      throw error;
    }

    if (!rounds.length) return res.json({ rounds: [] });

    const [subjects, submissions] = await Promise.all([
      db.from('exam_round_subjects')
        .select('round_id, course_id')
        .in('round_id', rounds.map(round => round.id)),
      db.from('feedback_submissions')
        .select('round_id, submitted_at')
        .eq('student_id', student.id)
    ]);

    const subjectRows = check(subjects, 'load the exam subjects');
    const submissionByRound = new Map(
      check(submissions, 'load submissions').map(item => [item.round_id, item])
    );

    const summaries = [];

    for (const round of rounds) {
      const mine = subjectRows.filter(
        row =>
          row.round_id === round.id &&
          enrolledKeys.has(`${row.course_id}:${round.semester_id}`)
      );

      if (mine.length) {
        summaries.push(roundSummary(round, submissionByRound.get(round.id), mine.length));
      }
    }

    res.json({ rounds: summaries });
  }));

  router.get('/student/rounds/:id', studentOnly, handle(async (req, res) => {
    const student = await findStudent(req.user.id);
    const round = await loadRound(req.params.id);
    const scope = await studentRoundScope(round, student);

    if (!scope.subjects.length) {
      throw new HttpError(404, 'This feedback round does not apply to you.');
    }

    const submission = await findSubmission(round.id, student.id);

    res.json({
      round: roundSummary(round, submission, scope.subjects.length),
      subjects: scope.subjects
        .filter(item => !isLabCourse(item.course.code))
        .map(item => ({
        course: item.course,
        exam_date: item.exam_date,
        start_time: shortTime(item.start_time),
        end_time: shortTime(item.end_time)
      })),
      items: scope.items,
      criteria: FEEDBACK_CRITERIA,
      levels: FEEDBACK_LEVELS
    });
  }));

  router.post('/student/rounds/:id/submit', studentOnly, handle(async (req, res) => {
    const student = await findStudent(req.user.id);
    const round = await loadRound(req.params.id);
    const scope = await studentRoundScope(round, student);

    if (!scope.subjects.length) {
      throw new HttpError(404, 'This feedback round does not apply to you.');
    }

    if (await findSubmission(round.id, student.id)) {
      throw new HttpError(409, 'You have already submitted feedback for this exam.');
    }

    if (!acceptsSubmissions(round)) {
      throw new HttpError(403, 'The feedback deadline for this exam has passed.');
    }

    const responses = req.body?.responses;

    if (!Array.isArray(responses)) {
      throw new HttpError(400, 'Feedback responses are missing.');
    }

    const required = new Set(
      scope.items.map(item => `${item.course.id}:${item.faculty.id}`)
    );
    const rows = [];
    const seen = new Set();

    for (const response of responses) {
      const key = `${response?.course_id}:${response?.faculty_id}`;

      if (!required.has(key) || seen.has(key)) {
        throw new HttpError(400, 'The feedback contains an unknown or repeated subject.');
      }

      const ratings = normalizeRatings(response.ratings);

      if (!ratings) {
        throw new HttpError(400, 'Rate every item for every subject before submitting.');
      }

      const comments =
        typeof response.comments === 'string' && response.comments.trim()
          ? response.comments.trim().slice(0, 500)
          : null;

      seen.add(key);
      rows.push({
        course_id: response.course_id,
        faculty_id: response.faculty_id,
        ratings,
        comments
      });
    }

    if (seen.size !== required.size) {
      throw new HttpError(400, 'Give feedback for every subject and teacher before submitting.');
    }

    const created = await db
      .from('feedback_submissions')
      .insert({ round_id: round.id, student_id: student.id })
      .select('id, submitted_at')
      .single();

    if (created.error) {
      if (created.error.code === '23505') {
        throw new HttpError(409, 'You have already submitted feedback for this exam.');
      }

      check(created, 'save your feedback');
    }

    if (rows.length) {
      const inserted = await db
        .from('feedback_responses')
        .insert(rows.map(row => ({ ...row, submission_id: created.data.id })));

      if (inserted.error) {
        // Remove the empty submission so the student can try again.
        await db.from('feedback_submissions').delete().eq('id', created.data.id);
        check(inserted, 'save your feedback');
      }
    }

    res.status(201).json({
      message: 'Feedback submitted. Your hall ticket is now available.',
      submitted_at: created.data.submitted_at
    });
  }));

  router.get('/student/rounds/:id/hallticket', studentOnly, handle(async (req, res) => {
    const student = await findStudent(req.user.id);
    const round = await loadRound(req.params.id);
    const scope = await studentRoundScope(round, student);

    if (!scope.subjects.length) {
      throw new HttpError(404, 'This hall ticket does not apply to you.');
    }

    if (!(await findSubmission(round.id, student.id))) {
      throw new HttpError(403, 'Submit your faculty feedback to unlock this hall ticket.');
    }

    const photo = photoHandlers ? await photoHandlers.download(student.id) : null;
    const isSupportedPhoto =
      photo && (photo[0] === 0xff || photo.subarray(1, 4).toString('ascii') === 'PNG');

    const pdf = await generateHallTicketPdf({
      student,
      round: {
        program_name: round.program_name,
        exam_type: round.exam_type,
        semester_number: round.semester?.semester_number
      },
      subjects: scope.subjects
        .filter(item => !isLabCourse(item.course.code))
        .map(item => ({
          code: item.course.code,
          title: item.course.name,
          exam_date: item.exam_date,
          start_time: item.start_time,
          end_time: item.end_time
        })),
      photo: isSupportedPhoto ? photo : null
    });

    res
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="hall-ticket-${round.exam_type}-${student.student_code}.pdf"`,
        'Cache-Control': 'no-store'
      })
      .send(pdf);
  }));

  return router;
}
