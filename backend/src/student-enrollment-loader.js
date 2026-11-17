// Loads enrollments in a separate query instead of embedding them in the
// students query, so student lists keep working even if the database has no
// foreign key between the two tables (see migration 013).
const ENROLLMENT_SELECT =
  'id, student_id, status, course_id, semester_id, course:courses(id, name, code), semester:semesters(id, label, semester_number)';

export async function attachEnrollments(db, students) {
  const list = Array.isArray(students) ? students : [students];
  const ids = list.filter(Boolean).map(student => student.id);

  if (!ids.length) return students;

  const { data, error } = await db
    .from('student_semester_enrollments')
    .select(ENROLLMENT_SELECT)
    .in('student_id', ids);

  if (error) {
    // Enrollment details are supplementary; never fail the student list.
    console.error('[students] Could not load enrollments:', error.message);
  }

  const byStudent = new Map();

  for (const item of data || []) {
    const rows = byStudent.get(item.student_id) || [];
    rows.push(item);
    byStudent.set(item.student_id, rows);
  }

  for (const student of list) {
    if (student) student.enrollments = byStudent.get(student.id) || [];
  }

  return students;
}
