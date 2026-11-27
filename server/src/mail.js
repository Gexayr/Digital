// Optional email (password reset links). Configure SMTP_URL, e.g.
//   SMTP_URL=smtps://user:pass@smtp.example.com:465   MAIL_FROM="Vellum <no-reply@example.com>"
// Without it the app still works: admins can create reset links from the admin panel.
import nodemailer from 'nodemailer';

export function createMailer({ url, from } = {}) {
  if (!url) return { enabled: false, send: async () => false };
  const transport = nodemailer.createTransport(url);
  return {
    enabled: true,
    async send({ to, subject, text }) {
      try {
        await transport.sendMail({ from: from || 'Vellum <no-reply@localhost>', to, subject, text });
        return true;
      } catch (e) {
        console.error('mail failed:', e.message);
        return false;
      }
    },
  };
}
