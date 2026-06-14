const nodemailer = require('nodemailer');

const sendEmail = async ({ to, subject, html }) => {
  console.log('=== EMAIL DEBUG ===');
  console.log('HOST:', process.env.EMAIL_HOST);
  console.log('PORT:', process.env.EMAIL_PORT);
  console.log('USER:', process.env.EMAIL_USER);
  console.log('PASS exists:', !!process.env.EMAIL_PASS);
  console.log('TO:', to);

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    family: 4,
    tls: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('Verifying transporter...');
    await transporter.verify();
    console.log('Transporter verified! Sending email...');

    const info = await transporter.sendMail({
      from: `"UTG Attendance System" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    });

    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Email error:', error.message);
    console.error('Full error:', JSON.stringify(error, null, 2));
    throw error;
  }
};

module.exports = sendEmail;