// Adds the branch curriculum courses to the database and assigns each one to
// its semester. Safe to re-run: existing courses and assignments are left alone.
//
//   npm run seed:curriculum            writes to the database
//   npm run seed:curriculum -- --dry   only prints what would change
import 'dotenv/config';
import { supabaseAdmin } from '../src/supabase.js';
import { listCurriculumCourses } from '../src/curriculum.js';

const dryRun = process.argv.includes('--dry');

function fail(message, error) {
  console.error(`${message}${error ? `: ${error.message}` : ''}`);
  process.exit(1);
}

if (!supabaseAdmin) fail('Backend Supabase configuration is missing');

const [departments, semesters, courses, assignments] = await Promise.all([
  supabaseAdmin.from('departments').select('id, name'),
  supabaseAdmin.from('semesters').select('id, semester_number, status'),
  supabaseAdmin.from('courses').select('id, code'),
  supabaseAdmin
    .from('course_semester_assignments')
    .select('course_id, status')
    .eq('status', 'active')
]);

for (const [label, result] of Object.entries({ departments, semesters, courses, assignments })) {
  if (result.error) fail(`Could not read ${label}`, result.error);
}

const departmentByName = new Map(
  departments.data.map(item => [item.name.trim().toLowerCase(), item.id])
);
const semesterByNumber = new Map(
  semesters.data
    .filter(item => item.status === 'active')
    .map(item => [item.semester_number, item.id])
);
const courseIdByCode = new Map(courses.data.map(item => [item.code, item.id]));
const assignedCourseIds = new Set(assignments.data.map(item => item.course_id));

const wanted = listCurriculumCourses();
const missingDepartments = new Set();
const missingSemesters = new Set();
const toCreate = [];

for (const course of wanted) {
  if (courseIdByCode.has(course.code)) continue;

  const departmentId = departmentByName.get(course.department.trim().toLowerCase());

  if (!departmentId) {
    missingDepartments.add(course.department);
    continue;
  }

  if (!semesterByNumber.has(course.semester_number)) {
    missingSemesters.add(course.semester_number);
    continue;
  }

  toCreate.push({
    code: course.code,
    name: course.title,
    department_id: departmentId,
    status: 'active'
  });
}

if (missingDepartments.size) {
  console.warn(`Skipped courses for unknown departments: ${[...missingDepartments].join(', ')}`);
}
if (missingSemesters.size) {
  console.warn(`Skipped courses for missing semesters: ${[...missingSemesters].join(', ')}`);
}

console.log(`${wanted.length} curriculum courses, ${toCreate.length} new, ${wanted.length - toCreate.length} already present or skipped.`);

if (dryRun) {
  console.log('Dry run: nothing was written.');
  process.exit(0);
}

for (let i = 0; i < toCreate.length; i += 100) {
  const { data, error } = await supabaseAdmin
    .from('courses')
    .insert(toCreate.slice(i, i + 100))
    .select('id, code');

  if (error) fail('Could not create courses', error);
  for (const row of data) courseIdByCode.set(row.code, row.id);
}

const assignmentRows = [];

for (const course of wanted) {
  const courseId = courseIdByCode.get(course.code);
  const semesterId = semesterByNumber.get(course.semester_number);

  if (courseId && semesterId && !assignedCourseIds.has(courseId)) {
    assignmentRows.push({
      course_id: courseId,
      semester_id: semesterId,
      status: 'active'
    });
  }
}

for (let i = 0; i < assignmentRows.length; i += 100) {
  const { error } = await supabaseAdmin
    .from('course_semester_assignments')
    .upsert(assignmentRows.slice(i, i + 100), { onConflict: 'course_id,semester_id' });

  if (error) fail('Could not assign courses to semesters', error);
}

console.log(`Created ${toCreate.length} courses and ${assignmentRows.length} semester assignments.`);
