const STUDENT_PROFILE_SELECT = [
  'id',
  'student_code',
  'full_name',
  'email',
  'phone',
  'department_id',
  'course_id',
  'admission_year',
  'status',
  'department:departments(id, name, code)',
  'course:courses(id, name, code, subjects(id, name, code, credits, status))'
].join(', ');

function validatePhoneUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be an object.' };
  }

  if (Object.keys(body).some(key => key !== 'phone')) {
    return { error: 'Only the phone field can be updated.' };
  }

  if (typeof body.phone !== 'string') {
    return { error: 'Enter a valid phone number.' };
  }

  const phone = body.phone.trim();

  if (phone.length > 40 || /[\u0000-\u001f\u007f]/.test(phone)) {
    return {
      error: 'Phone must be 40 characters or fewer and cannot contain control characters.'
    };
  }

  return { phone: phone || null };
}

export function createStudentProfileHandlers(supabaseAdmin) {
  return {
    async get(profileId) {
      try {
        const { data: student, error: studentError } = await supabaseAdmin
          .from('students')
          .select(STUDENT_PROFILE_SELECT)
          .eq('profile_id', profileId)
          .maybeSingle();

        if (studentError) {
          console.error(
            '[profile] Could not load the linked student record:',
            studentError.message
          );

          return {
            status: 500,
            body: { error: 'Could not load student profile.' }
          };
        }

        if (!student) {
          return {
            status: 404,
            body: {
              error: 'No student record is linked to this account.'
            }
          };
        }

        const { data: pendingRequests, error: requestsError } =
          await supabaseAdmin
            .from('profile_correction_requests')
            .select('id, requested_field, status, created_at')
            .eq('student_id', student.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (requestsError) {
          console.error(
            '[profile] Could not load pending profile requests:',
            requestsError.message
          );

          return {
            status: 500,
            body: {
              error: 'Could not load student profile requests.'
            }
          };
        }

        const { data: enrollments, error: enrollmentsError } =
          await supabaseAdmin
            .from('student_semester_enrollments')
            .select('id, status, course_id, semester_id, course:courses(id, name, code, department:departments(id, name, code), subjects(id, name, code, credits, status)), semester:semesters(id, label, semester_number, academic_year:academic_years(id, label, year_code))')
            .eq('student_id', student.id)
            .eq('status', 'enrolled');

        if (enrollmentsError) {
          console.error(
            '[profile] Could not load enrollments:',
            enrollmentsError.message
          );
        }

        student.enrollments = enrollments || [];

        return {
          status: 200,
          body: {
            student: {
              ...student,
              pending_profile_requests: pendingRequests || []
            }
          }
        };
      } catch (error) {
        console.error(
          '[profile] Unexpected profile lookup failure:',
          error?.message || 'unknown error'
        );

        return {
          status: 500,
          body: { error: 'Could not load student profile.' }
        };
      }
    },

    async attendance(profileId) {
      try {
        const { data: student, error: studentError } = await supabaseAdmin
          .from('students')
          .select('id')
          .eq('profile_id', profileId)
          .maybeSingle();

        if (studentError) {
          console.error('[profile] Attendance student lookup failed:', studentError.message);
          return { status: 500, body: { error: 'Could not load attendance.' } };
        }

        if (!student) {
          return {
            status: 404,
            body: { error: 'No student record is linked to this account.' }
          };
        }

        const [recordsResult, enrollmentsResult] = await Promise.all([
          supabaseAdmin
            .from('attendance_records')
            .select(`
              attendance_status,
              remarks,
              session:attendance_sessions!inner(
                id, course_id, semester_id, session_date, topic, status,
                course:courses(id, name, code),
                semester:semesters(id, label, semester_number)
              )
            `)
            .eq('student_id', student.id),
          supabaseAdmin
            .from('student_semester_enrollments')
            .select(`
              course_id, semester_id,
              course:courses(id, name, code),
              semester:semesters(id, label, semester_number)
            `)
            .eq('student_id', student.id)
            .eq('status', 'enrolled')
        ]);

        const recordsError = recordsResult.error || enrollmentsResult.error;

        if (recordsError) {
          console.error('[profile] Attendance lookup failed:', recordsError.message);
          return {
            status: 500,
            body: { error: 'Could not load attendance. Verify that migration 011 has been applied.' }
          };
        }

        const byCourse = new Map();
        const entries = [];

        const emptySummary = (course, semester) => ({
          course,
          semester,
          total: 0,
          present: 0,
          late: 0,
          absent: 0,
          last_date: null
        });

        // Every enrolled subject is listed, even before any session is saved.
        for (const item of enrollmentsResult.data || []) {
          byCourse.set(
            `${item.course_id}:${item.semester_id}`,
            emptySummary(item.course, item.semester)
          );
        }

        for (const record of recordsResult.data || []) {
          const session = record.session;
          if (!session) continue;

          // Saved (open) sessions count too, so attendance shows up as soon
          // as the faculty member saves it; entries are flagged as not final.
          const key = `${session.course_id}:${session.semester_id}`;
          const summary =
            byCourse.get(key) || emptySummary(session.course, session.semester);

          summary.total += 1;
          if (record.attendance_status in summary) {
            summary[record.attendance_status] += 1;
          }
          if (!summary.last_date || session.session_date > summary.last_date) {
            summary.last_date = session.session_date;
          }

          byCourse.set(key, summary);

          entries.push({
            session_id: session.id,
            session_date: session.session_date,
            topic: session.topic,
            course: session.course,
            semester: session.semester,
            attendance_status: record.attendance_status,
            remarks: record.remarks,
            session_status: session.status
          });
        }

        entries.sort((a, b) => b.session_date.localeCompare(a.session_date));

        const summaries = [...byCourse.values()]
          .sort((x, y) => (x.course?.name || '').localeCompare(y.course?.name || ''))
          .map(item => ({
          ...item,
          // Late students attended the session, so they count toward attendance.
          percentage: item.total
            ? Math.round(((item.present + item.late) / item.total) * 1000) / 10
            : null
        }));

        return {
          status: 200,
          body: { summaries, records: entries.slice(0, 200) }
        };
      } catch (error) {
        console.error('[profile] Unexpected attendance failure:', error?.message || 'unknown error');
        return { status: 500, body: { error: 'Could not load attendance.' } };
      }
    },

    async updatePhone(profileId, body) {
      const validation = validatePhoneUpdate(body);

      if (validation.error) {
        return {
          status: 400,
          body: {
            error: validation.error,
            fields: { phone: validation.error }
          }
        };
      }

      try {
        const { data, error } = await supabaseAdmin
          .from('students')
          .update({
            phone: validation.phone,
            updated_at: new Date().toISOString()
          })
          .eq('profile_id', profileId)
          .select('phone')
          .maybeSingle();

        if (error) {
          console.error(
            '[profile] Could not update the student phone number:',
            error.message
          );

          return {
            status: 500,
            body: { error: 'Could not update phone number.' }
          };
        }

        if (!data) {
          return {
            status: 404,
            body: {
              error: 'No student record is linked to this account.'
            }
          };
        }

        return {
          status: 200,
          body: { phone: data.phone }
        };
      } catch (error) {
        console.error(
          '[profile] Unexpected phone update failure:',
          error?.message || 'unknown error'
        );

        return {
          status: 500,
          body: { error: 'Could not update phone number.' }
        };
      }
    }
  };
}