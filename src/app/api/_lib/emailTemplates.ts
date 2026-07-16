export interface BookingEmailData {
  patientName: string;
  therapistName: string;
  therapistSpecialization?: string;
  sessionMode?: string;
  date: string;
  time: string;
  phone?: string;
  bookingToken?: string;
}

const COLORS = {
  background: '#F7F4E8',
  cardBackground: '#FFFFFF',
  text: '#2D3748',
  textMuted: '#718096',
  accent: '#2F855A',
  border: '#E2E8F0'
};

function generateEmailLayout(content: string, previewText: string = ''): string {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Saarthi</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: ${COLORS.background}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: ${COLORS.text}; font-size: 16px; line-height: 1.6; -webkit-font-smoothing: antialiased;">
    ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;">${previewText}</div>` : ''}
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: ${COLORS.background}; padding: 40px 20px;">
      <tr>
        <td align="center">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="width: 100%; max-width: 600px; background-color: ${COLORS.cardBackground}; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
            <tr>
              <td style="padding: 40px;">
                <div style="text-align: center; margin-bottom: 32px;">
                  <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: ${COLORS.accent}; letter-spacing: -0.5px;">Saarthi</h1>
                  <p style="margin: 4px 0 0 0; font-size: 14px; color: ${COLORS.textMuted}; font-style: italic;">A Path Forward</p>
                </div>

                ${content}

              </td>
            </tr>
          </table>

          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="width: 100%; max-width: 600px; margin-top: 24px;">
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
    
    <div style="margin: 0 0 32px 0;">
      <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: ${COLORS.text};">What Happens Next?</h3>
      <ul style="margin: 0; padding-left: 20px; color: ${COLORS.text}; line-height: 1.8;">
        <li style="margin-bottom: 8px;">Your therapist will review your request.</li>
        <li style="margin-bottom: 8px;">We will notify you once your session is confirmed.</li>
        <li>Session instructions will be shared before your appointment.</li>
      </ul>
    </div>
    
    <div style="background-color: #F8FAFC; border: 1px solid ${COLORS.border}; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
      <h3 style="margin: 0 0 16px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: ${COLORS.textMuted};">Session Details</h3>
      
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Therapist:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px;">${data.therapistName}</td>
        </tr>
        ${data.therapistSpecialization ? `
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Specialization:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px;">${data.therapistSpecialization}</td>
        </tr>
        ` : ''}
        ${data.sessionMode ? `
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Session Mode:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px;">${data.sessionMode}</td>
        </tr>
        ` : ''}
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Date:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px;">${data.date}</td>
        </tr>
        <tr>
          <td width="140" style="color: ${COLORS.textMuted}; font-size: 15px;">Time:</td>
          <td style="font-weight: 500; font-size: 15px;">${data.time}</td>
        </tr>
      </table>
    </div>

    <p style="margin: 0 0 32px 0;">You do not need to take any further action right now. We will be in touch soon.</p>

    <p style="margin: 0 0 4px 0; font-size: 15px;">Warmly,</p>
    <p style="margin: 0; font-weight: 500; font-size: 15px; color: ${COLORS.accent};">The Saarthi Team</p>
  `;

  return generateEmailLayout(content, 'Your Saarthi booking request has been received.');
}

export function generateBookingConfirmedEmail(data: BookingEmailData): string {
  const content = `
    <h2 style="margin: 0 0 24px 0; font-size: 20px; font-weight: 600; color: ${COLORS.text};">Hi ${data.patientName},</h2>
    <p style="margin: 0 0 24px 0;">We are pleased to let you know that your session with <strong>${data.therapistName}</strong> has been officially confirmed.</p>
    
    <div style="background-color: #F0FFF4; border: 1px solid #C6F6D5; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
      <h3 style="margin: 0 0 16px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #276749;">Confirmed Details</h3>
      
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td width="140" style="padding-bottom: 12px; color: #2F855A; font-size: 15px;">Therapist:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px; color: #22543D;">${data.therapistName}</td>
        </tr>
        ${data.sessionMode ? `
        <tr>
          <td width="140" style="padding-bottom: 12px; color: #2F855A; font-size: 15px;">Session Mode:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px; color: #22543D;">${data.sessionMode}</td>
        </tr>
        ` : ''}
        <tr>
          <td width="140" style="padding-bottom: 12px; color: #2F855A; font-size: 15px;">Date:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px; color: #22543D;">${data.date}</td>
        </tr>
        <tr>
          <td width="140" style="color: #2F855A; font-size: 15px;">Time:</td>
          <td style="font-weight: 500; font-size: 15px; color: #22543D;">${data.time}</td>
        </tr>
      </table>
    </div>

    <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: ${COLORS.text};">Preparing For Your Session</h3>
    <ul style="margin: 0 0 32px 0; padding-left: 20px; color: ${COLORS.text}; line-height: 1.8;">
      <li style="margin-bottom: 8px;">Join 5 minutes early.</li>
      <li style="margin-bottom: 8px;">Sit in a quiet and private environment.</li>
      <li style="margin-bottom: 8px;">Keep water or notes nearby if you'd like.</li>
      <li>You may reschedule if needed.</li>
    </ul>

    ${data.bookingToken ? `
    <div style="text-align: center; margin-bottom: 32px;">
      <a href="${process.env.APP_URL || 'https://saarthilife.com'}/manage-booking?token=${data.bookingToken}" style="display: inline-block; padding: 14px 28px; background-color: ${COLORS.accent}; color: #FFFFFF; font-weight: 500; font-size: 15px; text-decoration: none; border-radius: 8px;">Manage Booking</a>
    </div>
    ` : ''}

    <p style="margin: 0 0 4px 0; font-size: 15px;">Warmly,</p>
    <p style="margin: 0; font-weight: 500; font-size: 15px; color: ${COLORS.accent};">The Saarthi Team</p>
  `;

  return generateEmailLayout(content, 'Your Saarthi session is confirmed.');
}

export function generateBookingRescheduledEmail(data: BookingEmailData, originalDate: string, originalTime: string): string {
  const content = `
    <h2 style="margin: 0 0 24px 0; font-size: 20px; font-weight: 600; color: ${COLORS.text};">Hi ${data.patientName},</h2>
    <p style="margin: 0 0 24px 0;">Your session with <strong>${data.therapistName}</strong> has been successfully rescheduled.</p>
    
    <div style="background-color: #F8FAFC; border: 1px solid ${COLORS.border}; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
      <h3 style="margin: 0 0 16px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: ${COLORS.textMuted};">Updated Session Details</h3>
      
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Therapist:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px;">${data.therapistName}</td>
        </tr>
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;"><strong>New Date:</strong></td>
          <td style="padding-bottom: 12px; font-weight: 600; font-size: 15px;">${data.date}</td>
        </tr>
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;"><strong>New Time:</strong></td>
          <td style="padding-bottom: 12px; font-weight: 600; font-size: 15px;">${data.time}</td>
        </tr>
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px; text-decoration: line-through;">Old Date:</td>
          <td style="padding-bottom: 12px; font-weight: 400; font-size: 15px; color: ${COLORS.textMuted}; text-decoration: line-through;">${originalDate}</td>
        </tr>
        <tr>
          <td width="140" style="color: ${COLORS.textMuted}; font-size: 15px; text-decoration: line-through;">Old Time:</td>
          <td style="font-weight: 400; font-size: 15px; color: ${COLORS.textMuted}; text-decoration: line-through;">${originalTime}</td>
        </tr>
      </table>
    </div>

    ${data.bookingToken ? `
    <div style="text-align: center; margin-bottom: 32px;">
      <a href="${process.env.APP_URL || 'https://saarthilife.com'}/manage-booking?token=${data.bookingToken}" style="display: inline-block; padding: 14px 28px; background-color: #EDF2F7; color: ${COLORS.text}; font-weight: 500; font-size: 15px; text-decoration: none; border-radius: 8px;">Manage Booking</a>
    </div>
    ` : ''}

    <p style="margin: 0 0 4px 0; font-size: 15px;">Warmly,</p>
    <p style="margin: 0; font-weight: 500; font-size: 15px; color: ${COLORS.accent};">The Saarthi Team</p>
  `;

  return generateEmailLayout(content, 'Your Saarthi session has been rescheduled.');
}

export function generatePaymentLinkEmail(data: BookingEmailData): string {
  const content = `
    <h2 style="margin: 0 0 24px 0; font-size: 20px; font-weight: 600; color: ${COLORS.text};">Hi ${data.patientName},</h2>
    <p style="margin: 0 0 16px 0;">Your session request with <strong>${data.therapistName}</strong> has been received! To confirm your appointment, please complete the payment using the secure link below.</p>
    
    <div style="background-color: #F8FAFC; border: 1px solid ${COLORS.border}; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
      <h3 style="margin: 0 0 16px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: ${COLORS.textMuted};">Session Details</h3>
      
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Therapist:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px;">${data.therapistName}</td>
        </tr>
        ${data.therapistSpecialization ? `
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Specialization:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px;">${data.therapistSpecialization}</td>
        </tr>
        ` : ''}
        ${data.sessionMode ? `
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Session Mode:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px;">${data.sessionMode}</td>
        </tr>
        ` : ''}
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Date:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px;">${data.date}</td>
        </tr>
        <tr>
          <td width="140" style="color: ${COLORS.textMuted}; font-size: 15px;">Time:</td>
          <td style="font-weight: 500; font-size: 15px;">${data.time}</td>
        </tr>
      </table>
    </div>

    <div style="text-align: center; margin-bottom: 32px;">
      <a href="${process.env.APP_URL || 'https://saarthilife.com'}/payment?token=${data.bookingToken}" style="display: inline-block; padding: 14px 28px; background-color: ${COLORS.accent}; color: #FFFFFF; font-weight: 500; font-size: 15px; text-decoration: none; border-radius: 8px;">Complete Payment</a>
    </div>

    <p style="margin: 0 0 4px 0; font-size: 15px;">Warmly,</p>
    <p style="margin: 0; font-weight: 500; font-size: 15px; color: ${COLORS.accent};">The Saarthi Team</p>
  `;

  return generateEmailLayout(content, 'Please complete payment to confirm your Saarthi session.');
}

export function generateTherapistNotificationEmail(data: BookingEmailData, type: 'new' | 'rescheduled', originalDate?: string, originalTime?: string): string {
  const content = `
    <h2 style="margin: 0 0 24px 0; font-size: 20px; font-weight: 600; color: ${COLORS.text};">Hi ${data.therapistName},</h2>
    <p style="margin: 0 0 24px 0;">
      You have a <strong>${type === 'new' ? 'new booking request' : 'rescheduled session'}</strong> from ${data.patientName}.
    </p>
    
    <div style="background-color: #F8FAFC; border: 1px solid ${COLORS.border}; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
      <h3 style="margin: 0 0 16px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: ${COLORS.textMuted};">Patient Details</h3>
      
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Patient Name:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px;">${data.patientName}</td>
        </tr>
        ${data.phone ? `
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Phone:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px;">${data.phone}</td>
        </tr>
        ` : ''}
        ${data.sessionMode ? `
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Session Mode:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px;">${data.sessionMode}</td>
        </tr>
        ` : ''}
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Date:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px;">${data.date}</td>
        </tr>
        <tr>
          <td width="140" style="color: ${COLORS.textMuted}; font-size: 15px;">Time:</td>
          <td style="font-weight: 500; font-size: 15px;">${data.time}</td>
        </tr>
        ${type === 'rescheduled' && originalDate && originalTime ? `
        <tr>
          <td width="140" style="padding-top: 12px; color: ${COLORS.textMuted}; font-size: 15px; text-decoration: line-through;">Old Date:</td>
          <td style="padding-top: 12px; font-weight: 400; font-size: 15px; color: ${COLORS.textMuted}; text-decoration: line-through;">${originalDate}</td>
        </tr>
        <tr>
          <td width="140" style="padding-top: 12px; color: ${COLORS.textMuted}; font-size: 15px; text-decoration: line-through;">Old Time:</td>
          <td style="padding-top: 12px; font-weight: 400; font-size: 15px; color: ${COLORS.textMuted}; text-decoration: line-through;">${originalTime}</td>
        </tr>
        ` : ''}
      </table>
    </div>

    <div style="text-align: center; margin-bottom: 32px;">
      <a href="${process.env.APP_URL || 'https://saarthilife.com'}/admin" style="display: inline-block; padding: 14px 28px; background-color: ${COLORS.accent}; color: #FFFFFF; font-weight: 500; font-size: 15px; text-decoration: none; border-radius: 8px;">View Dashboard</a>
    </div>

  `;

  return generateEmailLayout(content, type === 'new' ? 'New booking request received.' : 'A session has been rescheduled.');
}
