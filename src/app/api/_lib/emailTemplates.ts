import { SESSION_DURATION_MINUTES } from '@/shared/constants';

export interface BookingEmailData {
  patientName: string;
  therapistName: string;
  therapistSpecialization?: string;
  sessionMode?: string;
  date: string;
  time: string;
  phone?: string;
  bookingToken?: string;
  meetingUrl?: string;
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

    ${data.meetingUrl ? `
    <div style="text-align: center; margin-bottom: 32px;">
      <a href="${data.meetingUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 32px; background-color: ${COLORS.accent}; color: #FFFFFF; font-weight: 600; font-size: 16px; text-decoration: none; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Join Google Meet</a>
      <p style="margin: 12px 0 0 0; font-size: 13px; color: ${COLORS.textMuted};">
        Meeting link: <a href="${data.meetingUrl}" style="color: ${COLORS.accent}; word-break: break-all;">${data.meetingUrl}</a>
      </p>
    </div>
    ` : ''}

    ${data.bookingToken ? `
    <div style="text-align: center; margin-bottom: 32px;">
      <a href="${process.env.APP_URL || 'https://www.saarthilife.com'}/manage-booking?token=${data.bookingToken}" style="display: inline-block; padding: 14px 28px; background-color: ${COLORS.accent}; color: #FFFFFF; font-weight: 500; font-size: 15px; text-decoration: none; border-radius: 8px;">Manage Booking</a>
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
      <a href="${process.env.APP_URL || 'https://www.saarthilife.com'}/manage-booking?token=${data.bookingToken}" style="display: inline-block; padding: 14px 28px; background-color: #EDF2F7; color: ${COLORS.text}; font-weight: 500; font-size: 15px; text-decoration: none; border-radius: 8px;">Manage Booking</a>
    </div>
    ` : ''}

    <p style="margin: 0 0 4px 0; font-size: 15px;">Warmly,</p>
    <p style="margin: 0; font-weight: 500; font-size: 15px; color: ${COLORS.accent};">The Saarthi Team</p>
  `;

  return generateEmailLayout(content, 'Your Saarthi session has been rescheduled.');
}


export interface PaymentReceiptEmailData {
  patientName: string;
  therapistName: string;
  amount: number;
  currency: string;
  orderId: string;
  paymentId: string;
  sessionDate: string;
  sessionTime: string;
  paidAt?: string;
  bookingToken?: string;
}

export interface PaymentFailedEmailData {
  patientName: string;
  therapistName: string;
  orderId?: string;
  paymentId?: string;
  amount?: number;
  currency?: string;
  sessionDate: string;
  sessionTime: string;
  failureReason?: string;
}

export function generatePaymentReceiptEmail(data: PaymentReceiptEmailData): string {
  const formattedAmount = `₹${data.amount.toLocaleString('en-IN')}`;
  const content = `
    <h2 style="margin: 0 0 24px 0; font-size: 20px; font-weight: 600; color: ${COLORS.text};">Hi ${data.patientName},</h2>
    <p style="margin: 0 0 24px 0;">Thank you for your payment. Your session with <strong>${data.therapistName}</strong> has been paid in full and your receipt is below.</p>
    
    <div style="background-color: #F8FAFC; border: 1px solid ${COLORS.border}; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
      <h3 style="margin: 0 0 16px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: ${COLORS.textMuted};">Payment Receipt</h3>
      
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td width="160" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Amount Paid:</td>
          <td style="padding-bottom: 12px; font-weight: 700; font-size: 18px; color: ${COLORS.accent};">${formattedAmount}</td>
        </tr>
        <tr>
          <td width="160" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Payment ID:</td>
          <td style="padding-bottom: 12px; font-family: monospace; font-size: 14px; color: ${COLORS.text};">${data.paymentId}</td>
        </tr>
        <tr>
          <td width="160" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Order ID:</td>
          <td style="padding-bottom: 12px; font-family: monospace; font-size: 14px; color: ${COLORS.text};">${data.orderId}</td>
        </tr>
        <tr>
          <td width="160" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Therapist:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px;">${data.therapistName}</td>
        </tr>
        <tr>
          <td width="160" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Session Date & Time:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px;">${data.sessionDate} at ${data.sessionTime} (IST)</td>
        </tr>
        ${data.paidAt ? `
        <tr>
          <td width="160" style="color: ${COLORS.textMuted}; font-size: 15px;">Date of Payment:</td>
          <td style="font-weight: 500; font-size: 15px;">${data.paidAt}</td>
        </tr>
        ` : ''}
      </table>
    </div>

    ${data.bookingToken ? `
    <div style="text-align: center; margin-bottom: 32px;">
      <a href="${process.env.APP_URL || 'https://www.saarthilife.com'}/manage-booking?token=${data.bookingToken}" style="display: inline-block; padding: 14px 28px; background-color: ${COLORS.accent}; color: #FFFFFF; font-weight: 500; font-size: 15px; text-decoration: none; border-radius: 8px;">View Booking Details</a>
    </div>
    ` : ''}

    <p style="margin: 0 0 4px 0; font-size: 15px;">Warmly,</p>
    <p style="margin: 0; font-weight: 500; font-size: 15px; color: ${COLORS.accent};">The Saarthi Team</p>
  `;

  return generateEmailLayout(content, 'Payment Receipt for your Saarthi session.');
}

export function generateBookingSlotReleasedEmail(data: BookingEmailData, reason?: string): string {
  const content = `
    <h2 style="margin: 0 0 24px 0; font-size: 20px; font-weight: 600; color: ${COLORS.text};">Hi ${data.patientName},</h2>
    <p style="margin: 0 0 24px 0;">We wanted to let you know that your tentative slot reservation with <strong>${data.therapistName}</strong> was not completed and the slot has been released.</p>
    
    <div style="background-color: #FFFBEB; border: 1px solid #FCD34D; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
      <h3 style="margin: 0 0 16px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #92400E;">Slot Information</h3>
      
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td width="140" style="padding-bottom: 12px; color: #92400E; font-size: 15px;">Therapist:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px; color: #78350F;">${data.therapistName}</td>
        </tr>
        <tr>
          <td width="140" style="padding-bottom: 12px; color: #92400E; font-size: 15px;">Requested Date:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px; color: #78350F;">${data.date}</td>
        </tr>
        <tr>
          <td width="140" style="padding-bottom: 12px; color: #92400E; font-size: 15px;">Requested Time:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px; color: #78350F;">${data.time} (IST)</td>
        </tr>
        ${reason ? `
        <tr>
          <td width="140" style="color: #92400E; font-size: 15px;">Reason:</td>
          <td style="font-weight: 500; font-size: 15px; color: #78350F;">${reason}</td>
        </tr>
        ` : ''}
      </table>
    </div>

    <p style="margin: 0 0 24px 0;">No session has been booked. You are welcome to browse our calendar at any time to pick a convenient slot.</p>

    <div style="text-align: center; margin-bottom: 32px;">
      <a href="${process.env.APP_URL || 'https://www.saarthilife.com'}/book" style="display: inline-block; padding: 14px 28px; background-color: ${COLORS.accent}; color: #FFFFFF; font-weight: 500; font-size: 15px; text-decoration: none; border-radius: 8px;">Find Available Slot</a>
    </div>

    <p style="margin: 0 0 4px 0; font-size: 15px;">Warmly,</p>
    <p style="margin: 0; font-weight: 500; font-size: 15px; color: ${COLORS.accent};">The Saarthi Team</p>
  `;

  return generateEmailLayout(content, 'Update regarding your Saarthi slot reservation.');
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
      <a href="${process.env.APP_URL || 'https://www.saarthilife.com'}/admin" style="display: inline-block; padding: 14px 28px; background-color: ${COLORS.accent}; color: #FFFFFF; font-weight: 500; font-size: 15px; text-decoration: none; border-radius: 8px;">View Dashboard</a>
    </div>
  `;

  return generateEmailLayout(content, type === 'new' ? 'New booking request received.' : 'A session has been rescheduled.');
}

export function generatePaymentFailedEmail(data: PaymentFailedEmailData, reason?: string): string {
  const content = `
    <h2 style="margin: 0 0 24px 0; font-size: 20px; font-weight: 600; color: ${COLORS.text};">Hi ${data.patientName},</h2>
    <p style="margin: 0 0 24px 0;">We noticed that your recent payment attempt for a session with <strong>${data.therapistName}</strong> could not be completed successfully.</p>
    
    <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
      <h3 style="margin: 0 0 16px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #991B1B;">Payment Details</h3>
      
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td width="140" style="padding-bottom: 12px; color: #991B1B; font-size: 15px;">Therapist:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px; color: #7F1D1D;">${data.therapistName}</td>
        </tr>
        <tr>
          <td width="140" style="padding-bottom: 12px; color: #991B1B; font-size: 15px;">Date & Time:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px; color: #7F1D1D;">${data.sessionDate} at ${data.sessionTime} (IST)</td>
        </tr>
        ${data.orderId ? `
        <tr>
          <td width="140" style="padding-bottom: 12px; color: #991B1B; font-size: 15px;">Order ID:</td>
          <td style="padding-bottom: 12px; font-family: monospace; font-size: 14px; color: #7F1D1D;">${data.orderId}</td>
        </tr>
        ` : ''}
        <tr>
          <td width="140" style="color: #991B1B; font-size: 15px;">Status:</td>
          <td style="font-weight: 600; font-size: 15px; color: #DC2626;">Payment Failed / Cancelled</td>
        </tr>
        ${reason || data.failureReason ? `
        <tr>
          <td width="140" style="padding-top: 12px; color: #991B1B; font-size: 15px;">Notice:</td>
          <td style="padding-top: 12px; font-weight: 500; font-size: 15px; color: #7F1D1D;">${reason || data.failureReason}</td>
        </tr>
        ` : ''}
      </table>
    </div>

    <div style="background-color: #F8FAFC; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 16px; margin-bottom: 32px;">
      <p style="margin: 0; font-size: 14px; color: ${COLORS.textMuted};">
        <strong>Important Note:</strong> This session was not confirmed and Saarthi did not capture payment. If funds were temporarily deducted from your bank, UPI, or card, the charge was not settled and is typically reversed automatically by your issuing bank/payment gateway within standard banking timelines (usually 5–7 business days). If you need assistance, please contact our support team with your payment details.
      </p>
    </div>

    <p style="margin: 0 0 24px 0;">You can re-attempt your booking whenever you are ready:</p>

    <div style="text-align: center; margin-bottom: 32px;">
      <a href="${process.env.APP_URL || 'https://www.saarthilife.com'}/book" style="display: inline-block; padding: 14px 28px; background-color: ${COLORS.accent}; color: #FFFFFF; font-weight: 500; font-size: 15px; text-decoration: none; border-radius: 8px;">Try Booking Again</a>
    </div>

    <p style="margin: 0 0 4px 0; font-size: 15px;">Warmly,</p>
    <p style="margin: 0; font-weight: 500; font-size: 15px; color: ${COLORS.accent};">The Saarthi Team</p>
  `;

  return generateEmailLayout(content, 'Information regarding your Saarthi payment attempt.');
}

export interface SessionReminderEmailData {
  patientName: string;
  therapistName: string;
  sessionType?: string;
  sessionMode?: string;
  date: string;
  time: string;
  duration?: string;
  meetingUrl: string;
  bookingToken?: string;
  phone?: string;
}

export function generateSessionReminderStudentEmail(data: SessionReminderEmailData): string {
  const content = `
    <h2 style="margin: 0 0 20px 0; font-size: 20px; font-weight: 600; color: ${COLORS.text};">Hi ${data.patientName},</h2>
    
    <div style="background-color: #F0F9FF; border-left: 4px solid ${COLORS.accent}; border-radius: 4px 8px 8px 4px; padding: 16px 20px; margin-bottom: 24px;">
      <p style="margin: 0; font-size: 15px; color: #0C4A6E; line-height: 1.5;">
        ⏰ <strong>Session in 5 Hours:</strong> Your session with <strong>${data.therapistName}</strong> begins today at <strong>${data.time} (IST)</strong>.
      </p>
    </div>

    <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: ${COLORS.text};">
      We're here to help you get ready for a meaningful and supportive session. Please find your appointment details and Google Meet link below:
    </p>

    <div style="background-color: #F8FAFC; border: 1px solid ${COLORS.border}; border-radius: 12px; padding: 24px; margin-bottom: 28px;">
      <h3 style="margin: 0 0 16px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: ${COLORS.textMuted}; font-weight: 600;">Session Details</h3>
      
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Psychologist:</td>
          <td style="padding-bottom: 12px; font-weight: 600; font-size: 15px; color: ${COLORS.text};">${data.therapistName}</td>
        </tr>
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Session Type:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px; color: ${COLORS.text};">${data.sessionType || 'Individual Therapy Session'}</td>
        </tr>
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Date:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px; color: ${COLORS.text};">${data.date}</td>
        </tr>
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Time:</td>
          <td style="padding-bottom: 12px; font-weight: 600; font-size: 15px; color: ${COLORS.accent};">${data.time} (IST)</td>
        </tr>
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Duration:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px; color: ${COLORS.text};">${data.duration || `${SESSION_DURATION_MINUTES} minutes`}</td>
        </tr>
        <tr>
          <td width="140" style="color: ${COLORS.textMuted}; font-size: 15px;">Mode:</td>
          <td style="font-weight: 500; font-size: 15px; color: ${COLORS.text};">${data.sessionMode || 'Online Video (Google Meet)'}</td>
        </tr>
      </table>
    </div>

    <div style="background-color: #F0FFF4; border: 1px solid #C6F6D5; border-radius: 12px; padding: 24px; margin-bottom: 28px; text-align: center;">
      <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #22543D;">Join Your Video Session</h3>
      <p style="margin: 0 0 16px 0; font-size: 14px; color: #2F855A;">Click the button below when it's time for your session:</p>
      
      <a href="${data.meetingUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 32px; background-color: #2F855A; color: #FFFFFF; font-weight: 600; font-size: 16px; text-decoration: none; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        📹 Join Google Meet Session
      </a>
      
      <p style="margin: 16px 0 0 0; font-size: 13px; color: #4A5568;">
        Meeting link: <a href="${data.meetingUrl}" style="color: #2F855A; word-break: break-all;">${data.meetingUrl}</a>
      </p>
    </div>

    <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: ${COLORS.text};">Quick Preparation Checklist</h3>
    <ul style="margin: 0 0 28px 0; padding-left: 20px; color: ${COLORS.text}; line-height: 1.8; font-size: 14px;">
      <li style="margin-bottom: 6px;">Find a quiet, private, and well-lit space where you feel comfortable speaking freely.</li>
      <li style="margin-bottom: 6px;">Use headphones or earphones for enhanced privacy and audio clarity.</li>
      <li style="margin-bottom: 6px;">Ensure a stable internet connection and test your microphone beforehand.</li>
      <li>Join 2–3 minutes before the start time to settle in smoothly.</li>
    </ul>

    ${data.bookingToken ? `
    <div style="text-align: center; margin-bottom: 28px;">
      <a href="${process.env.APP_URL || 'https://www.saarthilife.com'}/manage-booking?token=${data.bookingToken}" style="display: inline-block; padding: 10px 20px; background-color: #EDF2F7; color: ${COLORS.text}; font-weight: 500; font-size: 14px; text-decoration: none; border-radius: 6px;">
        View Booking Details / Manage
      </a>
    </div>
    ` : ''}

    <p style="margin: 0 0 4px 0; font-size: 15px;">Warmly,</p>
    <p style="margin: 0; font-weight: 500; font-size: 15px; color: ${COLORS.accent};">The Saarthi Team</p>
  `;

  return generateEmailLayout(content, `Session Reminder: Your session with ${data.therapistName} is in 5 hours.`);
}

export function generateSessionReminderTherapistEmail(data: SessionReminderEmailData): string {
  const content = `
    <h2 style="margin: 0 0 20px 0; font-size: 20px; font-weight: 600; color: ${COLORS.text};">Hi ${data.therapistName},</h2>
    
    <div style="background-color: #F8FAFC; border-left: 4px solid ${COLORS.accent}; border-radius: 4px 8px 8px 4px; padding: 16px 20px; margin-bottom: 24px;">
      <p style="margin: 0; font-size: 15px; color: ${COLORS.text}; line-height: 1.5;">
        ⏰ <strong>Upcoming Session in 5 Hours:</strong> You have a confirmed appointment with <strong>${data.patientName}</strong> today at <strong>${data.time} (IST)</strong>.
      </p>
    </div>

    <div style="background-color: #F8FAFC; border: 1px solid ${COLORS.border}; border-radius: 12px; padding: 24px; margin-bottom: 28px;">
      <h3 style="margin: 0 0 16px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: ${COLORS.textMuted}; font-weight: 600;">Session Details</h3>
      
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Client Name:</td>
          <td style="padding-bottom: 12px; font-weight: 600; font-size: 15px; color: ${COLORS.text};">${data.patientName}</td>
        </tr>
        ${data.phone ? `
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Phone:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px; color: ${COLORS.text};">${data.phone}</td>
        </tr>
        ` : ''}
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Session Type:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px; color: ${COLORS.text};">${data.sessionType || 'Individual Therapy Session'}</td>
        </tr>
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Date:</td>
          <td style="padding-bottom: 12px; font-weight: 500; font-size: 15px; color: ${COLORS.text};">${data.date}</td>
        </tr>
        <tr>
          <td width="140" style="padding-bottom: 12px; color: ${COLORS.textMuted}; font-size: 15px;">Time:</td>
          <td style="padding-bottom: 12px; font-weight: 600; font-size: 15px; color: ${COLORS.accent};">${data.time} (IST)</td>
        </tr>
        <tr>
          <td width="140" style="color: ${COLORS.textMuted}; font-size: 15px;">Duration:</td>
          <td style="font-weight: 500; font-size: 15px; color: ${COLORS.text};">${data.duration || `${SESSION_DURATION_MINUTES} minutes`}</td>
        </tr>
      </table>
    </div>

    <div style="background-color: #F0FFF4; border: 1px solid #C6F6D5; border-radius: 12px; padding: 24px; margin-bottom: 28px; text-align: center;">
      <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #22543D;">Google Meet Link</h3>
      <p style="margin: 0 0 16px 0; font-size: 14px; color: #2F855A;">Use the secure Google Meet link below to conduct the session:</p>
      
      <a href="${data.meetingUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 32px; background-color: #2F855A; color: #FFFFFF; font-weight: 600; font-size: 16px; text-decoration: none; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        📹 Start / Join Google Meet
      </a>
      
      <p style="margin: 16px 0 0 0; font-size: 13px; color: #4A5568;">
        Meeting link: <a href="${data.meetingUrl}" style="color: #2F855A; word-break: break-all;">${data.meetingUrl}</a>
      </p>
    </div>

    <div style="text-align: center; margin-bottom: 28px;">
      <a href="${process.env.APP_URL || 'https://www.saarthilife.com'}/therapist" style="display: inline-block; padding: 10px 20px; background-color: #EDF2F7; color: ${COLORS.text}; font-weight: 500; font-size: 14px; text-decoration: none; border-radius: 6px;">
        Open Therapist Portal
      </a>
    </div>

    <p style="margin: 0 0 4px 0; font-size: 15px;">Warmly,</p>
    <p style="margin: 0; font-weight: 500; font-size: 15px; color: ${COLORS.accent};">The Saarthi Team</p>
  `;

  return generateEmailLayout(content, `Session Reminder: Upcoming session with ${data.patientName} in 5 hours.`);
}

