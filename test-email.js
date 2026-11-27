require('dotenv').config();
const createOrderEmailService = require('./order-emails');

const emailService = createOrderEmailService();

if (!emailService.isConfigured) {
  console.error(
    'Set SMTP_HOST, SMTP_USER, SMTP_PASS, and ADMIN_EMAIL in .env before testing email.',
  );
  process.exitCode = 1;
} else {
  emailService
    .sendTestEmail()
    .then(() => console.log('Test email sent to the configured admin inbox.'))
    .catch((error) => {
      console.error(
        `SMTP test failed (${error.code || 'error'}): ${error.message}`,
      );
      process.exitCode = 1;
    });
}
