const nodemailer = require('nodemailer');
const Busboy = require('busboy');

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  return new Promise((resolve, reject) => {
    const busboy = new Busboy({ headers: event.headers });
    const fields = {};
    const files = [];

    busboy.on('field', (fieldname, value) => {
      fields[fieldname] = value;
    });

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
      let fileBuffer = Buffer.alloc(0);
      file.on('data', (data) => fileBuffer = Buffer.concat([fileBuffer, data]));
      file.on('end', () => {
        files.push({ filename, content: fileBuffer, contentType: mimetype });
      });
    });

    busboy.on('finish', async () => {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASS
          }
        });

        // === Email to Studio ===
        await transporter.sendMail({
          from: process.env.GMAIL_USER,
          to: 'tattoo-studio@example.com', // ← Замени на почту студии
          subject: '🖋 Новая заявка на тату',
          text: `
Имя: ${fields.fullname}
Email: ${fields.email}
Телефон: ${fields.phone}
Комментарий: ${fields.additional}
Дата записи: ${fields.appointmentDate}
          `,
          attachments: files
        });

        // === Email to User ===
        await transporter.sendMail({
          from: process.env.GMAIL_USER,
          to: fields.email,
          subject: '🎉 Ваша заявка принята!',
          text: `Спасибо за заявку, ${fields.fullname}!
Мы свяжемся с вами в ближайшее время.

Дата записи: ${fields.appointmentDate}

С уважением,
Tattoo Studio`
        });

        resolve({ statusCode: 200, body: JSON.stringify({ ok: true }) });

      } catch (error) {
        console.error('Ошибка отправки:', error);
        resolve({ statusCode: 500, body: JSON.stringify({ error: error.message }) });
      }
    });

    busboy.end(Buffer.from(event.body, 'base64'));
  });
};
