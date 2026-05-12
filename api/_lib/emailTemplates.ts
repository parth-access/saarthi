export interface BookingEmailData {
  patientName: string;
  therapistName: string;
  date: string;
  time: string;
  phone: string;
}

const COLORS = {
  background: '#F7F4E8',
  cardBackground: '#FFFFFF',
  text: '#2D3748',
  textMuted: '#718096',
  accent: '#2F855A',
  border: '#E2E8F0'
};

function generateEmailLayout(content: string): string {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Saarthi</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: ${COLORS.background}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: ${COLORS.text}; font-size: 16px; line-height: 1.6; -webkit-font-smoothing: antialiased;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: ${COLORS.background}; padding: 40px 20px;">
      <tr>
        <td align="center">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: ${COLORS.cardBackground}; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
            <tr>
              <td style="padding: 40px;">
                <!-- Logo / Header -->
                <div style="text-align: center; margin-bottom: 32px;">
                  <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: ${COLORS.accent}; letter-spacing: -0.5px;">Saarthi</h1>
                  <p style="margin: 4px 0 0 0; font-size: 14px; color: ${COLORS.textMuted}; font-style: italic;">A Path Forward</p>
                </div>

                ${content}

              </td>
            </tr>
          </table>

          <!-- Footer -->
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin-top: 24px;">
            <tr>
              <td style="text-align: center; padding: 0 20px;">
                 <p style="margin: 0 0 16px 0; font-size: 13px; color: ${COLORS.textMuted};">
                   <strong>Please note:</strong> Saarthi is not an emergency psychiatric service. If you are in immediate danger, distress, or experiencing a crisis, please contact your local emergency services or a crisis helpline immediately.
                 </p>
                 <p style="margin: 0; font-size: 12px; color: #A0AEC0;">
                   &copy; ${new Date().getFullYear()} Saarthi. All rights reserved.
                 </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

export function generateBookingReceivedEmail(data: BookingEmailData): string {
  const content = `
    <h2 style="margin: 0 0 24px 0; font-size: 20px; font-weight: 600; color: ${COLORS.text};">Hi ${data.patientName},</h2>
    <p style="margin: 0 0 16px 0;">Thank you for taking this step. This email is to confirm that we have received your booking request for a session with <strong>${data.therapistName}</strong>.</p>
    <p style="margin: 0 0 24px 0;">Your mental health is important, and we appreciate you letting us be part of your journey. Your therapist will review the request, and we will notify you shortly once the session is confirmed.</p>
    
    <div style="background-color: #F8FAFC; border: 1px solid ${COLORS.border}; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
      <h3 style="margin: 0 0 16px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: ${COLORS.textMuted};">Session Details</h3>
      
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td width="100" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Date:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px;">${data.date}</td>
        </tr>
        <tr>
          <td width="100" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Time:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px;">${data.time}</td>
        </tr>
        <tr>
          <td width="100" style="color: ${COLORS.textMuted}; font-size: 15px;">Phone:</td>
          <td style="font-weight: 500; font-size: 15px;">${data.phone}</td>
        </tr>
      </table>
    </div>

    <p style="margin: 0 0 4px 0; font-size: 15px;">Warmly,</p>
    <p style="margin: 0; font-weight: 500; font-size: 15px; color: ${COLORS.accent};">The Saarthi Team</p>
  `;

  return generateEmailLayout(content);
}

export function generateBookingConfirmedEmail(data: BookingEmailData): string {
  const content = `
    <h2 style="margin: 0 0 24px 0; font-size: 20px; font-weight: 600; color: ${COLORS.text};">Hi ${data.patientName},</h2>
    <p style="margin: 0 0 24px 0;">We are pleased to let you know that your session with <strong>${data.therapistName}</strong> has been officially confirmed.</p>
    
    <div style="background-color: #F0FFF4; border: 1px solid #C6F6D5; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <h3 style="margin: 0 0 16px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #276749;">Confirmed Details</h3>
      
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td width="100" style="padding-bottom: 12px; color: #2F855A; font-size: 15px;">Date:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px; color: #22543D;">${data.date}</td>
        </tr>
        <tr>
          <td width="100" style="padding-bottom: 12px; color: #2F855A; font-size: 15px;">Time:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px; color: #22543D;">${data.time}</td>
        </tr>
        <tr>
          <td width="100" style="color: #2F855A; font-size: 15px;">Phone:</td>
          <td style="font-weight: 500; font-size: 15px; color: #22543D;">${data.phone}</td>
        </tr>
      </table>
    </div>

    <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: ${COLORS.text};">Next Steps</h3>
    <p style="margin: 0 0 32px 0;">Your therapist will be ready to begin at the scheduled time. Please find a quiet, comfortable space where you feel safe to talk. If you need to make any changes to this appointment, please contact us.</p>

    <p style="margin: 0 0 4px 0; font-size: 15px;">Warmly,</p>
    <p style="margin: 0; font-weight: 500; font-size: 15px; color: ${COLORS.accent};">The Saarthi Team</p>
  `;

  return generateEmailLayout(content);
}
