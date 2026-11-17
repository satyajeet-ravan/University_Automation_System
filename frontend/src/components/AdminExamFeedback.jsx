import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  CirclePlus,
  RefreshCw,
  X
} from 'lucide-react';
import { apiRequest } from '../lib/api';

const DEFAULT_START = '13:15';
const DEFAULT_END = '16:15';

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDeadline(value) {
  return new Date(value).toLocaleString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function semesterLabel(semester) {
  if (!semester) return '-';
  const year = semester.academic_year?.label || semester.academic_year?.year_code;
  const label = semester.label || `Semester ${semester.semester_number}`;
  return year ? `${label} (${year})` : label;
}

function emptyForm() {
  return {
    program_code: '',
    semester_id: '',
    exam_type: 'MST',
    deadline: '',
    schedule: {}
  };
}

function roundState(round) {
  if (round.status === 'closed') return { label: 'Closed', tone: 'pending' };
  if (!round.accepting) return { label: 'Deadline passed', tone: 'pending' };
  return { label: 'Open', tone: 'active-status' };
}

export default function AdminExamFeedback({ token }) {
  const [rounds, setRounds] = useState([]);
  const [options, setOptions] = useState({ programs: [], semesters: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState(null);
  const [resultsLoading, setResultsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    // Branches and semesters do not depend on the feedback tables, so the form
    // keeps working even if the rounds themselves cannot be loaded yet.
    const [roundResult, optionResult] = await Promise.allSettled([
      apiRequest('/exam-feedback/admin/rounds', { token }),
      apiRequest('/exam-feedback/admin/options', { token })
    ]);

    if (optionResult.status === 'fulfilled') {
      setOptions({
        programs: optionResult.value.programs || [],
        semesters: optionResult.value.semesters || []
      });
    }

    if (roundResult.status === 'fulfilled') {
      setRounds(roundResult.value.rounds || []);
    } else {
      setRounds([]);
    }

    const failure = [roundResult, optionResult].find(
      item => item.status === 'rejected'
    );

    if (failure) {
      setError(failure.reason?.message || 'Could not load feedback rounds.');
    }

    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const program = options.programs.find(item => item.id === form.program_code);
  const semester = program?.semesters.find(
    item => item.semester_id === form.semester_id
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFieldErrors({});
    setFormError('');
    setMessage('');
    setModal('form');
  }

  async function openEdit(round) {
    setEditing(round);
    setFieldErrors({});
    setFormError('');
    setMessage('');
    setError('');

    try {
      const result = await apiRequest(`/exam-feedback/admin/rounds/${round.id}`, {
        token
      });

      const schedule = {};

      for (const subject of result.subjects) {
        schedule[subject.course_id] = {
          exam_date: subject.exam_date,
          start_time: subject.start_time.slice(0, 5),
          end_time: subject.end_time.slice(0, 5)
        };
      }

      setForm({
        program_code: round.program_code,
        semester_id: round.semester_id,
        exam_type: round.exam_type,
        deadline: toLocalInput(round.deadline),
        schedule
      });
      setModal('form');
    } catch (e) {
      setError(e.message);
    }
  }

  function changeField(name, value) {
    setForm(current => {
      const next = { ...current, [name]: value };

      // A different branch or semester has a different subject list.
      if (name === 'program_code') {
        next.semester_id = '';
        next.schedule = {};
      }

      if (name === 'semester_id') next.schedule = {};

      return next;
    });
    setFieldErrors(current => ({ ...current, [name]: '' }));
  }

  function changeSchedule(courseId, name, value) {
    setForm(current => {
      const existing = current.schedule[courseId] || {
        exam_date: '',
        start_time: DEFAULT_START,
        end_time: DEFAULT_END
      };

      return {
        ...current,
        schedule: {
          ...current.schedule,
          [courseId]: { ...existing, [name]: value }
        }
      };
    });
  }

  function validate() {
    const errors = {};

    if (!editing) {
      if (!form.program_code) errors.program_code = 'Select a branch.';
      if (!form.semester_id) errors.semester_id = 'Select a semester.';
    }

    if (!form.deadline) {
      errors.deadline = 'Set the feedback deadline.';
    } else if (!editing && new Date(form.deadline).getTime() <= Date.now()) {
      errors.deadline = 'Pick a date and time in the future.';
    }

    const entries = Object.entries(form.schedule).filter(
      ([, value]) => value.exam_date
    );

    if (!entries.length) {
      errors.schedule = 'Enter the exam date for at least one subject.';
    }

    for (const [courseId, value] of entries) {
      if (!value.start_time || !value.end_time) {
        errors[`time_${courseId}`] = 'Enter both times.';
      } else if (value.start_time >= value.end_time) {
        errors[`time_${courseId}`] = 'End time must be after start time.';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function save(event) {
    event.preventDefault();
    setFormError('');

    if (!validate()) return;

    const subjects = Object.entries(form.schedule)
      .filter(([, value]) => value.exam_date)
      .map(([courseId, value]) => ({ course_id: courseId, ...value }));

    setSaving(true);

    try {
      if (editing) {
        await apiRequest(`/exam-feedback/admin/rounds/${editing.id}`, {
          token,
          method: 'PUT',
          body: JSON.stringify({
            deadline: new Date(form.deadline).toISOString(),
            subjects
          })
        });
      } else {
        await apiRequest('/exam-feedback/admin/rounds', {
          token,
          method: 'POST',
          body: JSON.stringify({
            program_code: form.program_code,
            semester_id: form.semester_id,
            exam_type: form.exam_type,
            deadline: new Date(form.deadline).toISOString(),
            subjects
          })
        });
      }

      setModal(null);
      setMessage(
        editing
          ? 'Feedback round updated.'
          : 'Feedback round opened. Students can now submit their feedback.'
      );
      await load();
    } catch (e) {
      setFormError(e.message);
      setFieldErrors(current => ({ ...current, ...(e.fields || {}) }));
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(round, status) {
    setError('');
    setMessage('');

    try {
      await apiRequest(`/exam-feedback/admin/rounds/${round.id}`, {
        token,
        method: 'PUT',
        body: JSON.stringify({ status })
      });
      setMessage(status === 'closed' ? 'Feedback round closed.' : 'Feedback round reopened.');
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(round) {
    if (
      !window.confirm(
        `Delete the ${round.exam_type} feedback round for ${round.program_name}?`
      )
    ) {
      return;
    }

    setError('');
    setMessage('');

    try {
      await apiRequest(`/exam-feedback/admin/rounds/${round.id}`, {
        token,
        method: 'DELETE'
      });
      setMessage('Feedback round deleted.');
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function openResults(round) {
    setResults({ round, data: null });
    setResultsLoading(true);
    setModal('results');

    try {
      const data = await apiRequest(
        `/exam-feedback/admin/rounds/${round.id}/results`,
        { token }
      );
      setResults({ round, data });
    } catch (e) {
      setResults({ round, data: null, error: e.message });
    } finally {
      setResultsLoading(false);
    }
  }

  const availableCourses = semester?.courses || [];

  return (
    <section className="panel exam-feedback">
      <div className="panel-heading">
        <div>
          <h2>Exam and Faculty Feedback</h2>
          <p className="muted">
            Open faculty feedback for a branch and semester. Students get their
            hall ticket after they submit.
          </p>
        </div>

        <div className="admin-page-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={loading}
            onClick={load}
          >
            <RefreshCw size={15} /> Refresh
          </button>

          <button
            type="button"
            className="primary-button admin-add-button"
            onClick={openCreate}
          >
            <CirclePlus size={15} /> New feedback round
          </button>
        </div>
      </div>

      {error && (
        <div className="alert error" role="alert">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {message && (
        <div className="alert success" role="status">
          <CheckCircle2 size={16} /> {message}
        </div>
      )}

      {loading ? (
        <div className="empty-state">
          <RefreshCw size={24} />
          <span>Loading feedback rounds...</span>
        </div>
      ) : rounds.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Branch</th>
                <th>Semester</th>
                <th>Exam</th>
                <th>Deadline</th>
                <th>Subjects</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {rounds.map(round => {
                const state = roundState(round);

                return (
                  <tr key={round.id}>
                    <td><strong>{round.program_name}</strong></td>
                    <td>{semesterLabel(round.semester)}</td>
                    <td>{round.exam_type}</td>
                    <td>{formatDeadline(round.deadline)}</td>
                    <td>{round.subject_count}</td>
                    <td>
                      {round.submission_count} / {round.eligible_count}
                    </td>
                    <td>
                      <span className={`status-pill ${state.tone}`}>
                        {state.label}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => openResults(round)}
                        >
                          <BarChart3 size={14} /> Results
                        </button>

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => openEdit(round)}
                        >
                          Edit
                        </button>

                        {round.status === 'open' ? (
                          <button
                            type="button"
                            className="reject-button"
                            onClick={() => setStatus(round, 'closed')}
                          >
                            Close
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="approve-button"
                            onClick={() => setStatus(round, 'open')}
                          >
                            Reopen
                          </button>
                        )}

                        {round.submission_count === 0 && (
                          <button
                            type="button"
                            className="reject-button"
                            onClick={() => remove(round)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <BarChart3 size={26} />
          <strong>No feedback rounds yet</strong>
          <span>
            Create a round for a branch and semester to collect faculty
            feedback and release hall tickets.
          </span>
        </div>
      )}

      {modal === 'form' && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !saving) setModal(null);
          }}
        >
          <section
            className="admin-modal student-modal exam-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exam-modal-title"
          >
            <div className="panel-heading">
              <div>
                <h2 id="exam-modal-title">
                  {editing ? 'Edit feedback round' : 'New feedback round'}
                </h2>
                <p className="muted">
                  Choose the branch, semester and exam, then enter the exam
                  date and time of each subject.
                </p>
              </div>

              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                disabled={saving}
                onClick={() => setModal(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={save} noValidate>
              <div className="exam-form-grid">
                <div>
                  <label htmlFor="exam-branch">Branch</label>
                  <select
                    id="exam-branch"
                    value={form.program_code}
                    disabled={Boolean(editing)}
                    onChange={event => changeField('program_code', event.target.value)}
                  >
                    <option value="">Select branch</option>
                    {options.programs.map(item => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                  {fieldErrors.program_code && (
                    <small className="field-error">{fieldErrors.program_code}</small>
                  )}
                </div>

                <div>
                  <label htmlFor="exam-semester">Semester</label>
                  <select
                    id="exam-semester"
                    value={form.semester_id}
                    disabled={Boolean(editing) || !program}
                    onChange={event => changeField('semester_id', event.target.value)}
                  >
                    <option value="">Select semester</option>
                    {(program?.semesters || []).map(item => {
                      const match = options.semesters.find(
                        option => option.id === item.semester_id
                      );

                      return (
                        <option key={item.semester_id} value={item.semester_id}>
                          {semesterLabel(match) !== '-'
                            ? semesterLabel(match)
                            : `Semester ${item.number}`}
                        </option>
                      );
                    })}
                  </select>
                  {fieldErrors.semester_id && (
                    <small className="field-error">{fieldErrors.semester_id}</small>
                  )}
                </div>

                <div>
                  <label htmlFor="exam-type">Exam</label>
                  <select
                    id="exam-type"
                    value={form.exam_type}
                    disabled={Boolean(editing)}
                    onChange={event => changeField('exam_type', event.target.value)}
                  >
                    <option value="MST">MST</option>
                    <option value="ESE">ESE</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="exam-deadline">Feedback deadline</label>
                  <input
                    id="exam-deadline"
                    type="datetime-local"
                    value={form.deadline}
                    onChange={event => changeField('deadline', event.target.value)}
                  />
                  {fieldErrors.deadline && (
                    <small className="field-error">{fieldErrors.deadline}</small>
                  )}
                </div>
              </div>

              <div className="exam-schedule">
                <h3>Exam schedule</h3>
                <p className="muted">
                  Enter a date for each subject that has an exam. Subjects
                  without a date are left out of the hall ticket.
                </p>

                {!semester ? (
                  <p className="muted">Select a branch and semester to list its subjects.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Subject</th>
                          <th>Exam date</th>
                          <th>Start</th>
                          <th>End</th>
                        </tr>
                      </thead>

                      <tbody>
                        {availableCourses.map(course => {
                          const row = form.schedule[course.id] || {
                            exam_date: '',
                            start_time: DEFAULT_START,
                            end_time: DEFAULT_END
                          };

                          return (
                            <tr key={course.id}>
                              <td>
                                <strong>{course.name}</strong>
                                <small className="academic-secondary">{course.code}</small>
                                {fieldErrors[`time_${course.id}`] && (
                                  <small className="field-error">
                                    {fieldErrors[`time_${course.id}`]}
                                  </small>
                                )}
                              </td>
                              <td>
                                <input
                                  type="date"
                                  aria-label={`Exam date for ${course.name}`}
                                  value={row.exam_date}
                                  onChange={event =>
                                    changeSchedule(course.id, 'exam_date', event.target.value)
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="time"
                                  aria-label={`Start time for ${course.name}`}
                                  value={row.start_time}
                                  onChange={event =>
                                    changeSchedule(course.id, 'start_time', event.target.value)
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="time"
                                  aria-label={`End time for ${course.name}`}
                                  value={row.end_time}
                                  onChange={event =>
                                    changeSchedule(course.id, 'end_time', event.target.value)
                                  }
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {fieldErrors.schedule && (
                  <small className="field-error">{fieldErrors.schedule}</small>
                )}
              </div>

              {formError && <div className="alert error">{formError}</div>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={saving}
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>

                <button
                  className="primary-button admin-submit-button"
                  disabled={saving}
                >
                  {saving
                    ? 'Saving...'
                    : editing ? 'Save changes' : 'Open feedback round'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {modal === 'results' && results && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setModal(null);
          }}
        >
          <section
            className="admin-modal student-modal exam-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exam-results-title"
          >
            <div className="panel-heading">
              <div>
                <h2 id="exam-results-title">
                  Feedback results: {results.round.program_name},{' '}
                  {results.round.exam_type}
                </h2>
                <p className="muted">
                  Average rating out of 5 for each teacher and subject.
                  Individual answers are anonymous.
                </p>
              </div>

              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => setModal(null)}
              >
                <X size={18} />
              </button>
            </div>

            {resultsLoading ? (
              <div className="empty-state">
                <RefreshCw size={24} />
                <span>Loading results...</span>
              </div>
            ) : results.error ? (
              <div className="alert error">{results.error}</div>
            ) : results.data?.results.length ? (
              <>
                <p className="muted">
                  {results.data.submission_count} student
                  {results.data.submission_count === 1 ? '' : 's'} submitted.
                </p>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th>Teacher</th>
                        <th>Responses</th>
                        {results.data.criteria.map(item => (
                          <th key={item.key}>{item.label}</th>
                        ))}
                        <th>Overall</th>
                      </tr>
                    </thead>

                    <tbody>
                      {results.data.results.map(item => (
                        <tr key={`${item.course?.id}:${item.faculty?.id}`}>
                          <td>
                            <strong>{item.course?.name}</strong>
                            <small className="academic-secondary">{item.course?.code}</small>
                          </td>
                          <td>{item.faculty?.full_name}</td>
                          <td>{item.responses}</td>
                          {results.data.criteria.map(criterion => (
                            <td key={criterion.key}>{item.averages[criterion.key]}</td>
                          ))}
                          <td><strong>{item.overall}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <BarChart3 size={26} />
                <strong>No feedback submitted yet</strong>
                <span>Results appear here once students submit.</span>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
