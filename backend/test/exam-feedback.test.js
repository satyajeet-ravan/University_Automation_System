import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEEDBACK_CRITERIA,
  formatDateDmy,
  formatTime12,
  normalizeRatings,
  toRoman,
  validDate,
  validTime
} from '../src/feedback-config.js';
import { generateHallTicketPdf } from '../src/hall-ticket.js';

test('feedback ratings must cover every criterion with a value from 1 to 5', () => {
  const full = Object.fromEntries(FEEDBACK_CRITERIA.map(item => [item.key, 4]));

  assert.deepEqual(normalizeRatings(full), full);
  assert.equal(normalizeRatings({ ...full, q1: 0 }), null);
  assert.equal(normalizeRatings({ ...full, q1: 6 }), null);
  assert.equal(normalizeRatings({ ...full, q1: 2.5 }), null);
  assert.equal(normalizeRatings({ ...full, q1: 'abc' }), null);

  const missing = { ...full };
  delete missing.q2;
  assert.equal(normalizeRatings(missing), null);
  assert.equal(normalizeRatings(null), null);
  assert.equal(normalizeRatings([5, 5, 5, 5, 5]), null);
  assert.equal(FEEDBACK_CRITERIA.length, 10);
});

test('exam dates and times are validated and formatted for the hall ticket', () => {
  assert.equal(validDate('2026-12-01'), true);
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('01/12/2026'), false);
  assert.equal(validTime('13:15'), true);
  assert.equal(validTime('24:00'), false);
  assert.equal(validTime('9:5'), false);

  assert.equal(formatDateDmy('2026-12-01'), '01/12/2026');
  assert.equal(formatTime12('13:15'), '01:15 PM');
  assert.equal(formatTime12('00:05'), '12:05 AM');
  assert.equal(formatTime12('12:00:00'), '12:00 PM');
});

test('semester numbers are shown as roman numerals', () => {
  assert.deepEqual([1, 4, 5, 8].map(toRoman), ['I', 'IV', 'V', 'VIII']);
});

test('the hall ticket is generated as a PDF, with and without a photo', async () => {
  const input = {
    student: { student_code: 'STU000001', full_name: 'Test Student' },
    round: { program_name: 'Information Technology', exam_type: 'ESE', semester_number: 5 },
    subjects: Array.from({ length: 30 }, (_, index) => ({
      code: `R5IT3${String(index).padStart(3, '0')}T`,
      title: 'A subject with a reasonably long course title for wrapping',
      exam_date: '2026-12-01',
      start_time: '13:15',
      end_time: '16:15'
    })),
    photo: null
  };

  const pdf = await generateHallTicketPdf(input);

  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');

  const withBadPhoto = await generateHallTicketPdf({
    ...input,
    photo: Buffer.from('not an image')
  });

  assert.equal(withBadPhoto.subarray(0, 5).toString('ascii'), '%PDF-');
});
