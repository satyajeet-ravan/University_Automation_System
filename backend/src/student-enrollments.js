
import { Router } from 'express';
import { requireAuth, requireAdmin } from './middleware/auth.js';
import { getCurriculum } from './curriculum.js';

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createStudentEnrollmentsRouter(supabaseAdmin) {
    const router = Router();

    router.use(requireAuth, requireAdmin);

    // Return all enrollment records for one student.
    router.get('/:studentId/enrollments', async (req, res) => {
        const { studentId } = req.params;

        if (!UUID_PATTERN.test(studentId)) {
            return res.status(400).json({ error: 'Invalid student ID.' });
        }

        try {
            const { data, error } = await supabaseAdmin
                .from('student_semester_enrollments')
                .select(`
          id,
          student_id,
          course_id,
          semester_id,
          status,
          course:courses(id, name, code),
          semester:semesters(
            id,
            label,
            semester_number,
            academic_year:academic_years(id, label, year_code)
          )
        `)
                .eq('student_id', studentId)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('[enrollments] Load failed:', error.message);
                return res.status(500).json({
                    error: 'Could not load student enrollments.'
                });
            }

            return res.json({ enrollments: data || [] });
        } catch (error) {
            console.error('[enrollments] Unexpected load error:', error.message);
            return res.status(500).json({
                error: 'Could not load student enrollments.'
            });
        }
    });

    // Replace a student's currently enrolled course-semester combinations.
    router.put('/:studentId/enrollments', async (req, res) => {
        const { studentId } = req.params;
        const enrollments = req.body?.enrollments;

        if (!UUID_PATTERN.test(studentId)) {
            return res.status(400).json({ error: 'Invalid student ID.' });
        }

        if (!Array.isArray(enrollments)) {
            return res.status(400).json({
                error: 'Enrollments must be an array.'
            });
        }

        if (enrollments.length > 100) {
            return res.status(400).json({
                error: 'A student cannot have more than 100 course enrollments.'
            });
        }

        const unique = new Set();

        for (const enrollment of enrollments) {
            if (
                !UUID_PATTERN.test(enrollment?.course_id || '') ||
                !UUID_PATTERN.test(enrollment?.semester_id || '')
            ) {
                return res.status(400).json({
                    error: 'Every enrollment requires a valid course and semester.'
                });
            }

            const key = `${enrollment.course_id}:${enrollment.semester_id}`;

            if (unique.has(key)) {
                return res.status(400).json({
                    error: 'Duplicate course and semester selections are not allowed.'
                });
            }

            unique.add(key);
        }

        try {
            const { data: student, error: studentError } = await supabaseAdmin
                .from('students')
                .select('id, status')
                .eq('id', studentId)
                .maybeSingle();

            if (studentError) {
                console.error('[enrollments] Student lookup failed:', studentError.message);
                return res.status(500).json({
                    error: 'Could not validate the student.'
                });
            }

            if (!student) {
                return res.status(404).json({ error: 'Student not found.' });
            }

            if (enrollments.length) {
                const courseIds = [...new Set(enrollments.map(item => item.course_id))];
                const semesterIds = [...new Set(enrollments.map(item => item.semester_id))];

                const [coursesResult, semestersResult] = await Promise.all([
                    supabaseAdmin
                        .from('courses')
                        .select('id, status')
                        .in('id', courseIds),

                    supabaseAdmin
                        .from('semesters')
                        .select('id, status, semester_number')
                        .in('id', semesterIds)
                ]);

                if (coursesResult.error || semestersResult.error) {
                    return res.status(500).json({
                        error: 'Could not validate the selected courses and semesters.'
                    });
                }

                const activeCourses = new Set(
                    (coursesResult.data || [])
                        .filter(item => item.status === 'active')
                        .map(item => item.id)
                );

                const activeSemesters = new Set(
                    (semestersResult.data || [])
                        .filter(item => item.status === 'active')
                        .map(item => item.id)
                );

                for (const enrollment of enrollments) {
                    if (!activeCourses.has(enrollment.course_id)) {
                        return res.status(400).json({
                            error: 'One or more selected courses are inactive or unavailable.'
                        });
                    }

                    if (!activeSemesters.has(enrollment.semester_id)) {
                        return res.status(400).json({
                            error: 'One or more selected semesters are inactive or unavailable.'
                        });
                    }
                }

                // A course runs in the semester it is assigned to in Academic
                // Management; enrolling elsewhere would hide the student from
                // the faculty attendance roster.
                const { data: courseSemesters, error: courseSemesterError } =
                    await supabaseAdmin
                        .from('course_semester_assignments')
                        .select('course_id, semester_id')
                        .in('course_id', courseIds)
                        .eq('status', 'active');

                if (courseSemesterError) {
                    return res.status(500).json({
                        error: 'Could not validate the course semester assignments.'
                    });
                }

                const assigned = new Set(
                    (courseSemesters || []).map(item => `${item.course_id}:${item.semester_id}`)
                );

                // A few shared courses sit in different semesters for different
                // branches, so the branch curriculum is accepted as well.
                const numberBySemester = new Map(
                    (semestersResult.data || []).map(item => [item.id, item.semester_number])
                );
                const codeByCourse = new Map();
                const { data: courseCodes } = await supabaseAdmin
                    .from('courses')
                    .select('id, code')
                    .in('id', courseIds);
                for (const item of courseCodes || []) codeByCourse.set(item.id, item.code);

                const curriculumPairs = new Set();
                for (const program of getCurriculum()) {
                    for (const semester of program.semesters) {
                        for (const course of semester.courses) {
                            curriculumPairs.add(`${course.code}:${semester.number}`);
                        }
                    }
                }

                for (const enrollment of enrollments) {
                    const inCurriculum = curriculumPairs.has(
                        `${codeByCourse.get(enrollment.course_id)}:${numberBySemester.get(enrollment.semester_id)}`
                    );

                    if (
                        !assigned.has(`${enrollment.course_id}:${enrollment.semester_id}`) &&
                        !inCurriculum
                    ) {
                        return res.status(400).json({
                            error: 'Each course can only be enrolled in the semester it is assigned to in Academic Management.'
                        });
                    }
                }
            }

            const { data: existing, error: existingError } = await supabaseAdmin
                .from('student_semester_enrollments')
                .select('id, course_id, semester_id, status')
                .eq('student_id', studentId);

            if (existingError) {
                console.error('[enrollments] Existing records lookup failed:', existingError.message);
                return res.status(500).json({
                    error: 'Could not load existing enrollments.'
                });
            }

            const selectedKeys = new Set(
                enrollments.map(item => `${item.course_id}:${item.semester_id}`)
            );

            if (enrollments.length) {
                // Update-or-insert by hand rather than upsert, so saving does not
                // depend on a database unique constraint existing for the pair.
                const existingByKey = new Map(
                    (existing || []).map(item => [`${item.course_id}:${item.semester_id}`, item])
                );
                const now = new Date().toISOString();

                const reenrollIds = [];
                const newRows = [];

                for (const item of enrollments) {
                    const match = existingByKey.get(`${item.course_id}:${item.semester_id}`);

                    if (!match) {
                        newRows.push({
                            student_id: studentId,
                            course_id: item.course_id,
                            semester_id: item.semester_id,
                            status: 'enrolled',
                            updated_at: now
                        });
                    } else if (match.status !== 'enrolled') {
                        reenrollIds.push(match.id);
                    }
                }

                if (reenrollIds.length) {
                    const { error } = await supabaseAdmin
                        .from('student_semester_enrollments')
                        .update({ status: 'enrolled', updated_at: now })
                        .in('id', reenrollIds);

                    if (error) {
                        console.error('[enrollments] Re-enroll failed:', error.message);
                        return res.status(500).json({
                            error: 'Could not save course enrollments.'
                        });
                    }
                }

                if (newRows.length) {
                    const { error } = await supabaseAdmin
                        .from('student_semester_enrollments')
                        .insert(newRows);

                    if (error) {
                        console.error('[enrollments] Save failed:', error.code, error.message);
                        return res.status(500).json({
                            error: 'Could not save course enrollments. Apply migration 013 in Supabase (it fixes the enrollment table constraints), then retry.'
                        });
                    }
                }
            }

            // Withdraw last, so a failed insert never leaves the student with fewer
            // enrollments than before.
            // History is preserved: removed selections are marked withdrawn.
            const toWithdraw = (existing || []).filter(
                item =>
                    item.status === 'enrolled' &&
                    !selectedKeys.has(`${item.course_id}:${item.semester_id}`)
            );

            if (toWithdraw.length) {
                const { error } = await supabaseAdmin
                    .from('student_semester_enrollments')
                    .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
                    .in('id', toWithdraw.map(item => item.id));

                if (error) {
                    console.error('[enrollments] Withdrawal failed:', error.message);
                    return res.status(500).json({
                        error: 'Could not update removed enrollments.'
                    });
                }
            }

            const { data: saved, error: savedError } = await supabaseAdmin
                .from('student_semester_enrollments')
                .select(`
          id,
          student_id,
          course_id,
          semester_id,
          status,
          course:courses(id, name, code),
          semester:semesters(
            id,
            label,
            semester_number,
            academic_year:academic_years(id, label, year_code)
          )
        `)
                .eq('student_id', studentId)
                .eq('status', 'enrolled');

            if (savedError) {
                return res.status(500).json({
                    error: 'Enrollments were saved but could not be reloaded.'
                });
            }

            return res.json({
                message: 'Student enrollments updated successfully.',
                enrollments: saved || []
            });
        } catch (error) {
            console.error('[enrollments] Unexpected save error:', error.message);
            return res.status(500).json({
                error: 'Could not save student enrollments.'
            });
        }
    });

    return router;
}
