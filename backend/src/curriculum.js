import { readFileSync } from 'node:fs';

// Branch curriculum: which courses each program offers in each semester.
// Derived from the open data at https://github.com/aitwehrrg/Vijitedia
// (data/majors/*.ts). Placeholder slots, honors and minors are left out.
const curriculumUrl = new URL('../data/curriculum.json', import.meta.url);

let cached;

export function getCurriculum() {
  if (!cached) cached = JSON.parse(readFileSync(curriculumUrl, 'utf8'));
  return cached;
}

// Every distinct course in the curriculum with the department and semester
// number of its first appearance, used when seeding the database.
export function listCurriculumCourses(curriculum = getCurriculum()) {
  const byCode = new Map();

  for (const program of curriculum) {
    for (const semester of program.semesters) {
      for (const course of semester.courses) {
        if (!byCode.has(course.code)) {
          byCode.set(course.code, {
            ...course,
            department: program.department,
            semester_number: semester.number
          });
        }
      }
    }
  }

  return [...byCode.values()];
}

// Resolves curriculum course codes to database ids and semester rows.
export function resolveCurriculum({ curriculum = getCurriculum(), courses, semesters, departments }) {
  const courseByCode = new Map(courses.map(course => [course.code, course]));
  const semesterByNumber = new Map(
    semesters.map(semester => [semester.semester_number, semester])
  );
  const departmentByName = new Map(
    departments.map(department => [department.name.trim().toLowerCase(), department])
  );

  return curriculum.map(program => ({
    id: program.id,
    name: program.name,
    department: program.department,
    department_id:
      departmentByName.get(program.department.trim().toLowerCase())?.id || null,
    semesters: program.semesters
      .map(semester => ({
        number: semester.number,
        semester_id: semesterByNumber.get(semester.number)?.id || null,
        courses: semester.courses
          .map(item => courseByCode.get(item.code))
          .filter(Boolean)
          .map(course => ({
            id: course.id,
            code: course.code,
            name: course.name
          }))
      }))
      .filter(semester => semester.semester_id && semester.courses.length)
  }));
}
