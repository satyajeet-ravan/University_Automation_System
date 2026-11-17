// What students rate, and the five answers they can give for each item.
export const FEEDBACK_CRITERIA = [
  { key: 'q1', label: 'Has the Teacher covered the entire syllabus as prescribed by the University?' },
  { key: 'q2', label: 'Motivation and inspiration for students to learn' },
  { key: 'q3', label: 'Willingness to offer help and advice to students' },
  { key: 'q4', label: 'Effectiveness of the Teacher in terms of technical content and course content' },
  { key: 'q5', label: 'Effectiveness of the Teacher in terms of communication skills' }
];

export const FEEDBACK_LEVELS = [
  { value: 1, label: 'Worst' },
  { value: 2, label: 'Bad' },
  { value: 3, label: 'Good' },
  { value: 4, label: 'Very good' },
  { value: 5, label: 'Excellent' }
];

export const EXAM_TYPES = ['MST', 'ESE'];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:00)?$/;

export function validDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}

export function validTime(value) {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

// "13:15:00" or "13:15" to "13:15".
export function shortTime(value) {
  return String(value || '').slice(0, 5);
}

// "13:15" to "01:15 PM".
export function formatTime12(value) {
  const [hours, minutes] = shortTime(value).split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return '';
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

// "2026-12-01" to "01/12/2026".
export function formatDateDmy(value) {
  const [year, month, day] = String(value || '').split('-');
  return year && month && day ? `${day}/${month}/${year}` : '';
}

export function toRoman(number) {
  const numerals = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ];
  let remaining = Number(number);
  let result = '';

  for (const [value, symbol] of numerals) {
    while (remaining >= value) {
      result += symbol;
      remaining -= value;
    }
  }

  return result || String(number);
}

// Returns the cleaned ratings object, or null if any criterion is missing or invalid.
export function normalizeRatings(ratings) {
  if (!ratings || typeof ratings !== 'object' || Array.isArray(ratings)) {
    return null;
  }

  const clean = {};

  for (const { key } of FEEDBACK_CRITERIA) {
    const value = Number(ratings[key]);

    if (!Number.isInteger(value) || value < 1 || value > 5) return null;
    clean[key] = value;
  }

  return clean;
}
