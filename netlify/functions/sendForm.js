// Файл: netlify/functions/sendForm.js

const nodemailer = require('nodemailer');
// ИЗМЕНЕНИЕ №1: Для ясности переименуем переменную в соответствии с общепринятой практикой.
const busboy = require('busboy');

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  return new Promise((resolve, reject) => {
    // ИЗМЕНЕНИЕ №2 (ГЛАВНОЕ): Убрано слово `new`.
    const bb = busboy({ headers: event.headers });
    const fields = {};
    const files = [];

    bb.on('field', (fieldname, value) => {
      // Для отладки можно посмотреть, какие поля приходят
      // console.log(`Поле [${fieldname}]: value: ${value}`);
      fields[fieldname] = value;
    });

    bb.on('file', (fieldname, file, info) => {
      const { filename, encoding, mimeType } = info;
      let fileBuffer = Buffer.alloc(0);
      file.on('data', (data) => {
        fileBuffer = Buffer.concat([fileBuffer, data])
      });
      file.on('end', () => {
        files.push({ filename, content: fileBuffer, contentType: mimeType });
      });
    });

    bb.on('finish', async () => {
      try {
        const transporter = nodemailer.createTransport({
          // Ваша конфигурация для Gmail
          service: 'gmail',
          auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASS
          }
        });
        
        // Формируем красивое тело письма
        const emailBody = `
          <h2>Новая заявка на татуировку!</h2>
          <p><strong>Имя:</strong> ${fields.fullname || 'не указано'}</p>
          <p><strong>Email:</strong> ${fields.email || 'не указано'}</p>
          <p><strong>Телефон:</strong> ${fields.phone || 'не указано'}</p>
          <hr>
          <h3>Детали проекта:</h3>
          <p><strong>Описание идеи:</strong></p>
          <p>${fields['tattoo-description'] || 'нет описания'}</p>
          <p><strong>Желаемая дата:</strong> ${fields.appointmentDate || 'не выбрана'}</p>
          <p><strong>Выбранные места и размеры:</strong></p>
          <p>${fields.bodySpaces || 'не указаны'}</p>
          <hr>
          <p><i>Файлы-референсы прикреплены к этому письму.</i></p>
        `;

        // === Письмо для студии ===
        await transporter.sendMail({
          from: `"Форма с сайта" <${process.env.GMAIL_USER}>`,
          to: 'antonfilonenko95@gmail.com', // ← Замените на вашу почту
          subject: `🖋 Новая заявка на тату от ${fields.fullname}`,
          html: emailBody,
          attachments: files
        });

        // === Письмо для клиента (опционально, но очень хорошо для сервиса) ===
        if (fields.email) {
            await transporter.sendMail({
              from: `"Ваша Тату-Студия" <${process.env.GMAIL_USER}>`,
              to: fields.email,
              subject: '🎉 Ваша заявка на тату принята!',
              html: `
                <p>Привет, ${fields.fullname}!</p>
                <p>Спасибо за вашу заявку. Мы получили все детали и свяжемся с вами в ближайшее время для подтверждения сеанса.</p>
                <p>С уважением,<br>Ваша Тату-Студия</p>
              `
            });
        }

        resolve({ statusCode: 200, body: JSON.stringify({ message: "Письма успешно отправлены" }) });

      } catch (error) {
        console.error('Ошибка отправки:', error);
        resolve({ statusCode: 500, body: JSON.stringify({ error: error.message }) });
      }
    });

    bb.on('error', err => {
        console.error('Ошибка Busboy:', err);
        resolve({ statusCode: 500, body: JSON.stringify({ error: 'Ошибка при обработке формы.' }) });
    });

    // Важно правильно передать тело запроса в busboy
    bb.end(Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf-8'));
  });
};