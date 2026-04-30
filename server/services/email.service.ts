import { Resend } from 'resend';

export const sendBookingReceivedEmail = async (booking: any, therapistName: string) => {
  const resend = new Resend(process.env.RESEND_API_KEY);

  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY is not set. Simulating booking received email send.');
    return { success: true, simulated: true };
  }

  try {
    const data = await resend.emails.send({
      from: 'Saarthi Contact <healwithsaarthi@gmail.com>',
      to: booking.email,
      subject: 'We have received your booking request',
      html: `
        <h1>Booking Request Received</h1>
        <p>Hi ${booking.name},</p>
        <p>We have successfully received your booking request for a session with ${therapistName}.</p>
        <p><strong>Date:</strong> ${booking.date}</p>
        <p><strong>Time:</strong> ${booking.time}</p>
        <p>We will notify you once your therapist confirms the session.</p>
      `,
    });
    return { success: true, data };
  } catch (error: any) {
    console.error('sendBookingReceivedEmail error:', error);
    return { success: false, error: error.message };
  }
};

export const sendBookingConfirmedEmail = async (booking: any, therapistName: string, therapistEmail: string | undefined) => {
  const resend = new Resend(process.env.RESEND_API_KEY);

  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY is not set. Simulating booking confirmed email send.');
    return { success: true, simulated: true };
  }

  try {
    const options: any = {
      from: 'Saarthi Contact <healwithsaarthi@gmail.com>',
      to: booking.email,
      subject: 'Your session has been confirmed',
      html: `
        <h1>Session Confirmed</h1>
        <p>Hi ${booking.name},</p>
        <p>Your session with ${therapistName} has been confirmed!</p>
        <p><strong>Date:</strong> ${booking.date}</p>
        <p><strong>Time:</strong> ${booking.time}</p>
        <p>Have a great session!</p>
      `,
    };

    if (therapistEmail) {
      options.bcc = therapistEmail;
    } else {
      console.warn('Skipping BCC: therapist email is missing');
    }

    const data = await resend.emails.send(options);
    return { success: true, data };
  } catch (error: any) {
    console.error('sendBookingConfirmedEmail error:', error);
    return { success: false, error: error.message };
  }
};
