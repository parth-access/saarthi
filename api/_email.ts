import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'Saarthi <contact@saarthilife.com>';
const ADMIN_EMAIL = 'healwithsaarthi@gmail.com';

interface EmailData {
  userName: string;
  userEmail: string;
  therapistName: string;
  date: string;
  time: string;
  sessionType?: string;
  message?: string;
}

/**
 * Send email when a booking is first created (pending)
 */
export async function sendBookingRequestEmail(data: EmailData) {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: data.userEmail,
      subject: 'Your session request has been received',
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; padding: 40px; border: 1px solid #f0f0f0; border-radius: 24px; color: #1a1a1a; background-color: #ffffff;">
          <h2 style="color: #5A5A40; font-size: 26px; font-weight: 500; margin-bottom: 24px;">Hello ${data.userName},</h2>
          <p style="font-size: 16px; line-height: 1.6; color: #444;">Thank you for reaching out to Saarthi. We have received your request for a <strong>${data.sessionType || 'session'}</strong> and our team is currently reviewing the availability.</p>
          
          <div style="background: #FDFCFB; padding: 32px; border-radius: 20px; margin: 32px 0; border: 1px solid #F5F2ED;">
            <p style="margin: 0 0 12px 0; color: #5A5A40; font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: bold;">Requested Details</p>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Specialist:</strong> ${data.therapistName}</p>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Date:</strong> ${data.date}</p>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Time:</strong> ${data.time}</p>
          </div>
          
          <p style="font-size: 16px; line-height: 1.6; color: #444;">We understand that taking this step requires courage. We will get back to you with a confirmation within 24 hours.</p>
          
          <div style="margin-top: 40px; padding-top: 24px; border-top: 1px solid #f0f0f0;">
            <p style="font-size: 14px; color: #888; margin: 0;">Warmly,</p>
            <p style="font-size: 15px; color: #5A5A40; font-weight: bold; margin: 4px 0 0 0;">Team Saarthi</p>
          </div>
        </div>
      `
    });
    console.log(`✅ Request email sent to ${data.userEmail}`);
  } catch (error) {
    console.error('❌ Failed to send request email:', error);
    // We don't throw here to ensure the booking creation doesn't fail
  }
}

/**
 * Send email when booking is approved/confirmed
 */
export async function sendBookingConfirmationEmail(data: EmailData) {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: data.userEmail,
      bcc: ADMIN_EMAIL,
      subject: 'Your session has been confirmed',
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; padding: 40px; border: 1px solid #f0f0f0; border-radius: 24px; color: #1a1a1a; background-color: #ffffff;">
          <h2 style="color: #4A6741; font-size: 26px; font-weight: 500; margin-bottom: 24px;">Session Confirmed</h2>
          <p style="font-size: 16px; line-height: 1.6; color: #444;">Hi ${data.userName}, we are pleased to inform you that your session has been confirmed. We look forward to supporting you on your journey.</p>
          
          <div style="background: #F4F7F2; padding: 32px; border-radius: 20px; margin: 32px 0; border: 1px solid #E8EDE6;">
            <p style="margin: 0 0 12px 0; color: #4A6741; font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: bold;">Confirmed Appointment</p>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Specialist:</strong> ${data.therapistName}</p>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Date:</strong> ${data.date}</p>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Time:</strong> ${data.time}</p>
            <p style="margin: 8px 0; font-size: 16px;"><strong>Platform:</strong> Online (Google Meet/Zoom link will be shared via calendar or separately)</p>
          </div>
          
          <p style="font-size: 16px; line-height: 1.6; color: #444;">Please ensure you are in a quiet, private space with a stable internet connection for the best experience.</p>
          
          <div style="margin-top: 40px; padding-top: 24px; border-top: 1px solid #f0f0f0;">
            <p style="font-size: 14px; color: #888; margin: 0;">With care,</p>
            <p style="font-size: 15px; color: #4A6741; font-weight: bold; margin: 4px 0 0 0;">Saarthi Support</p>
          </div>
        </div>
      `
    });
    console.log(`✅ Confirmation email sent to ${data.userEmail}`);
  } catch (error) {
    console.error('❌ Failed to send confirmation email:', error);
  }
}

/**
 * Send email when booking is rejected
 */
export async function sendBookingRejectionEmail(data: EmailData) {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: data.userEmail,
      subject: 'Update regarding your session request',
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; padding: 40px; border: 1px solid #f0f0f0; border-radius: 24px; color: #1a1a1a; background-color: #ffffff;">
          <h2 style="color: #721c24; font-size: 24px; font-weight: 500; margin-bottom: 24px;">Regarding your request</h2>
          <p style="font-size: 16px; line-height: 1.6; color: #444;">Hi ${data.userName}, thank you for your patience while we reviewed your session request.</p>
          <p style="font-size: 16px; line-height: 1.6; color: #444;">Unfortunately, we are unable to confirm the slot on <strong>${data.date} at ${data.time}</strong>. This might be due to a sudden scheduling conflict or the slot being filled just before your request reached us.</p>
          <p style="font-size: 16px; line-height: 1.6; color: #444;">We truly value your trust. Please feel free to select another available slot on our website or reply to this email for further assistance.</p>
          
          <div style="margin-top: 40px; padding-top: 24px; border-top: 1px solid #f0f0f0;">
            <p style="font-size: 14px; color: #888; margin: 0;">Be well,</p>
            <p style="font-size: 15px; color: #1a1a1a; font-weight: bold; margin: 4px 0 0 0;">Team Saarthi</p>
          </div>
        </div>
      `
    });
  } catch (error) {
    console.error('❌ Failed to send rejection email:', error);
  }
}
