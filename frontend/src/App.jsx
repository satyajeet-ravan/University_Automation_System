import { useEffect, useRef, useState } from 'react';
import {
  BookOpen, GraduationCap, LayoutDashboard, LogOut, ShieldCheck,
  Users, UserRound, RefreshCw, CircleAlert, CheckCircle2, Clock3, Shield,
  UserPlus, X, Search, Eye, Pencil, UserRoundPlus, ChevronLeft, ChevronRight,
  CalendarDays, ClipboardCheck, Building2, Sun, Moon, Wallet
} from 'lucide-react';
import { supabase, supabaseConfigured } from './lib/supabase';
import { apiRequest } from './lib/api';
import AdminAcademicManagement from './components/AdminAcademicManagement';
import FacultyDashboard from './components/FacultyDashboard';
import FacultyManagement from './components/FacultyManagement';

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark"><GraduationCap size={23} /></div>
      <div>
        <strong>CampusFlow</strong>
        <small>University Automation System</small>
      </div>
    </div>
  );
}

function EmptyPortalPanel({
  icon: Icon,
  title,
  description,
  requirement,
  heading = 'No data available'
}) {
  return (
    <section className="panel student-module-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p className="muted">{description}</p>
        </div>
      </div>
      <div className="empty-state">
        <Icon size={26} />
        <strong>{heading}</strong>
        <span>{requirement}</span>
      </div>
    </section>
  );
}

// Crops to a centered square and shrinks the photo so uploads stay small.
function prepareProfilePhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      const size = Math.min(512, image.width, image.height);
      const side = Math.min(image.width, image.height);
      const canvas = document.createElement('canvas');

      canvas.width = size;
      canvas.height = size;

      canvas
        .getContext('2d')
        .drawImage(
          image,
          (image.width - side) / 2,
          (image.height - side) / 2,
          side,
          side,
          0,
          0,
          size,
          size
        );

      URL.revokeObjectURL(url);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };

    image.src = url;
  });
}

function semesterName(semester) {
  if (!semester) return 'Semester';

  const year =
    semester.academic_year?.label || semester.academic_year?.year_code;
  const label =
    semester.label || `Semester ${semester.semester_number || ''}`.trim();

  return year ? `${year} - ${label}` : label;
}

function EnrollmentTable({ enrollments, fallback }) {
  const rows = (enrollments || []).filter(
    item => item.status === 'enrolled' && item.course
  );

  return (
    <div className="enrollment-table-block">
      <h3>Course Enrollments</h3>

      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Course</th>
                <th>Code</th>
                <th>Semester</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item, index) => (
                <tr key={item.id}>
                  <td>{index + 1}</td>
                  <td>{item.course.name}</td>
                  <td>{item.course.code || '-'}</td>
                  <td>{semesterName(item.semester)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">{fallback || 'No course enrollments.'}</p>
      )}
    </div>
  );
}

function StudentCoursesPanel({ record, loading, error }) {
  const enrollments = (record?.enrollments || []).filter(
    item => item.status === 'enrolled' && item.course
  );

  return (
    <section className="panel student-module-panel">
      <div className="panel-heading">
        <div>
          <h2>Courses &amp; Subjects</h2>
          <p className="muted">
            Courses you are enrolled in and their subjects.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <RefreshCw size={24} />
          <span>Loading your courses...</span>
        </div>
      ) : error ? (
        <div className="alert error">{error}</div>
      ) : enrollments.length ? (
        <div className="student-course-grid">
          {enrollments.map(item => {
            const subjects = (item.course.subjects || []).filter(
              subject => subject.status === 'active'
            );

            return (
              <article className="panel" key={item.id}>
                <span className="eyebrow">{item.course.code}</span>
                <h3>{item.course.name}</h3>
                <p className="muted">
                  {item.course.department?.name
                    ? `${item.course.department.name} · `
                    : ''}
                  {semesterName(item.semester)}
                </p>

                {subjects.length ? (
                  <ul>
                    {subjects.map(subject => (
                      <li key={subject.id}>
                        <strong>{subject.code}</strong> - {subject.name}
                        {subject.credits != null
                          ? ` (${subject.credits} credits)`
                          : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No subjects have been added yet.</p>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <BookOpen size={26} />
          <strong>No course enrollments</strong>
          <span>
            An administrator has not enrolled you in a course yet.
          </span>
        </div>
      )}
    </section>
  );
}

function StudentAttendancePanel({ state }) {
  const { loading, error, summaries, records } = state;

  return (
    <section className="panel student-module-panel">
      <div className="panel-heading">
        <div>
          <h2>Attendance</h2>
          <p className="muted">
            Attendance per subject, as recorded by your faculty.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <RefreshCw size={24} />
          <span>Loading attendance...</span>
        </div>
      ) : error ? (
        <div className="alert error">{error}</div>
      ) : summaries.length ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Semester</th>
                  <th>Sessions</th>
                  <th>Present</th>
                  <th>Late</th>
                  <th>Absent</th>
                  <th>Last session</th>
                  <th>Attendance</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map(item => (
                  <tr key={`${item.course?.id}:${item.semester?.id}`}>
                    <td>
                      <strong>{item.course?.name || 'Course'}</strong>
                      <small className="academic-secondary">
                        {item.course?.code}
                      </small>
                    </td>
                    <td>{semesterName(item.semester)}</td>
                    <td>{item.total}</td>
                    <td>{item.present}</td>
                    <td>{item.late}</td>
                    <td>{item.absent}</td>
                    <td>{item.last_date || '-'}</td>
                    <td>
                      <strong>
                        {item.percentage == null ? '-' : `${item.percentage}%`}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Recent sessions</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Subject</th>
                  <th>Topic</th>
                  <th>Attendance</th>
                  <th>Session</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {records.map(item => (
                  <tr key={item.session_id}>
                    <td>{item.session_date}</td>
                    <td>{item.course?.name || item.course?.code || '-'}</td>
                    <td>{item.topic || '-'}</td>
                    <td>
                      <span
                        className={`status-pill ${item.attendance_status === 'absent' ? 'pending' : 'active-status'}`}
                      >
                        {item.attendance_status}
                      </span>
                    </td>
                    <td>
                      {item.session_status === 'submitted' ? 'Submitted' : 'Saved'}
                    </td>
                    <td>{item.remarks || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <ClipboardCheck size={26} />
          <strong>No subjects yet</strong>
          <span>
            Subjects appear here once you are enrolled in a course.
          </span>
        </div>
      )}
    </section>
  );
}

function emptyStudentForm() {
  return {
    full_name: '',
    email: '',
    password: '',
    confirm_password: '',
    phone: '',
    department_id: '',
    course_id: '',
    admission_year: '',
    enrollments: [],
    // Enrollments are only replaced on save once they have loaded successfully.
    enrollmentsLoaded: true
  };
}

export default function App() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('campusflow-theme') === 'dark'
        ? 'dark'
        : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('campusflow-theme', theme);
    } catch {
      // Storage may be unavailable.
    }

    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  function toggleTheme() {
    setTheme(current => current === 'light' ? 'dark' : 'light');
  }

  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState('dashboard');
  const [studentRecord, setStudentRecord] = useState(null);
  const [studentRecordLoading, setStudentRecordLoading] = useState(false);
  const [studentRefresh, setStudentRefresh] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [studentRecordError, setStudentRecordError] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [phoneMessage, setPhoneMessage] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [studentAttendance, setStudentAttendance] = useState({
    loading: false,
    error: '',
    summaries: [],
    records: []
  });
  const [mode, setMode] = useState('login');
  const [authRole, setAuthRole] = useState('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [signupFieldErrors, setSignupFieldErrors] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [admins, setAdmins] = useState(null);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminForm, setAdminForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [adminFieldErrors, setAdminFieldErrors] = useState({});
  const [students, setStudents] = useState([]);
  const [studentTotal, setStudentTotal] = useState(0);
  const [studentFilteredTotal, setStudentFilteredTotal] = useState(0);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentOffset, setStudentOffset] = useState(0);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentFilters, setStudentFilters] = useState({
    department_id: '',
    course_id: '',
    status: ''
  });
  const [studentOptions, setStudentOptions] = useState({
    departments: [],
    courses: [],
    semesters: []
  });
  const [curriculum, setCurriculum] = useState([]);
  const [enrollBranch, setEnrollBranch] = useState('');
  const [enrollSemesterId, setEnrollSemesterId] = useState('');
  const [studentOptionsLoading, setStudentOptionsLoading] = useState(false);
  const [studentOptionsError, setStudentOptionsError] = useState('');
  const [studentsError, setStudentsError] = useState('');
  const studentRequestId = useRef(0);
  const [studentModal, setStudentModal] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentForm, setStudentForm] = useState(emptyStudentForm());
  const [studentFieldErrors, setStudentFieldErrors] = useState({});

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Token refreshes also fire this listener; keep the loaded profile and the
    // current page so the user is not bounced back to a loading screen.
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id || null;

  useEffect(() => {
    if (userId) {
      loadProfile(session.access_token);
    } else {
      setProfile(null);
      setData(null);
      setStudentRecord(null);
      setStudentRecordError('');
    }
    // Reload only when a different user signs in, not on token refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (
      profile?.role !== 'student' ||
      profile.account_status !== 'active' ||
      !session?.access_token
    ) {
      setStudentRecord(null);
      setStudentRecordError('');
      setStudentRecordLoading(false);
      return;
    }

    let cancelled = false;

    setStudentRecordLoading(true);
    setStudentRecordError('');

    apiRequest('/profile/me', { token: session.access_token })
      .then(result => {
        if (!cancelled) {
          setStudentRecord(result.student);
          setPhoneDraft(result.student.phone || '');
        }
      })
      .catch(e => {
        if (!cancelled) {
          setStudentRecordError(e.message);
          setStudentRecord(null);
        }
      })
      .finally(() => {
        if (!cancelled) setStudentRecordLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.role, profile?.account_status, studentRefresh]);

  useEffect(() => {
    if (
      view !== 'attendance' ||
      profile?.role !== 'student' ||
      profile.account_status !== 'active' ||
      !session?.access_token
    ) {
      return undefined;
    }

    let cancelled = false;

    setStudentAttendance(current => ({ ...current, loading: true, error: '' }));

    apiRequest('/profile/me/attendance', { token: session.access_token })
      .then(result => {
        if (!cancelled) {
          setStudentAttendance({
            loading: false,
            error: '',
            summaries: result.summaries || [],
            records: result.records || []
          });
        }
      })
      .catch(e => {
        if (!cancelled) {
          setStudentAttendance({
            loading: false,
            error: e.message,
            summaries: [],
            records: []
          });
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, profile?.id, profile?.role, profile?.account_status, studentRefresh]);

  async function loadProfile(token) {
    setProfileLoading(true);
    setError('');

    try {
      const result = await apiRequest('/auth/me', { token });
      setProfile(result.profile);
    } catch (e) {
      setError(e.message);
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }

  async function handleAuth(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    setSignupFieldErrors({});

    try {
      if (mode === 'signup') {
        if (authRole !== 'student') {
          throw new Error(
            `${authRole === 'admin' ? 'Admin' : 'Faculty'} accounts must be provisioned by an active Admin. Use the sign-in option after receiving your account details.`
          );
        }

        const validation = await apiRequest('/registrations/validate', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim(), full_name: fullName })
        });

        if (!validation.valid) {
          throw new Error('Could not validate the registration details.');
        }

        const { data: signupData, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() }
          }
        });

        if (error) throw error;

        if (!signupData?.user) {
          throw new Error(
            'Could not confirm signup. Try again or contact support.'
          );
        }

        if (
          Array.isArray(signupData.user.identities) &&
          signupData.user.identities.length === 0
        ) {
          throw new Error(
            'An account with this email may already exist. Sign in or contact an administrator.'
          );
        }

        setMessage(
          'Signup submitted. Check your email if confirmation is enabled. Student access remains pending until Admin verification.'
        );
        setMode('login');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (error) throw error;
      }
    } catch (e) {
      setError(e.message || 'Authentication failed.');
      setSignupFieldErrors(e.fields || {});
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();

    setSession(null);
    setProfile(null);
    setStudentRecord(null);
    setView('dashboard');
  }

  async function loadAdminRegistrations({ clearFeedback = true } = {}) {
    setBusy(true);

    if (clearFeedback) {
      setError('');
      setMessage('');
    }

    try {
      const result = await apiRequest('/registrations/pending', {
        token: session.access_token
      });

      setData(result.registrations || []);
      setView('registrations');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function reviewRegistration(id, decision) {
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const result = await apiRequest(`/registrations/${id}/review`, {
        token: session.access_token,
        method: 'POST',
        body: JSON.stringify({ decision })
      });

      setMessage(
        decision === 'approve'
          ? `Registration approved. Generated Student ID: ${result.student_code}.`
          : 'Registration rejected.'
      );

      await loadAdminRegistrations({ clearFeedback: false });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadStudentProfile() {
    setPhoneError('');
    setPhoneMessage('');
    setView('profile');
  }

  async function saveStudentPhone(event) {
    event.preventDefault();
    setPhoneError('');
    setPhoneMessage('');

    const phone = phoneDraft.trim();

    if (phone.length > 40 || /[\u0000-\u001f\u007f]/.test(phone)) {
      setPhoneError(
        'Phone must be 40 characters or fewer and cannot contain control characters.'
      );
      return;
    }

    setPhoneSaving(true);

    try {
      const result = await apiRequest('/profile/me', {
        token: session.access_token,
        method: 'PATCH',
        body: JSON.stringify({ phone })
      });

      setStudentRecord(current =>
        current ? { ...current, phone: result.phone } : current
      );

      setPhoneDraft(result.phone || '');
      setPhoneMessage('Phone number updated.');
    } catch (e) {
      setPhoneError(e.message);
    } finally {
      setPhoneSaving(false);
    }
  }

  async function changeStudentPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    setPhotoError('');

    if (!file.type.startsWith('image/')) {
      setPhotoError('Choose an image file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setPhotoError('Choose an image smaller than 10 MB.');
      return;
    }

    setPhotoBusy(true);

    try {
      const data = await prepareProfilePhoto(file);
      const result = await apiRequest('/profile/me/photo', {
        token: session.access_token,
        method: 'PUT',
        body: JSON.stringify({ data })
      });

      setStudentRecord(current =>
        current ? { ...current, photo_url: result.photo_url } : current
      );
    } catch (e) {
      setPhotoError(e.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removeStudentPhoto() {
    if (!window.confirm('Remove your profile photo?')) return;

    setPhotoError('');
    setPhotoBusy(true);

    try {
      await apiRequest('/profile/me/photo', {
        token: session.access_token,
        method: 'DELETE'
      });

      setStudentRecord(current =>
        current ? { ...current, photo_url: null } : current
      );
    } catch (e) {
      setPhotoError(e.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function loadAdmins({ clearFeedback = true } = {}) {
    setView('admins');
    setAdminsLoading(true);

    if (clearFeedback) {
      setError('');
      setMessage('');
    }

    try {
      const result = await apiRequest('/admins', {
        token: session.access_token
      });

      setAdmins(result.admins || []);
      setView('admins');
    } catch (e) {
      setError(e.message);
    } finally {
      setAdminsLoading(false);
    }
  }

  async function loadStudentOptions() {
    setStudentOptionsLoading(true);
    setStudentOptionsError('');

    try {
      const result = await apiRequest('/students/options', {
        token: session.access_token
      });

      setStudentOptions({
        departments: result.departments || [],
        courses: result.courses || [],
        semesters: result.semesters || []
      });

      // The branch curriculum is optional: without it the enrollment form
      // falls back to the courses assigned to the chosen semester.
      apiRequest('/students/curriculum', { token: session.access_token })
        .then(curriculumResult => setCurriculum(curriculumResult.programs || []))
        .catch(() => setCurriculum([]));
    } catch (e) {
      setStudentOptionsError(e.message);
      setStudentOptions({
        departments: [],
        courses: [],
        semesters: []
      });
    } finally {
      setStudentOptionsLoading(false);
    }
  }

  async function loadStudents({
    offset = studentOffset,
    search = studentSearch,
    filters = studentFilters,
    clearFeedback = true
  } = {}) {
    const requestId = ++studentRequestId.current;

    setView('students');
    setStudentsLoading(true);

    if (clearFeedback) {
      setError('');
      setMessage('');
    }

    setStudentsError('');

    const params = new URLSearchParams({
      limit: '25',
      offset: String(offset)
    });

    if (search.trim()) params.set('q', search.trim());

    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }

    try {
      const result = await apiRequest(
        `/students?${params.toString()}`,
        { token: session.access_token }
      );

      if (requestId !== studentRequestId.current) return;

      setStudents(result.students || []);
      setStudentTotal(result.totalCount || 0);
      setStudentFilteredTotal(result.filteredCount || 0);
      setStudentOffset(result.offset || 0);
    } catch (e) {
      if (requestId !== studentRequestId.current) return;

      setError(e.message);
      setStudentsError(e.message);
      setStudents([]);
      setStudentFilteredTotal(0);
    } finally {
      if (requestId === studentRequestId.current) {
        setStudentsLoading(false);
      }
    }
  }

  function openStudentManagement() {
    setView('students');
    setStudentOffset(0);
    loadStudentOptions();
    loadStudents({ offset: 0 });
  }

  function openStudentCreate() {
    setStudentForm(emptyStudentForm());
    setStudentFieldErrors({});
    setSelectedStudent(null);
    setError('');
    setMessage('');
    openEnrollmentForm();
    setStudentModal('add');
  }

  function openEnrollmentForm() {
    setEnrollBranch('');
    setEnrollSemesterId('');
  }

  // Branches offered by the selected department (all branches if none is chosen).
  function enrollmentPrograms() {
    return curriculum.filter(
      program =>
        !studentForm.department_id ||
        program.department_id === studentForm.department_id
    );
  }

  function selectedSemesterNumber() {
    return studentOptions.semesters.find(
      semester => semester.id === enrollSemesterId
    )?.semester_number;
  }

  // Courses that can be picked for the chosen branch and semester.
  function enrollmentCourses() {
    if (!enrollSemesterId) return [];

    if (enrollBranch) {
      const program = curriculum.find(item => item.id === enrollBranch);
      const number = selectedSemesterNumber();

      return (
        program?.semesters.find(item => item.number === number)?.courses || []
      );
    }

    return studentOptions.courses.filter(
      course => course.semester_id === enrollSemesterId
    );
  }

  // Courses of the chosen semester that are not selected yet.
  function remainingEnrollmentCourses() {
    return enrollmentCourses().filter(
      course =>
        !studentForm.enrollments.some(
          item =>
            item.course_id === course.id &&
            item.semester_id === enrollSemesterId
        )
    );
  }

  function chooseEnrollmentBranch(value) {
    setEnrollBranch(value);

    const program = curriculum.find(item => item.id === value);

    if (program?.department_id && !studentForm.department_id) {
      setStudentForm(current => ({
        ...current,
        department_id: program.department_id
      }));
    }
  }

  function toggleStudentEnrollment(courseId, checked) {
    if (!enrollSemesterId) return;

    setStudentForm(current => {
      const others = current.enrollments.filter(
        item =>
          !(item.course_id === courseId && item.semester_id === enrollSemesterId)
      );

      return {
        ...current,
        enrollments: checked
          ? [...others, { course_id: courseId, semester_id: enrollSemesterId }]
          : others
      };
    });
  }

  function setAllStudentEnrollments(checked) {
    if (!enrollSemesterId) return;

    const courseIds = enrollmentCourses().map(course => course.id);

    setStudentForm(current => {
      const others = current.enrollments.filter(
        item =>
          item.semester_id !== enrollSemesterId ||
          !courseIds.includes(item.course_id)
      );

      return {
        ...current,
        enrollments: checked
          ? [
            ...others,
            ...courseIds.map(courseId => ({
              course_id: courseId,
              semester_id: enrollSemesterId
            }))
          ]
          : others
      };
    });
  }

  function removeStudentEnrollment(courseId, semesterId) {
    setStudentForm(current => ({
      ...current,
      enrollments: current.enrollments.filter(
        item =>
          !(item.course_id === courseId && item.semester_id === semesterId)
      )
    }));
  }

  async function openStudentDetails(student, modalMode) {
    openEnrollmentForm();
    setSelectedStudent(student);
    setStudentFieldErrors({});
    setError('');
    setStudentModal(modalMode);

    if (modalMode === 'edit') {
      setStudentForm({
        full_name: student.full_name || '',
        email: student.email || '',
        password: '',
        confirm_password: '',
        phone: student.phone || '',
        department_id: student.department_id || '',
        course_id: student.course_id || '',
        admission_year: student.admission_year ?? '',
        enrollments: [],
        enrollmentsLoaded: false
      });

      try {
        const result = await apiRequest(`/students/${student.id}/enrollments`, {
          token: session.access_token
        });

        setStudentForm(current => ({
          ...current,
          enrollmentsLoaded: true,
          enrollments: (result.enrollments || [])
            .filter(item => item.status === 'enrolled')
            .map(item => ({
              course_id: item.course_id,
              semester_id: item.semester_id
            }))
        }));
      } catch (e) {
        setError(
          `${e.message || 'Could not load student enrollments.'} Existing enrollments will not be changed if you save.`
        );
      }
    }

    if (modalMode === 'view') {
      try {
        const result = await apiRequest(`/students/${student.id}`, {
          token: session.access_token
        });
        setSelectedStudent(result.student);
      } catch (e) {
        setError(e.message);
        setStudentModal(null);
      }
    }
  }

  function validateStudentForm() {
    const errors = {};
    const name = studentForm.full_name.trim();
    const emailValue = studentForm.email.trim();

    if (!name) {
      errors.full_name = 'Full name is required.';
    } else if (name.length > 120) {
      errors.full_name = 'Full name must be 120 characters or fewer.';
    }

    if (!emailValue) {
      errors.email = 'Email is required for the student login.';
    } else if (
      emailValue.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)
    ) {
      errors.email = 'Enter a valid email address.';
    }

    if (studentModal === 'add' || studentForm.password) {
      if (
        studentForm.password.length < 8 ||
        studentForm.password.length > 128
      ) {
        errors.password = 'Password must be between 8 and 128 characters.';
      }

      if (studentForm.confirm_password !== studentForm.password) {
        errors.confirm_password = 'Passwords do not match.';
      }
    } else if (studentForm.confirm_password) {
      errors.confirm_password =
        'Enter a new password before confirming it.';
    }

    if (studentForm.phone.trim().length > 40) {
      errors.phone = 'Phone must be 40 characters or fewer.';
    }

    if (
      studentForm.admission_year !== '' &&
      (
        !/^\d{4}$/.test(String(studentForm.admission_year)) ||
        Number(studentForm.admission_year) < 1900 ||
        Number(studentForm.admission_year) > 2200
      )
    ) {
      errors.admission_year =
        'Enter a valid admission year between 1900 and 2200.';
    }

    if (studentForm.course_id && !studentForm.department_id) {
      errors.course_id = 'Select a department first.';
    }

    setStudentFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function saveStudent(event) {
    event.preventDefault();

    if (!validateStudentForm()) return;

    setBusy(true);
    setError('');
    setMessage('');

    const payload = {
      full_name: studentForm.full_name.trim(),
      email: studentForm.email.trim().toLowerCase(),
      phone: studentForm.phone.trim(),
      admission_year:
        studentForm.admission_year === ''
          ? null
          : Number(studentForm.admission_year),
      department_id: studentForm.department_id || null,
      course_id: studentForm.course_id || null
    };

    if (studentModal === 'add') {
      payload.password = studentForm.password;
      payload.confirm_password = studentForm.confirm_password;
    } else if (studentForm.password) {
      payload.password = studentForm.password;
      payload.confirm_password = studentForm.confirm_password;
    }

    try {
      const savedResult = await apiRequest(
        studentModal === 'edit'
          ? `/students/${selectedStudent.id}`
          : '/students',
        {
          token: session.access_token,
          method: studentModal === 'edit' ? 'PATCH' : 'POST',
          body: JSON.stringify(payload)
        }
      );

      const studentId = savedResult.student?.id || selectedStudent?.id;

      if (!studentId) {
        throw new Error(
          'Student was saved, but the server did not return the student ID.'
        );
      }

      let enrollmentWarning = '';

      if (studentForm.enrollmentsLoaded) {
        try {
          await apiRequest(`/students/${studentId}/enrollments`, {
            token: session.access_token,
            method: 'PUT',
            body: JSON.stringify({ enrollments: studentForm.enrollments })
          });
        } catch (enrollmentError) {
          // The student already exists; do not leave the form open, or a retry
          // would try to create a duplicate account.
          enrollmentWarning =
            ` However, course enrollments were not saved: ${enrollmentError.message} Edit the student to retry.`;
        }
      }

      const nextOffset = studentModal === 'add' ? 0 : studentOffset;

      setStudentOffset(nextOffset);
      setStudentModal(null);
      setStudentForm(emptyStudentForm());

      const successText =
        studentModal === 'edit'
          ? 'Student record and login credentials updated successfully.'
          : 'Student record and login account created. The student can sign in with the supplied email and password.';

      if (enrollmentWarning) {
        setError(successText + enrollmentWarning);
      } else {
        setMessage(successText);
      }

      await loadStudents({
        offset: nextOffset,
        clearFeedback: false
      });
    } catch (e) {
      setError(e.message);
      setStudentFieldErrors(e.fields || {});
    } finally {
      setBusy(false);
    }
  }

  async function changeStudentStatus(student) {
    const nextStatus =
      student.status === 'active' ? 'inactive' : 'active';

    const action =
      nextStatus === 'inactive' ? 'deactivate' : 'reactivate';

    if (
      !window.confirm(
        `Are you sure you want to ${action} ${student.full_name} (${student.student_code})?`
      )
    ) {
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');

    try {
      await apiRequest(`/students/${student.id}/status`, {
        token: session.access_token,
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus })
      });

      setMessage(
        `Student ${nextStatus === 'active' ? 'reactivated' : 'deactivated'}.`
      );

      await loadStudents({ clearFeedback: false });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function validateAdminForm() {
    const errors = {};
    const cleanName = adminForm.fullName.trim();
    const cleanEmail = adminForm.email.trim();

    if (!cleanName) {
      errors.fullName = 'Enter the admin\'s full name.';
    } else if (cleanName.length > 120) {
      errors.fullName = 'Name must be 120 characters or fewer.';
    }

    if (!cleanEmail) {
      errors.email = 'Enter an email address.';
    } else if (
      cleanEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
    ) {
      errors.email = 'Enter a valid email address.';
    }

    if (
      adminForm.password.length < 8 ||
      adminForm.password.length > 128
    ) {
      errors.password = 'Use a password between 8 and 128 characters.';
    }

    if (adminForm.confirmPassword !== adminForm.password) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    setAdminFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function createAdmin(event) {
    event.preventDefault();

    if (!validateAdminForm()) return;

    setAdminBusy(true);
    setError('');
    setMessage('');

    try {
      await apiRequest('/admins', {
        token: session.access_token,
        method: 'POST',
        body: JSON.stringify({
          fullName: adminForm.fullName.trim(),
          email: adminForm.email.trim(),
          password: adminForm.password,
          confirmPassword: adminForm.confirmPassword
        })
      });

      setAdminDialogOpen(false);

      setAdminForm({
        fullName: '',
        email: '',
        password: '',
        confirmPassword: ''
      });

      setAdminFieldErrors({});
      setMessage('Admin account created successfully.');

      await loadAdmins({ clearFeedback: false });
    } catch (e) {
      setError(e.message);

      setAdminFieldErrors({
        ...(e.fields || {}),
        ...(e.status === 409 ? { email: e.message } : {})
      });
    } finally {
      setAdminBusy(false);
    }
  }

  function openAdminDialog() {
    setAdminForm({
      fullName: '',
      email: '',
      password: '',
      confirmPassword: ''
    });

    setAdminFieldErrors({});
    setError('');
    setMessage('');
    setAdminDialogOpen(true);
  }

  if (!supabaseConfigured) {
    return (
      <main className="setup-page" data-theme={theme}>
        <div className="setup-card">
          <Brand />

          <div className="setup-icon">
            <CircleAlert size={28} />
          </div>

          <h1>Configuration required</h1>

          <p>
            Before signing in, add your Supabase project details to{' '}
            <code>frontend/.env</code>.
          </p>

          <ol>
            <li>
              Copy <code>frontend/.env.example</code> to{' '}
              <code>frontend/.env</code>.
            </li>
            <li>Set <code>VITE_SUPABASE_URL</code>.</li>
            <li>
              Set <code>VITE_SUPABASE_ANON_KEY</code> to the
              publishable/anon key.
            </li>
            <li>Restart the frontend development server.</li>
          </ol>

          <p className="warning">
            Never put the service-role key in the frontend.
          </p>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="auth-page" data-theme={theme}>
        <section className="auth-intro">
          <Brand />

          <div className="intro-copy">
            <span className="eyebrow">ONE CAMPUS. ONE SYSTEM.</span>

            <h1>University operations, made simpler.</h1>

            <p>
              A central place for student records, academic information,
              and university administration.
            </p>

            <div className="intro-points">
              <span>
                <ShieldCheck size={18} /> Secure role-based access
              </span>
              <span>
                <Users size={18} /> Centralized records
              </span>
              <span>
                <BookOpen size={18} /> Academic information
              </span>
            </div>
          </div>

          <small className="copyright">
            University Automation System
          </small>
        </section>

        <section className="auth-form-wrap">
          <form className="auth-card" onSubmit={handleAuth}>
            <span className="eyebrow">
              {mode === 'login'
                ? 'WELCOME BACK'
                : `${authRole.toUpperCase()} REGISTRATION`}
            </span>

           <h2>
  {mode === 'login'
    ? 'Sign in'
    : authRole === 'student'
      ? 'Create a student account'
      : `Create a ${authRole} account`}
</h2>

           {mode === 'signup' && (
  <div
    className="auth-role-selector"
    role="group"
    aria-label="Account type"
  >
    {['student', 'admin', 'faculty'].map(role => (
      <button
        key={role}
        type="button"
        className={authRole === role ? 'active' : ''}
        onClick={() => {
          setAuthRole(role);
          setError('');
          setMessage('');
          setSignupFieldErrors({});
        }}
      >
        {role}
      </button>
    ))}
  </div>
)}

            <p className="muted">
             {mode === 'login'
  ? 'Enter your email and password to continue.'
                : authRole === 'student'
                  ? 'Registration remains pending until an Admin reviews and approves it. Your Student ID is created on approval.'
                  : `${authRole === 'admin' ? 'Admin' : 'Faculty'} accounts are created by an active Admin to protect university access.`}
            </p>

            {mode === 'signup' && authRole === 'student' && (
              <>
                <label>Full name</label>
                <input
                  value={fullName}
                  onChange={e => {
                    setFullName(e.target.value);
                    setSignupFieldErrors({
                      ...signupFieldErrors,
                      full_name: ''
                    });
                  }}
                  required
                  maxLength={120}
                  aria-invalid={Boolean(signupFieldErrors.full_name)}
                  placeholder="Enter full name"
                />

                {signupFieldErrors.full_name && (
                  <small className="field-error">
                    {signupFieldErrors.full_name}
                  </small>
                )}
              </>
            )}

            {(mode === 'login' || authRole === 'student') && (
              <>
                <label>Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value);
                    setSignupFieldErrors({
                      ...signupFieldErrors,
                      email: ''
                    });
                  }}
                  required
                  aria-invalid={Boolean(signupFieldErrors.email)}
                  placeholder="name@example.com"
                />

                {signupFieldErrors.email && (
                  <small className="field-error">
                    {signupFieldErrors.email}
                  </small>
                )}

                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </>
            )}

            {error && <div className="alert error">{error}</div>}
            {message && <div className="alert success">{message}</div>}

            {mode === 'signup' && authRole !== 'student' ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => setMode('login')}
              >
                Return to {authRole} sign in
              </button>
            ) : (
              <button className="primary-button" disabled={busy}>
                {busy
  ? 'Please wait...'
  : mode === 'login'
    ? 'Sign in'
    : 'Create student account'}
              </button>
            )}

            <button
              type="button"
              className="text-button"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError('');
                setMessage('');
                setSignupFieldErrors({});
              }}
            >
              {mode === 'login'
                ? `Need a ${authRole} account? ${authRole === 'student' ? 'Sign up' : 'Learn how to get access'}`
                : 'Already registered? Sign in'}
            </button>

            <p className="footnote">
              Student registration is public. Admin and Faculty accounts are
              provisioned by an active Admin.
            </p>
          </form>
        </section>
      </main>
    );
  }

  const isAdmin =
    profile?.role === 'admin' &&
    profile?.account_status === 'active';

  const isFaculty =
    profile?.role === 'faculty' &&
    profile?.account_status === 'active';

  const isActiveStudent =
    profile?.role === 'student' &&
    profile?.account_status === 'active';

  const isPending =
    profile?.account_status === 'pending_verification';

  const pageTitles = {
    dashboard: 'Dashboard',
    profile: 'My Profile',
    courses: 'Courses & Subjects',
    timetable: 'Timetable',
    attendance: 'Attendance',
    calendar: 'Academic Calendar',
    fees: 'Fees',
    registrations: 'Student verification',
    students: 'Student Management',
    facultyManagement: 'Faculty Management',
    admins: 'Admin Management',
    academic: 'Academic Management',
    faculty: 'Faculty Workspace'
  };

  return (
    <div className="app-shell" data-theme={theme}>
      <aside className="sidebar">
        <Brand />

        <div className="nav-label">WORKSPACE</div>

        {isActiveStudent ? (
          <nav className="student-nav" aria-label="Student portal">
            <button
              className={`nav-item ${view === 'dashboard' ? 'active' : ''}`}
              aria-current={view === 'dashboard' ? 'page' : undefined}
              onClick={() => setView('dashboard')}
            >
              <LayoutDashboard size={18} /> Dashboard
            </button>

            <button
              className={`nav-item ${view === 'profile' ? 'active' : ''}`}
              aria-current={view === 'profile' ? 'page' : undefined}
              onClick={loadStudentProfile}
            >
              <UserRound size={18} /> My Profile
            </button>

            <button
              className={`nav-item ${view === 'courses' ? 'active' : ''}`}
              aria-current={view === 'courses' ? 'page' : undefined}
              onClick={() => setView('courses')}
            >
              <BookOpen size={18} /> Courses &amp; Subjects
            </button>

            <button
              className={`nav-item ${view === 'timetable' ? 'active' : ''}`}
              aria-current={view === 'timetable' ? 'page' : undefined}
              onClick={() => setView('timetable')}
            >
              <Clock3 size={18} /> Timetable
            </button>

            <button
              className={`nav-item ${view === 'attendance' ? 'active' : ''}`}
              aria-current={view === 'attendance' ? 'page' : undefined}
              onClick={() => setView('attendance')}
            >
              <ClipboardCheck size={18} /> Attendance
            </button>

            <button
              className={`nav-item ${view === 'calendar' ? 'active' : ''}`}
              aria-current={view === 'calendar' ? 'page' : undefined}
              onClick={() => setView('calendar')}
            >
              <CalendarDays size={18} /> Academic Calendar
            </button>

            <button
              className={`nav-item ${view === 'fees' ? 'active' : ''}`}
              aria-current={view === 'fees' ? 'page' : undefined}
              onClick={() => setView('fees')}
            >
              <Wallet size={18} /> Fees
            </button>
          </nav>
        ) : isFaculty ? (
          <nav className="student-nav" aria-label="Faculty portal">
            <button
              className={`nav-item ${view === 'faculty' || view === 'dashboard' ? 'active' : ''}`}
              aria-current={
                view === 'faculty' || view === 'dashboard'
                  ? 'page'
                  : undefined
              }
              onClick={() => setView('faculty')}
            >
              <LayoutDashboard size={18} /> Faculty Dashboard
            </button>
          </nav>
        ) : (
          <>
            <button
              className={`nav-item ${view === 'dashboard' ? 'active' : ''}`}
              aria-current={view === 'dashboard' ? 'page' : undefined}
              onClick={() => {
                setView('dashboard');
                setData(null);
              }}
            >
              <LayoutDashboard size={18} /> Dashboard
            </button>

            {isAdmin && (
              <button
                className={`nav-item ${view === 'registrations' ? 'active' : ''}`}
                onClick={loadAdminRegistrations}
              >
                <Users size={18} /> Student verification
              </button>
            )}

            {isAdmin && (
              <button
                className={`nav-item ${view === 'students' ? 'active' : ''}`}
                onClick={openStudentManagement}
              >
                <UserRoundPlus size={18} /> Students
              </button>
            )}

            {isAdmin && (
              <button
                className={`nav-item ${view === 'facultyManagement' ? 'active' : ''}`}
                aria-current={view === 'facultyManagement' ? 'page' : undefined}
                onClick={() => {
                  setView('facultyManagement');
                  setError('');
                  setMessage('');
                }}
              >
                <Users size={18} /> Faculty Management
              </button>
            )}

            {isAdmin && (
              <button
                className={`nav-item ${view === 'academic' ? 'active' : ''}`}
                aria-current={view === 'academic' ? 'page' : undefined}
                onClick={() => {
                  setView('academic');
                  setError('');
                  setMessage('');
                }}
              >
                <Building2 size={18} /> Academic Management
              </button>
            )}

            {isAdmin && (
              <button
                className={`nav-item ${view === 'admins' ? 'active' : ''}`}
                onClick={loadAdmins}
              >
                <Shield size={18} /> Admin Management
              </button>
            )}

            {!isAdmin && !isPending && (
              <button
                className={`nav-item ${view === 'profile' ? 'active' : ''}`}
                onClick={loadStudentProfile}
              >
                <UserRound size={18} /> My profile
              </button>
            )}
          </>
        )}

        <div className="sidebar-bottom">
          <div className="user-chip">
            <div className="avatar">
              {isActiveStudent && studentRecord?.photo_url ? (
                <img src={studentRecord.photo_url} alt="" />
              ) : (
                (profile?.full_name || session.user.email || 'U')
                  .slice(0, 1)
                  .toUpperCase()
              )}
            </div>

            <div className="user-meta">
              <strong>{profile?.full_name || session.user.email}</strong>
              <small>{profile?.role || 'Account pending'}</small>
            </div>
          </div>

          <button className="nav-item" onClick={signOut}>
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="muted">University Automation System</span>
            <h1>{pageTitles[view] || 'Dashboard'}</h1>
          </div>

          <div className="top-actions">
            <span
              className={`status-pill ${isPending ? 'pending' : 'active-status'}`}
            >
              {isPending
                ? 'Pending verification'
                : profile?.account_status || 'Loading'}
            </span>

            <button
              className="icon-button theme-toggle"
              type="button"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              aria-pressed={theme === 'dark'}
              onClick={toggleTheme}
            >
              {theme === 'light'
                ? <Moon size={17} />
                : <Sun size={17} />}
              <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
            </button>

            <button
              className="icon-button"
              title="Refresh profile"
              aria-label="Refresh profile"
              onClick={() => {
                loadProfile(session.access_token);
                setStudentRefresh(value => value + 1);
              }}
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </header>

        {error && <div className="alert error">{error}</div>}
        {message && <div className="alert success">{message}</div>}

        {isPending ? (
          <section className="pending-card">
            <div className="pending-icon">
              <Clock3 size={30} />
            </div>

            <h2>Registration under review</h2>

            <p>
              Your account has been created, but student portal access is not
              yet enabled. An Admin must verify your details and link your
              account to the correct student record.
            </p>

            <button
              className="secondary-button"
              onClick={() => loadProfile(session.access_token)}
            >
              Check status
            </button>
          </section>
        ) : ['rejected', 'inactive'].includes(profile?.account_status) ? (
          <section className="pending-card">
            <div className="pending-icon">
              <CircleAlert size={30} />
            </div>

            <h2>
              {profile.account_status === 'rejected'
                ? 'Registration not approved'
                : 'Account inactive'}
            </h2>

            <p>
              {profile.account_status === 'rejected'
                ? 'Your registration was not approved. Please contact the university administration if you believe this is a mistake.'
                : 'Your account is currently inactive. Please contact the university administration to restore access.'}
            </p>

            <button className="secondary-button" onClick={signOut}>
              Sign out
            </button>
          </section>
        ) : !profile ? (
          <section className="panel">
            <p>
              {profileLoading
                ? 'Loading account details...'
                : 'Account details could not be loaded. Check the error above, then retry.'}
            </p>

            <button
              className="secondary-button"
              disabled={profileLoading}
              onClick={() => loadProfile(session.access_token)}
            >
              {profileLoading ? 'Loading...' : 'Retry'}
            </button>
          </section>
        ) : view === 'registrations' && isAdmin ? (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Pending registrations</h2>
                <p className="muted">
                  Review each account before granting student access.
                </p>
              </div>

              <button
                className="secondary-button"
                onClick={loadAdminRegistrations}
              >
                <RefreshCw size={15} /> Refresh
              </button>
            </div>

            {Array.isArray(data) && data.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Student ID</th>
                      <th>Submitted</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {data.map(r => (
                      <tr key={r.profile_id}>
                        <td>{r.full_name || '-'}</td>
                        <td>{r.email || '-'}</td>
                        <td>{r.student_code || 'Generated on approval'}</td>
                        <td>
                          {r.created_at
                            ? new Date(r.created_at).toLocaleDateString()
                            : '-'}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="approve-button"
                              disabled={busy}
                              onClick={() =>
                                reviewRegistration(r.profile_id, 'approve')
                              }
                            >
                              Approve
                            </button>

                            <button
                              className="reject-button"
                              disabled={busy}
                              onClick={() =>
                                reviewRegistration(r.profile_id, 'reject')
                              }
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <Users size={26} />
                <strong>No pending registrations loaded</strong>
                <span>Refresh to check for new registrations.</span>
              </div>
            )}
          </section>
        ) : view === 'facultyManagement' && isAdmin ? (
          <FacultyManagement token={session.access_token} />
        ) : view === 'students' && isAdmin ? (
          <section className="student-management">
            <div className="panel student-management-panel">
              <div className="panel-heading student-heading">
                <div>
                  <h2>Student Management</h2>
                  <p className="muted">
                    Create and maintain student records, login credentials,
                    and course enrollments.
                  </p>
                </div>

                <div className="admin-page-actions">
                  <button
                    className="secondary-button"
                    disabled={studentsLoading}
                    onClick={() => {
                      loadStudentOptions();
                      loadStudents();
                    }}
                  >
                    <RefreshCw size={15} /> Refresh
                  </button>

                  <button
                    className="primary-button admin-add-button"
                    onClick={openStudentCreate}
                  >
                    <UserPlus size={15} /> Add Student
                  </button>
                </div>
              </div>

              <div className="student-summary">
                <div className="stat-icon blue">
                  <Users size={20} />
                </div>
                <span>Total student records</span>
                <strong>
                  {studentsLoading && studentTotal === 0
                    ? '...'
                    : studentTotal}
                </strong>
              </div>

              <form
                className="student-filters"
                onSubmit={event => {
                  event.preventDefault();
                  loadStudents({ offset: 0 });
                }}
              >
                <label className="student-search">
                  <span>Search students</span>
                  <div>
                    <Search size={16} />
                    <input
                      value={studentSearch}
                      onChange={event => setStudentSearch(event.target.value)}
                      placeholder="Student ID, name, or email"
                    />
                  </div>
                </label>

                <label>
                  <span>Department</span>
                  <select
                    value={studentFilters.department_id}
                    onChange={event =>
                      setStudentFilters({
                        ...studentFilters,
                        department_id: event.target.value,
                        course_id: ''
                      })
                    }
                  >
                    <option value="">All departments</option>
                    {studentOptions.departments.map(department => (
                      <option value={department.id} key={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Course</span>
                  <select
                    value={studentFilters.course_id}
                    onChange={event =>
                      setStudentFilters({
                        ...studentFilters,
                        course_id: event.target.value
                      })
                    }
                  >
                    <option value="">All courses</option>
                    {studentOptions.courses
                      .filter(
                        course =>
                          !studentFilters.department_id ||
                          course.department_id === studentFilters.department_id
                      )
                      .map(course => (
                        <option value={course.id} key={course.id}>
                          {course.name}
                        </option>
                      ))}
                  </select>
                </label>

                <label>
                  <span>Status</span>
                  <select
                    value={studentFilters.status}
                    onChange={event =>
                      setStudentFilters({
                        ...studentFilters,
                        status: event.target.value
                      })
                    }
                  >
                    <option value="">All statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>

                <button
                  className="secondary-button filter-submit"
                  disabled={studentsLoading}
                >
                  <Search size={15} /> Search
                </button>
              </form>

              {studentOptionsError && (
                <div className="alert error">{studentOptionsError}</div>
              )}

              {studentOptionsLoading &&
                !studentOptions.departments.length && (
                  <p className="muted student-option-note">
                    Loading department and course options...
                  </p>
                )}

              {!studentOptionsError &&
                !studentOptionsLoading &&
                !studentOptions.departments.length && (
                  <p className="muted student-option-note">
                    No active departments are configured. You can still add
                    students without academic placement.
                  </p>
                )}

              <div className="student-table-heading">
                <strong>
                  {studentsLoading
                    ? 'Loading student records...'
                    : `Showing ${studentFilteredTotal} matching record${studentFilteredTotal === 1 ? '' : 's'}`}
                </strong>
                <span>{studentTotal} total</span>
              </div>

              {studentsLoading ? (
                <div className="empty-state">
                  <RefreshCw size={24} />
                  <span>Loading students...</span>
                </div>
              ) : studentsError ? (
                <div className="empty-state">
                  <CircleAlert size={26} />
                  <strong>Student records could not be loaded</strong>
                  <span>{studentsError}</span>
                  <button
                    className="secondary-button"
                    onClick={() => loadStudents()}
                  >
                    <RefreshCw size={15} /> Retry
                  </button>
                </div>
              ) : students.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Student ID</th>
                        <th>Full name</th>
                        <th>Email</th>
                        <th>Department</th>
                        <th>Course</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {students.map(student => (
                        <tr key={student.id}>
                          <td><strong>{student.student_code}</strong></td>
                          <td>{student.full_name}</td>
                          <td>{student.email || '-'}</td>
                          <td>{student.department?.name || '-'}</td>
                          <td>
                            {student.enrollments?.filter(item => item.status === 'enrolled').length ? (
                              <details className="student-course-details">
                                <summary>
                                  {student.enrollments.filter(item => item.status === 'enrolled').length} course
                                  {student.enrollments.filter(item => item.status === 'enrolled').length === 1 ? '' : 's'}
                                </summary>
                                <ul>
                                  {student.enrollments
                                    .filter(item => item.status === 'enrolled')
                                    .map(item => (
                                      <li key={item.id}>
                                        {item.course?.name || 'Course'}
                                        {item.course?.code ? ` (${item.course.code})` : ''}
                                        {' - '}
                                        {item.semester?.label || `Semester ${item.semester?.semester_number || ''}`}
                                      </li>
                                    ))}
                                </ul>
                              </details>
                            ) : student.course?.name || '-'}
                          </td>
                          <td>
                            <span
                              className={`status-pill ${student.status === 'active' ? 'active-status' : 'pending'}`}
                            >
                              {student.status}
                            </span>
                          </td>
                          <td>
                            <div className="row-actions">
                              <button
                                className="secondary-button student-action"
                                title="View details"
                                onClick={() =>
                                  openStudentDetails(student, 'view')
                                }
                              >
                                <Eye size={14} />
                              </button>

                              <button
                                className="secondary-button student-action"
                                title="Edit student"
                                onClick={() =>
                                  openStudentDetails(student, 'edit')
                                }
                              >
                                <Pencil size={14} />
                              </button>

                              <button
                                className={
                                  student.status === 'active'
                                    ? 'reject-button'
                                    : 'approve-button'
                                }
                                onClick={() => changeStudentStatus(student)}
                                disabled={busy}
                              >
                                {student.status === 'active'
                                  ? 'Deactivate'
                                  : 'Reactivate'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <UserRoundPlus size={26} />
                  <strong>
                    {studentTotal === 0
                      ? 'No student records yet'
                      : 'No students match these filters'}
                  </strong>
                  <span>
                    {studentTotal === 0
                      ? 'Add a student record to get started.'
                      : 'Change your search or filters and try again.'}
                  </span>
                </div>
              )}

              <div className="student-pagination">
                <button
                  className="secondary-button"
                  disabled={studentsLoading || studentOffset <= 0}
                  onClick={() =>
                    loadStudents({
                      offset: Math.max(0, studentOffset - 25)
                    })
                  }
                >
                  <ChevronLeft size={15} /> Previous
                </button>

                <span>
                  {studentFilteredTotal
                    ? `${studentOffset + 1}-${Math.min(studentOffset + students.length, studentFilteredTotal)} of ${studentFilteredTotal}`
                    : '0 results'}
                </span>

                <button
                  className="secondary-button"
                  disabled={
                    studentsLoading ||
                    studentOffset + students.length >= studentFilteredTotal
                  }
                  onClick={() =>
                    loadStudents({ offset: studentOffset + 25 })
                  }
                >
                  Next <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </section>
        ) : view === 'academic' && isAdmin ? (
          <AdminAcademicManagement token={session.access_token} />
        ) : view === 'faculty' && isFaculty ? (
          <FacultyDashboard token={session.access_token} />
        ) : view === 'admins' && isAdmin ? (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Admin Management</h2>
                <p className="muted">
                  Authorized Admins can manage access to the university
                  administration workspace.
                </p>
              </div>

              <div className="admin-page-actions">
                <button
                  className="secondary-button"
                  disabled={adminsLoading}
                  onClick={loadAdmins}
                >
                  <RefreshCw size={15} /> Refresh
                </button>

                <button
                  className="primary-button admin-add-button"
                  onClick={openAdminDialog}
                >
                  <UserPlus size={15} /> Add Admin
                </button>
              </div>
            </div>

            {adminsLoading ? (
              <div className="empty-state">
                <RefreshCw size={24} />
                <span>Loading admin accounts...</span>
              </div>
            ) : admins?.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Admin</th>
                      <th>Email</th>
                      <th>Account status</th>
                      <th>Created</th>
                    </tr>
                  </thead>

                  <tbody>
                    {admins.map(admin => (
                      <tr key={admin.id}>
                        <td>{admin.full_name || '-'}</td>
                        <td>{admin.email || '-'}</td>
                        <td>
                          <span
                            className={`status-pill ${admin.account_status === 'active' ? 'active-status' : 'pending'}`}
                          >
                            {admin.account_status?.replaceAll('_', ' ') ||
                              'Unknown'}
                          </span>
                        </td>
                        <td>
                          {admin.created_at
                            ? new Date(admin.created_at).toLocaleDateString()
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : admins === null ? (
              <div className="empty-state">
                <CircleAlert size={26} />
                <strong>Admin accounts could not be loaded</strong>
                <span>Refresh to retry.</span>
              </div>
            ) : (
              <div className="empty-state">
                <Shield size={26} />
                <strong>No Admin accounts found</strong>
                <span>Add an Admin account to grant administrative access.</span>
              </div>
            )}
          </section>
        ) : view === 'profile' && isActiveStudent ? (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>My Profile</h2>
                <p className="muted">
                  View your student record and update your phone number.
                </p>
              </div>
            </div>

            {studentRecordLoading ? (
              <div className="empty-state">
                <RefreshCw size={24} />
                <span>Loading student profile...</span>
              </div>
            ) : studentRecordError ? (
              <div className="alert error">{studentRecordError}</div>
            ) : studentRecord ? (
              <>
                <div className="profile-photo-card">
                  <div className="profile-photo">
                    {studentRecord.photo_url ? (
                      <img src={studentRecord.photo_url} alt="Your profile" />
                    ) : (
                      <span>
                        {(studentRecord.full_name || 'S').slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="profile-photo-actions">
                    <strong>Profile photo</strong>
                    <small className="muted">
                      JPEG, PNG or WebP. It is cropped to a square.
                    </small>

                    <div className="row-actions">
                      <label
                        className={`secondary-button photo-upload ${photoBusy ? 'disabled' : ''}`}
                      >
                        {photoBusy
                          ? 'Working...'
                          : studentRecord.photo_url
                            ? 'Change photo'
                            : 'Upload photo'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={photoBusy}
                          onChange={changeStudentPhoto}
                        />
                      </label>

                      {studentRecord.photo_url && (
                        <button
                          type="button"
                          className="reject-button"
                          disabled={photoBusy}
                          onClick={removeStudentPhoto}
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {photoError && (
                      <small className="field-error">{photoError}</small>
                    )}
                  </div>
                </div>

                <div className="profile-grid">
                  <div className="profile-field">
                    <span>Student ID</span>
                    <strong>{studentRecord.student_code || '-'}</strong>
                  </div>
                  <div className="profile-field">
                    <span>Full name</span>
                    <strong>{studentRecord.full_name || '-'}</strong>
                  </div>
                  <div className="profile-field">
                    <span>Email address</span>
                    <strong>{studentRecord.email || session.user.email || '-'}</strong>
                  </div>
                  <div className="profile-field">
                    <span>Department</span>
                    <strong>{studentRecord.department?.name || '-'}</strong>
                  </div>
                  <div className="profile-field">
                    <span>Admission year</span>
                    <strong>{studentRecord.admission_year || '-'}</strong>
                  </div>
                  <div className="profile-field">
                    <span>Account status</span>
                    <strong>{studentRecord.status || '-'}</strong>
                  </div>
                </div>

                <EnrollmentTable enrollments={studentRecord.enrollments} />

                <form onSubmit={saveStudentPhone} className="profile-edit-form">
                  <label htmlFor="student-profile-phone">Phone number</label>
                  <input
                    id="student-profile-phone"
                    type="tel"
                    value={phoneDraft}
                    maxLength={40}
                    onChange={event => setPhoneDraft(event.target.value)}
                  />

                  {phoneError && (
                    <small className="field-error">{phoneError}</small>
                  )}
                  {phoneMessage && (
                    <div className="alert success">{phoneMessage}</div>
                  )}

                  <button
                    className="primary-button"
                    disabled={phoneSaving}
                  >
                    {phoneSaving ? 'Saving...' : 'Save'}
                  </button>
                </form>
              </>
            ) : (
              <div className="empty-state">
                <UserRound size={26} />
                <strong>Student profile not available</strong>
                <span>Contact an administrator if this continues.</span>
              </div>
            )}
          </section>
        ) : view === 'courses' && isActiveStudent ? (
          <StudentCoursesPanel
            record={studentRecord}
            loading={studentRecordLoading}
            error={studentRecordError}
          />
        ) : view === 'timetable' && isActiveStudent ? (
          <EmptyPortalPanel
            icon={Clock3}
            title="Timetable"
            description="View your class schedule."
            heading="To be implemented soon"
            requirement="The timetable module is not built yet. It will appear here once it is released."
          />
        ) : view === 'attendance' && isActiveStudent ? (
          <StudentAttendancePanel state={studentAttendance} />
        ) : view === 'fees' && isActiveStudent ? (
          <EmptyPortalPanel
            icon={Wallet}
            title="Fees"
            description="View your fee details and payments."
            heading="To be implemented soon"
            requirement="The fees module is not built yet. It will appear here once it is released."
          />
        ) : view === 'calendar' && isActiveStudent ? (
          <EmptyPortalPanel
            icon={CalendarDays}
            title="Academic Calendar"
            description="View academic dates and events."
            requirement="Academic calendar entries will appear here when they are configured."
          />
        ) : (
          <section className="dashboard-content">
            <div className="welcome-card">
              <div>
                <span className="eyebrow">YOUR CAMPUS WORKSPACE</span>
                <h2>Welcome back, {profile?.full_name || 'User'}.</h2>
                <p>
                  Manage your university information from one central workspace.
                </p>
              </div>
              <div className="welcome-icon">
                <GraduationCap size={40} />
              </div>
            </div>

            <div className="dashboard-grid">
              <div className="dashboard-stat-column">
                <section className="dashboard-stat-card">
                  <div className="stat-icon blue">
                    <Users size={22} />
                  </div>
                  <div>
                    <span>Account role</span>
                    <strong>
                      {profile?.role
                        ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
                        : 'Loading'}
                    </strong>
                    <small>Based on your university account</small>
                  </div>
                </section>

                <section className="dashboard-stat-card">
                  <div className="stat-icon green">
                    <ShieldCheck size={22} />
                  </div>
                  <div>
                    <span>Account status</span>
                    <strong>
                      {profile?.account_status
                        ? profile.account_status.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())
                        : 'Loading'}
                    </strong>
                    <small>Current access status</small>
                  </div>
                </section>

                <section className="dashboard-stat-card">
                  <div className="stat-icon purple">
                    <BookOpen size={22} />
                  </div>
                  <div>
                    <span>Academic workspace</span>
                    <strong>Management</strong>
                    <small>Available modules depend on your role</small>
                  </div>
                </section>
              </div>

              <section className="workspace-overview">
                <h2>Workspace overview</h2>
                <p className="muted">
                  Manage student verification, student records, faculty, and academic setup.
                </p>

                <div className="workspace-links">
                  {isAdmin && (
                    <>
                      <button
                        className="workspace-link"
                        onClick={loadAdminRegistrations}
                      >
                        <span className="workspace-link-icon"><Users size={20} /></span>
                        <span>
                          <strong>Student verification</strong>
                          <small>Review pending student registrations</small>
                        </span>
                        <ChevronRight size={18} />
                      </button>

                      <button
                        className="workspace-link"
                        onClick={openStudentManagement}
                      >
                        <span className="workspace-link-icon"><UserRoundPlus size={20} /></span>
                        <span>
                          <strong>Student management</strong>
                          <small>Maintain student records and login credentials</small>
                        </span>
                        <ChevronRight size={18} />
                      </button>

                      <button
                        className="workspace-link"
                        onClick={() => setView('facultyManagement')}
                      >
                        <span className="workspace-link-icon"><Users size={20} /></span>
                        <span>
                          <strong>Faculty management</strong>
                          <small>Create and manage faculty accounts</small>
                        </span>
                        <ChevronRight size={18} />
                      </button>

                      <button
                        className="workspace-link"
                        onClick={() => setView('academic')}
                      >
                        <span className="workspace-link-icon"><Building2 size={20} /></span>
                        <span>
                          <strong>Academic management</strong>
                          <small>Manage departments, courses, and semesters</small>
                        </span>
                        <ChevronRight size={18} />
                      </button>
                    </>
                  )}

                  {isFaculty && (
                    <button
                      className="workspace-link"
                      onClick={() => setView('faculty')}
                    >
                      <span className="workspace-link-icon"><LayoutDashboard size={20} /></span>
                      <span>
                        <strong>Faculty workspace</strong>
                        <small>Open your faculty dashboard</small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  )}

                  {isActiveStudent && (
                    <>
                      <button
                        className="workspace-link"
                        onClick={loadStudentProfile}
                      >
                        <span className="workspace-link-icon"><UserRound size={20} /></span>
                        <span>
                          <strong>My profile</strong>
                          <small>View your student record</small>
                        </span>
                        <ChevronRight size={18} />
                      </button>

                      <button
                        className="workspace-link"
                        onClick={() => setView('courses')}
                      >
                        <span className="workspace-link-icon"><BookOpen size={20} /></span>
                        <span>
                          <strong>Courses & Subjects</strong>
                          <small>Review course information</small>
                        </span>
                        <ChevronRight size={18} />
                      </button>
                    </>
                  )}
                </div>
              </section>
            </div>
          </section>
        )}
      </main>

      {studentModal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !busy) {
              setStudentModal(null);
            }
          }}
        >
          <section
            className="student-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-modal-title"
          >
            <div className="panel-heading">
              <div>
                <h2 id="student-modal-title">
                  {studentModal === 'view'
                    ? 'Student Details'
                    : studentModal === 'edit'
                      ? 'Edit Student'
                      : 'Add Student'}
                </h2>
                <p className="muted">
                  {studentModal === 'view'
                    ? 'Review the student record below.'
                    : studentModal === 'edit'
                      ? 'Update student information and login credentials below.'
                      : 'Create a student record and its Supabase login account.'}
                </p>
              </div>

              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                disabled={busy}
                onClick={() => setStudentModal(null)}
              >
                <X size={18} />
              </button>
            </div>

            {studentModal === 'view' ? (
              selectedStudent ? (
                <div className="student-details">
                  <div className="profile-grid">
                    <div className="profile-field">
                      <span>Student ID</span>
                      <strong>{selectedStudent.student_code || '-'}</strong>
                    </div>
                    <div className="profile-field">
                      <span>Full name</span>
                      <strong>{selectedStudent.full_name || '-'}</strong>
                    </div>
                    <div className="profile-field">
                      <span>Email address / Login username</span>
                      <strong>{selectedStudent.email || '-'}</strong>
                    </div>
                    <div className="profile-field">
                      <span>Phone number</span>
                      <strong>{selectedStudent.phone || '-'}</strong>
                    </div>
                    <div className="profile-field">
                      <span>Department</span>
                      <strong>{selectedStudent.department?.name || '-'}</strong>
                    </div>
                    <div className="profile-field">
                      <span>Admission year</span>
                      <strong>{selectedStudent.admission_year || '-'}</strong>
                    </div>
                    <div className="profile-field">
                      <span>Status</span>
                      <strong>{selectedStudent.status || '-'}</strong>
                    </div>
                  </div>

                  <EnrollmentTable enrollments={selectedStudent.enrollments} />

                  <div className="modal-actions">
                    <button
                      className="secondary-button"
                      onClick={() => setStudentModal(null)}
                    >
                      Close
                    </button>
                    <button
                      className="primary-button"
                      onClick={() => openStudentDetails(selectedStudent, 'edit')}
                    >
                      <Pencil size={15} /> Edit Student
                    </button>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <RefreshCw size={24} />
                  <span>Loading student details...</span>
                </div>
              )
            ) : (
              <form onSubmit={saveStudent} noValidate>
                <label htmlFor="student-full-name">Full name</label>
                <input
                  id="student-full-name"
                  value={studentForm.full_name}
                  maxLength={120}
                  aria-invalid={Boolean(studentFieldErrors.full_name)}
                  onChange={event =>
                    setStudentForm({
                      ...studentForm,
                      full_name: event.target.value
                    })
                  }
                  required
                />
                {studentFieldErrors.full_name && (
                  <small className="field-error">
                    {studentFieldErrors.full_name}
                  </small>
                )}

                <label htmlFor="student-email">Email address / Login username</label>
                <input
                  id="student-email"
                  type="email"
                  value={studentForm.email}
                  autoComplete="off"
                  aria-invalid={Boolean(studentFieldErrors.email)}
                  onChange={event =>
                    setStudentForm({
                      ...studentForm,
                      email: event.target.value
                    })
                  }
                  required
                />
                {studentFieldErrors.email && (
                  <small className="field-error">
                    {studentFieldErrors.email}
                  </small>
                )}

                <div className="student-password-fields">
                  <h3>
                    {studentModal === 'edit'
                      ? 'Update Login Password'
                      : 'Student Login Password'}
                  </h3>
                  {studentModal === 'edit' && (
                    <p className="muted">
                      Leave both password fields blank to keep the current password.
                      Enter a new password only if you want to change it in Supabase Auth.
                    </p>
                  )}

                  <label htmlFor="student-password">
                    {studentModal === 'edit' ? 'New password' : 'Password'}
                  </label>
                  <input
                    id="student-password"
                    type="password"
                    value={studentForm.password}
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    aria-invalid={Boolean(studentFieldErrors.password)}
                    onChange={event =>
                      setStudentForm(current => ({
                        ...current,
                        password: event.target.value
                      }))
                    }
                    required={studentModal === 'add'}
                    placeholder={
                      studentModal === 'edit'
                        ? 'Leave blank to keep current password'
                        : 'At least 8 characters'
                    }
                  />
                  {studentFieldErrors.password && (
                    <small className="field-error">
                      {studentFieldErrors.password}
                    </small>
                  )}

                  <label htmlFor="student-confirm-password">
                    Confirm {studentModal === 'edit' ? 'new ' : ''}password
                  </label>
                  <input
                    id="student-confirm-password"
                    type="password"
                    value={studentForm.confirm_password}
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    aria-invalid={Boolean(studentFieldErrors.confirm_password)}
                    onChange={event =>
                      setStudentForm(current => ({
                        ...current,
                        confirm_password: event.target.value
                      }))
                    }
                    required={studentModal === 'add'}
                    placeholder="Re-enter password"
                  />
                  {studentFieldErrors.confirm_password && (
                    <small className="field-error">
                      {studentFieldErrors.confirm_password}
                    </small>
                  )}
                </div>

                <label htmlFor="student-phone">Phone number</label>
                <input
                  id="student-phone"
                  type="tel"
                  value={studentForm.phone}
                  maxLength={40}
                  aria-invalid={Boolean(studentFieldErrors.phone)}
                  onChange={event =>
                    setStudentForm({
                      ...studentForm,
                      phone: event.target.value
                    })
                  }
                />
                {studentFieldErrors.phone && (
                  <small className="field-error">
                    {studentFieldErrors.phone}
                  </small>
                )}

                <label htmlFor="student-department">Department</label>
                <select
                  id="student-department"
                  value={studentForm.department_id}
                  onChange={event =>
                    setStudentForm({
                      ...studentForm,
                      department_id: event.target.value,
                      course_id: ''
                    })
                  }
                >
                  <option value="">No department assigned</option>
                  {studentOptions.departments.map(department => (
                    <option value={department.id} key={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>

                <div className="student-enrollments-editor">
                  <div>
                    <h3>Course Enrollments</h3>
                    <p className="muted">
                      Choose the branch and semester once, then tick the
                      courses the student takes in that semester.
                    </p>
                  </div>

                  <div className="student-enrollment-pickers">
                    <div>
                      <label htmlFor="enrollment-branch">Branch</label>
                      <select
                        id="enrollment-branch"
                        value={enrollBranch}
                        onChange={event =>
                          chooseEnrollmentBranch(event.target.value)
                        }
                      >
                        <option value="">All courses in the semester</option>
                        {enrollmentPrograms().map(program => (
                          <option value={program.id} key={program.id}>
                            {program.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="enrollment-semester">Semester</label>
                      <select
                        id="enrollment-semester"
                        value={enrollSemesterId}
                        onChange={event =>
                          setEnrollSemesterId(event.target.value)
                        }
                      >
                        <option value="">Select semester</option>
                        {studentOptions.semesters.map(semester => {
                          const year =
                            semester.academic_year?.label ||
                            semester.academic_year?.year_code;
                          const label =
                            semester.label ||
                            `Semester ${semester.semester_number}`;

                          return (
                            <option value={semester.id} key={semester.id}>
                              {year ? `${year} - ` : ''}{label}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  {enrollSemesterId && (
                    <div className="student-enrollment-add">
                      <label htmlFor="enrollment-course">Course</label>

                      {enrollmentCourses().length === 0 ? (
                        <p className="muted">
                          No courses are listed for this branch and semester.
                        </p>
                      ) : (
                        <div className="student-enrollment-add-row">
                          <select
                            id="enrollment-course"
                            value=""
                            onChange={event => {
                              if (event.target.value) {
                                toggleStudentEnrollment(
                                  event.target.value,
                                  true
                                );
                              }
                            }}
                          >
                            <option value="">
                              {remainingEnrollmentCourses().length
                                ? 'Add a course'
                                : 'All courses added'}
                            </option>
                            {remainingEnrollmentCourses().map(course => (
                              <option value={course.id} key={course.id}>
                                {course.name}
                                {course.code ? ` (${course.code})` : ''}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            className="secondary-button"
                            disabled={!remainingEnrollmentCourses().length}
                            onClick={() => setAllStudentEnrollments(true)}
                          >
                            Add all
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="student-enrollment-summary">
                    <strong>
                      Selected ({studentForm.enrollments.length})
                    </strong>

                    {studentForm.enrollments.length === 0 ? (
                      <p className="muted">No courses selected yet.</p>
                    ) : (
                      <div className="student-course-list">
                        {studentForm.enrollments.map(item => {
                          const course = studentOptions.courses.find(
                            option => option.id === item.course_id
                          );
                          const semester = studentOptions.semesters.find(
                            option => option.id === item.semester_id
                          );

                          return (
                            <span
                              className="student-course-chip"
                              key={`${item.course_id}:${item.semester_id}`}
                            >
                              {course?.name || 'Course'}
                              {semester
                                ? ` - ${semester.label || `Semester ${semester.semester_number}`}`
                                : ''}
                              <button
                                type="button"
                                className="chip-remove"
                                aria-label={`Remove ${course?.name || 'course'}`}
                                onClick={() =>
                                  removeStudentEnrollment(
                                    item.course_id,
                                    item.semester_id
                                  )
                                }
                              >
                                x
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <label htmlFor="student-admission-year">Admission year</label>
                <input
                  id="student-admission-year"
                  inputMode="numeric"
                  value={studentForm.admission_year}
                  maxLength={4}
                  aria-invalid={Boolean(studentFieldErrors.admission_year)}
                  onChange={event =>
                    setStudentForm({
                      ...studentForm,
                      admission_year: event.target.value
                    })
                  }
                  placeholder="e.g. 2026"
                />
                {studentFieldErrors.admission_year && (
                  <small className="field-error">
                    {studentFieldErrors.admission_year}
                  </small>
                )}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setStudentModal(null)}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button
                    className="primary-button admin-submit-button"
                    disabled={busy}
                  >
                    {busy
                      ? 'Saving...'
                      : studentModal === 'edit'
                        ? 'Save Changes'
                        : 'Create Student'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}

      {adminDialogOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !adminBusy) {
              setAdminDialogOpen(false);
            }
          }}
        >
          <section
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-modal-title"
          >
            <div className="panel-heading">
              <div>
                <h2 id="admin-modal-title">Add Admin</h2>
                <p className="muted">
                  Create an administrator account with university-wide access.
                </p>
              </div>

              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                disabled={adminBusy}
                onClick={() => setAdminDialogOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={createAdmin} noValidate>
              <label htmlFor="admin-full-name">Full name</label>
              <input
                id="admin-full-name"
                value={adminForm.fullName}
                maxLength={120}
                aria-invalid={Boolean(adminFieldErrors.fullName)}
                onChange={event => {
                  setAdminForm({
                    ...adminForm,
                    fullName: event.target.value
                  });
                  setAdminFieldErrors({
                    ...adminFieldErrors,
                    fullName: ''
                  });
                }}
                required
              />
              {adminFieldErrors.fullName && (
                <small className="field-error">
                  {adminFieldErrors.fullName}
                </small>
              )}

              <label htmlFor="admin-email">Email address</label>
              <input
                id="admin-email"
                type="email"
                value={adminForm.email}
                aria-invalid={Boolean(adminFieldErrors.email)}
                onChange={event => {
                  setAdminForm({
                    ...adminForm,
                    email: event.target.value
                  });
                  setAdminFieldErrors({
                    ...adminFieldErrors,
                    email: ''
                  });
                }}
                required
              />
              {adminFieldErrors.email && (
                <small className="field-error">
                  {adminFieldErrors.email}
                </small>
              )}

              <label htmlFor="admin-password">Temporary password</label>
              <input
                id="admin-password"
                type="password"
                value={adminForm.password}
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                aria-invalid={Boolean(adminFieldErrors.password)}
                onChange={event => {
                  setAdminForm({
                    ...adminForm,
                    password: event.target.value
                  });
                  setAdminFieldErrors({
                    ...adminFieldErrors,
                    password: ''
                  });
                }}
                required
              />
              {adminFieldErrors.password && (
                <small className="field-error">
                  {adminFieldErrors.password}
                </small>
              )}

              <label htmlFor="admin-confirm-password">Confirm password</label>
              <input
                id="admin-confirm-password"
                type="password"
                value={adminForm.confirmPassword}
                autoComplete="new-password"
                aria-invalid={Boolean(adminFieldErrors.confirmPassword)}
                onChange={event => {
                  setAdminForm({
                    ...adminForm,
                    confirmPassword: event.target.value
                  });
                  setAdminFieldErrors({
                    ...adminFieldErrors,
                    confirmPassword: ''
                  });
                }}
                required
              />
              {adminFieldErrors.confirmPassword && (
                <small
                  className="field-error"
                  id="admin-confirm-password-error"
                >
                  {adminFieldErrors.confirmPassword}
                </small>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={adminBusy}
                  onClick={() => setAdminDialogOpen(false)}
                >
                  Cancel
                </button>

                <button
                  className="primary-button admin-submit-button"
                  disabled={adminBusy}
                >
                  {adminBusy ? 'Creating...' : 'Create Admin'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}