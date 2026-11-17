import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  MessageSquare,
  RefreshCw,
  Send
} from 'lucide-react';
import { apiBlob, apiRequest } from '../lib/api';

function semesterLabel(semester) {
  if (!semester) return '-';
  return semester.label || `Semester ${semester.semester_number}`;
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

function formatDate(value) {
  const [year, month, day] = String(value).split('-');
  return `${day}/${month}/${year}`;
}

const STATUS_LABELS = {
  open: { label: 'Feedback pending', tone: 'pending' },
  submitted: { label: 'Submitted', tone: 'active-status' },
  closed: { label: 'Closed', tone: 'pending' }
};

export default function StudentFeedback({ token }) {
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState('');

  const loadRounds = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const result = await apiRequest('/exam-feedback/student/rounds', { token });
      setRounds(result.rounds || []);
    } catch (e) {
      setError(e.message || 'Could not load feedback.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadRounds();
  }, [loadRounds]);

  async function openRound(round) {
    setError('');
    setMessage('');
    setAnswers({});
    setDetail({ round, loading: true });
    setDetailLoading(true);

    try {
      const result = await apiRequest(`/exam-feedback/student/rounds/${round.id}`, {
        token
      });
      setDetail(result);
    } catch (e) {
      setDetail(null);
      setError(e.message);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetail(null);
    setAnswers({});
    loadRounds();
  }

  function itemKey(item) {
    return `${item.course.id}:${item.faculty.id}`;
  }

  function rate(item, criterion, value) {
    const key = itemKey(item);

    setAnswers(current => ({
      ...current,
      [key]: {
        ratings: { ...(current[key]?.ratings || {}), [criterion]: value },
        comments: current[key]?.comments || ''
      }
    }));
  }

  function changeComment(item, value) {
    const key = itemKey(item);

    setAnswers(current => ({
      ...current,
      [key]: { ratings: current[key]?.ratings || {}, comments: value }
    }));
  }

  const progress = useMemo(() => {
    if (!detail?.items) return { done: 0, total: 0 };

    const perItem = detail.criteria.length;
    const total = detail.items.length * perItem;
    const done = detail.items.reduce(
      (sum, item) =>
        sum + Object.keys(answers[itemKey(item)]?.ratings || {}).length,
      0
    );

    return { done, total };
  }, [detail, answers]);

  async function submit() {
    if (!window.confirm('Submit your feedback? You cannot change it afterwards.')) {
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const result = await apiRequest(
        `/exam-feedback/student/rounds/${detail.round.id}/submit`,
        {
          token,
          method: 'POST',
          body: JSON.stringify({
            responses: detail.items.map(item => ({
              course_id: item.course.id,
              faculty_id: item.faculty.id,
              ratings: answers[itemKey(item)]?.ratings,
              comments: answers[itemKey(item)]?.comments || ''
            }))
          })
        }
      );

      setMessage(result.message);

      const refreshed = await apiRequest(
        `/exam-feedback/student/rounds/${detail.round.id}`,
        { token }
      );

      setDetail(refreshed);
      setAnswers({});
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function downloadTicket(round) {
    setError('');
    setDownloading(round.id);

    try {
      const blob = await apiBlob(
        `/exam-feedback/student/rounds/${round.id}/hallticket`,
        { token }
      );
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');

      link.href = url;
      link.download = `hall-ticket-${round.exam_type}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError(e.message);
    } finally {
      setDownloading('');
    }
  }

  const header = (
    <div className="panel-heading">
      <div>
        <h2>Faculty Feedback</h2>
        <p className="muted">
          Rate your teachers for each exam to unlock your hall ticket.
        </p>
      </div>

      {!detail && (
        <button
          type="button"
          className="secondary-button"
          disabled={loading}
          onClick={loadRounds}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      )}
    </div>
  );

  const alerts = (
    <>
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
    </>
  );

  if (detail) {
    const round = detail.round;
    const submitted = round.status === 'submitted';
    const canSubmit = round.status === 'open';

    return (
      <section className="panel student-feedback">
        {header}
        {alerts}

        <button
          type="button"
          className="secondary-button feedback-back"
          onClick={closeDetail}
        >
          <ArrowLeft size={15} /> All exams
        </button>

        {detailLoading || detail.loading ? (
          <div className="empty-state">
            <RefreshCw size={24} />
            <span>Loading...</span>
          </div>
        ) : (
          <>
            <div className="feedback-round-head">
              <div>
                <span className="eyebrow">{round.exam_type} EXAM</span>
                <h3>
                  {round.program_name}, {semesterLabel(round.semester)}
                </h3>
                <p className="muted">
                  Feedback deadline: {formatDeadline(round.deadline)}
                </p>
              </div>

              <span className={`status-pill ${STATUS_LABELS[round.status].tone}`}>
                {STATUS_LABELS[round.status].label}
              </span>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Exam date</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.subjects.map(subject => (
                    <tr key={subject.course.id}>
                      <td>
                        <strong>{subject.course.name}</strong>
                        <small className="academic-secondary">{subject.course.code}</small>
                      </td>
                      <td>{formatDate(subject.exam_date)}</td>
                      <td>{subject.start_time} to {subject.end_time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {submitted ? (
              <div className="feedback-done">
                <CheckCircle2 size={28} />
                <div>
                  <strong>Feedback submitted</strong>
                  <span className="muted">
                    Your hall ticket is ready to download.
                  </span>
                </div>

                <button
                  type="button"
                  className="primary-button"
                  disabled={downloading === round.id}
                  onClick={() => downloadTicket(round)}
                >
                  <Download size={15} />
                  {downloading === round.id ? 'Preparing...' : 'Download hall ticket'}
                </button>
              </div>
            ) : !canSubmit ? (
              <div className="empty-state">
                <AlertCircle size={26} />
                <strong>Feedback is closed</strong>
                <span>
                  The deadline has passed. Contact the administration to
                  receive your hall ticket.
                </span>
              </div>
            ) : (
              <>
                <h3 className="feedback-section-title">Rate your teachers</h3>

                {detail.items.length === 0 ? (
                  <p className="muted">
                    No teachers are assigned to your subjects yet, so there is
                    nothing to rate. You can submit to get your hall ticket.
                  </p>
                ) : (
                  <div className="feedback-matrix-wrap">
                    <table className="feedback-matrix">
                      <thead>
                        <tr>
                          <th className="fm-no">Sr No</th>
                          <th className="fm-question">Question</th>
                          {detail.items.map(item => (
                            <th className="fm-subject" key={itemKey(item)}>
                              <span className="fm-code">{item.course.code}</span>
                              <strong>{item.course.name}</strong>
                              <span className="fm-teacher">
                                {item.faculty.full_name}
                              </span>
                              <span className="fm-exam">
                                {round.exam_type} - Theory
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody>
                        {detail.criteria.map((criterion, index) => (
                          <tr key={criterion.key}>
                            <td className="fm-no">{index + 1}</td>
                            <td className="fm-question">{criterion.label}</td>

                            {detail.items.map(item => {
                              const value =
                                answers[itemKey(item)]?.ratings?.[criterion.key] || '';

                              return (
                                <td className="fm-cell" key={itemKey(item)}>
                                  <select
                                    value={value}
                                    className={value ? 'answered' : ''}
                                    aria-label={`${criterion.label} for ${item.course.name}`}
                                    onChange={event =>
                                      rate(
                                        item,
                                        criterion.key,
                                        Number(event.target.value)
                                      )
                                    }
                                  >
                                    <option value="">Please select</option>
                                    {detail.levels.map(level => (
                                      <option key={level.value} value={level.value}>
                                        {level.label}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              );
                            })}
                          </tr>
                        ))}

                        <tr>
                          <td className="fm-no">{detail.criteria.length + 1}</td>
                          <td className="fm-question">Comments (optional)</td>

                          {detail.items.map(item => (
                            <td className="fm-cell" key={itemKey(item)}>
                              <textarea
                                rows={2}
                                maxLength={500}
                                placeholder="Optional"
                                aria-label={`Comments for ${item.course.name}`}
                                value={answers[itemKey(item)]?.comments || ''}
                                onChange={event =>
                                  changeComment(item, event.target.value)
                                }
                              />
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="feedback-submit-bar">
                  <span className="muted">
                    {progress.total
                      ? `${progress.done} of ${progress.total} ratings given`
                      : 'No ratings needed'}
                  </span>

                  <button
                    type="button"
                    className="primary-button"
                    disabled={submitting || progress.done < progress.total}
                    onClick={submit}
                  >
                    <Send size={15} />
                    {submitting ? 'Submitting...' : 'Submit feedback'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </section>
    );
  }

  return (
    <section className="panel student-feedback">
      {header}
      {alerts}

      {loading ? (
        <div className="empty-state">
          <RefreshCw size={24} />
          <span>Loading feedback...</span>
        </div>
      ) : rounds.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Exam</th>
                <th>Branch</th>
                <th>Semester</th>
                <th>Subjects</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {rounds.map(round => (
                <tr key={round.id}>
                  <td><strong>{round.exam_type}</strong></td>
                  <td>{round.program_name}</td>
                  <td>{semesterLabel(round.semester)}</td>
                  <td>{round.subject_count}</td>
                  <td>{formatDeadline(round.deadline)}</td>
                  <td>
                    <span className={`status-pill ${STATUS_LABELS[round.status].tone}`}>
                      {STATUS_LABELS[round.status].label}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      {round.status === 'submitted' ? (
                        <button
                          type="button"
                          className="primary-button"
                          disabled={downloading === round.id}
                          onClick={() => downloadTicket(round)}
                        >
                          <Download size={14} />
                          {downloading === round.id ? 'Preparing...' : 'Hall ticket'}
                        </button>
                      ) : null}

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => openRound(round)}
                      >
                        {round.status === 'open' ? 'Give feedback' : 'View'}
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
          <MessageSquare size={26} />
          <strong>No feedback requested yet</strong>
          <span>
            When the administration opens feedback for your semester it will
            appear here.
          </span>
        </div>
      )}
    </section>
  );
}
