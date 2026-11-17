import { readFileSync, existsSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import { formatDateDmy, formatTime12, toRoman } from './feedback-config.js';

const emblemPath = new URL('../assets/vjti-emblem.png', import.meta.url);

function loadEmblem() {
  return existsSync(emblemPath) ? readFileSync(emblemPath) : null;
}

// Builds the examination admit card as a PDF buffer.
//   student  { student_code, full_name }
//   round    { program_name, exam_type, semester_number }
//   subjects [{ code, title, exam_date, start_time, end_time }]
//   photo    image buffer (JPEG or PNG) or null
export function generateHallTicketPdf({ student, round, subjects, photo }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const left = 40;
      const right = doc.page.width - 40;
      const width = right - left;

      // Header: emblem and institute name.
      const emblem = loadEmblem();
      let textLeft = left + 90;

      if (emblem) {
        doc.image(emblem, left + 70, 36, { height: 78 });
        textLeft = left + 70 + 58 + 14;
      }

      doc.font('Helvetica-Bold').fontSize(24).fillColor('#000')
        .text('Veermata Jijabai', textLeft, 42, { lineBreak: false });
      doc.text('Technological Institute', textLeft, 68, { lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(9)
        .text('(An Autonomous Institute of Government of Maharashtra)', textLeft, 98, {
          lineBreak: false
        });

      doc.moveTo(left, 128).lineTo(right, 128).lineWidth(1).stroke('#000');

      doc.font('Helvetica-Bold').fontSize(13)
        .text('EXAMINATION ADMIT CARD', left, 148, { width, align: 'center' });

      // Candidate details.
      const detailsTop = 200;
      const rows = [
        ['REG.NO', student.student_code || ''],
        ['STUDENT NAME', String(student.full_name || '').toUpperCase()],
        ['DEGREE/BRANCH', `Bachelor of Technology/${round.program_name}`],
        ['SEMESTER', toRoman(round.semester_number)],
        ['EXAM NAME', round.exam_type]
      ];

      rows.forEach(([label, value], index) => {
        const y = detailsTop + index * 19;
        doc.font('Helvetica-Bold').fontSize(10).text(label, left + 10, y, {
          width: 120,
          lineBreak: false
        });
        doc.text(':', left + 130, y, { lineBreak: false });
        doc.font('Helvetica').text(value, left + 146, y, {
          width: 290,
          lineBreak: false
        });
      });

      // Photo box.
      const photoX = right - 106;
      const photoY = 190;
      doc.rect(photoX, photoY, 106, 130).lineWidth(0.8).stroke('#000');

      if (photo) {
        try {
          doc.image(photo, photoX + 3, photoY + 3, {
            fit: [100, 124],
            align: 'center',
            valign: 'center'
          });
        } catch {
          // Unsupported image data: leave the frame empty.
        }
      } else {
        doc.font('Helvetica').fontSize(8).fillColor('#666')
          .text('Photo', photoX, photoY + 60, { width: 106, align: 'center' })
          .fillColor('#000');
      }

      // Subject table.
      const columns = [
        { title: 'Course Code & Course Title', width: 230 },
        { title: 'Exam Date', width: 66 },
        { title: 'Time', width: 106 },
        { title: "Invigilator's Sign", width: width - 402 }
      ];
      const rowHeight = 28;
      let y = 350;

      const drawRow = (cells, header) => {
        let x = left;

        doc.rect(left, y, width, rowHeight).lineWidth(0.8).stroke('#000');

        cells.forEach((cell, index) => {
          if (index > 0) {
            doc.moveTo(x, y).lineTo(x, y + rowHeight).stroke('#000');
          }

          doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 9 : 8.5)
            .text(cell, x + 6, y + (rowHeight - 10) / 2, {
              width: columns[index].width - 12,
              height: 12,
              ellipsis: true,
              lineBreak: false,
              align: header ? 'center' : 'left'
            });

          x += columns[index].width;
        });

        y += rowHeight;
      };

      drawRow(columns.map(column => column.title), true);

      const ordered = [...subjects].sort((a, b) =>
        `${a.exam_date}${a.start_time}`.localeCompare(`${b.exam_date}${b.start_time}`)
      );

      for (const subject of ordered) {
        if (y + rowHeight > doc.page.height - 100) {
          doc.addPage();
          y = 50;
          drawRow(columns.map(column => column.title), true);
        }

        drawRow([
          `${subject.code}-${subject.title}`,
          formatDateDmy(subject.exam_date),
          `${formatTime12(subject.start_time)} TO ${formatTime12(subject.end_time)}`,
          ''
        ], false);
      }

      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#000')
        .text("[Candidate's Signature]", left, doc.page.height - 80, {
          width: width - 10,
          align: 'right',
          lineBreak: false
        });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
