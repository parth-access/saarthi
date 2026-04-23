import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'Saarthi <contact@saarthilife.com>';
const ADMIN_EMAIL = 'healwithsaarthi@gmail.com';

interface EmailParams {
  userName: string;
  userEmail: string;
  therapistName: string;
  date: string;
  time: string;
  sessionType?: string;
}

export const emailService = {
  async sendBookingRequest(params: EmailParams) {
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: params.userEmail,
        subject: 'Your session request has been received',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 40px; border: 1px solid #f0f0f0; border-radius: 20px;">
            <h2 style="color: #5A5A40;">Hello ${params.userName},</h2>
            <p>Thank you for reaching out to Saarthi. We have received your request for a ${params.sessionType || 'session'}.</p>
            <div style="background: #fdf6e7; padding: 20px; border-radius: 15px; margin: 20px 0;">
              <p><strong>Specialist:</strong> ${params.therapistName}</p>
              <p><strong>Date:</strong> ${params.date}</p>
              <p><strong>Time:</strong> ${params.time}</p>
            </div>
            <p>We will get back to you with a confirmation within 24 hours.</p>
            <p>Warmly,<br/><strong>Team Saarthi</strong></p>
          </div>
        `
      });
    } catch (error) {
      console.error('Email failed:', error);
    }
  },

  async sendBookingConfirmation(params: EmailParams) {
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: params.userEmail,
        bcc: ADMIN_EMAIL,
        subject: 'Your session has been confirmed',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 40px; border: 1px solid #f0f0f0; border-radius: 20px;">
            <h2 style="color: #4A6741;">Session Confirmed</h2>
            <p>Hi ${params.userName}, your session has been confirmed.</p>
            <div style="background: #F4F7F2; padding: 20px; border-radius: 15px; margin: 20px 0;">
              <p><strong>Specialist:</strong> ${params.therapistName}</p>
              <p><strong>Date:</strong> ${params.date}</p>
              <p><strong>Time:</strong> ${params.time}</p>
            </div>
            <p>Please ensure you are in a quiet space for the session.</p>
            <p>With care,<br/><strong>Saarthi Support</strong></p>
          </div>
        `
      });
    } catch (error) {
      console.error('Email failed:', error);
    }
  },

  async sendBookingRejection(params: EmailParams) {
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: params.userEmail,
        subject: 'Update regarding your session request',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 40px; border: 1px solid #f0f0f0; border-radius: 24px;">
            <h2 style="color: #721c24;">Regarding your request</h2>
            <p>Hi ${params.userName}, we are unable to confirm the slot on ${params.date} at ${params.time}.</p>
            <p>Please feel free to select another available slot on our website.</p>
            <p>Be well,<br/><strong>Team Saarthi</strong></p>
          </div>
        `
      });
    } catch (error) {
      console.error('Email failed:', error);
    }
  }
};
