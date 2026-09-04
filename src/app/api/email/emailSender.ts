import { Resend, CreateEmailOptions } from 'resend';
import escapeString from 'escape-html';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { 
  generateBookingReceivedEmail, 
  generateBookingConfirmedEmail, 
  generateBookingRescheduledEmail, 
  generateTherapistNotificationEmail,
  generatePaymentReceiptEmail,
  generateBookingSlotReleasedEmail,
  generatePaymentFailedEmail,
  generateSessionReminderStudentEmail,
  generateSessionReminderTherapistEmail,
  type BookingEmailData,
  type SessionReminderEmailData
} from '../_lib/emailTemplates';
import { logger } from '../_lib/logger';
import { SESSION_DURATION_MINUTES } from '@/shared/constants';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import { EventBus } from '@/shared/events/EventBus';

let resendClient: Resend | null = null;
function getResendClient(): Resend {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is required to initialize Resend client');
    }
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export async function sendEmailWithRetry(
  options: CreateEmailOptions, 
  bookingId: string, 
  emailType: string,
  existingEmailId?: string
): Promise<unknown> {
  const maxRetries = 3;
  let attempt = 0;
  let lastError: unknown;

  // Use deterministic email ID for idempotency across retries if not provided
  const emailId = existingEmailId || `email_${bookingId}_${emailType.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const emailRef = adminDb.collection('emails').doc(emailId);
  const existingSnap = await emailRef.get();

  if (existingSnap.exists) {
    const existingData = existingSnap.data();
    if (existingData?.status === 'sent') {
      logger.info('EMAIL', `Email ${emailId} already marked as sent. Skipping duplicate dispatch.`, { bookingId, emailType });
      return { success: true, alreadySent: true, data: existingData.attempts?.[existingData.attempts.length - 1]?.response };
    }
  }

  const toStr = Array.isArray(options.to) ? options.to.join(', ') : String(options.to || '');

  if (!existingSnap.exists) {
    await emailRef.set({
      id: emailId,
      bookingId,
      type: emailType,
      recipient: toStr,
      subject: options.subject || '',
      html: options.html || '',
      text: options.text || '',
      status: 'queued',
      attempts: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  } else {
    await emailRef.update({
      status: 'queued',
      updatedAt: FieldValue.serverTimestamp()
    });
  }

  try {
    await EventBus.publish({
      name: 'EmailEnqueued',
      timestamp: new Date(),
      payload: { emailId, bookingId, type: emailType, recipient: toStr }
    });
  } catch (pubErr) {
    logger.warn('EMAIL', 'Failed to publish EmailEnqueued event', { error: String(pubErr) });
  }

  await emailRef.update({
    status: 'sending',
    updatedAt: FieldValue.serverTimestamp()
  });

  const loggedAttempts: Array<{
    attemptNumber: number;
    attemptedAt: string;
    status: 'success' | 'failed';
    error?: string;
    response?: unknown;
  }> = [];

  while (attempt < maxRetries) {
    attempt++;
    const attemptedAt = new Date().toISOString();
    try {
      logger.info('EMAIL', `Attempt ${attempt}/${maxRetries} to send ${emailType}`, {
        to: options.to,
        bookingId,
      });

      if (!process.env.RESEND_API_KEY) {
        logger.warn('EMAIL', 'RESEND_API_KEY is not set. Simulating email send.', { bookingId });
        const simulatedResponse = { id: `sim_${Math.random().toString(36).substr(2, 9)}` };
        
        loggedAttempts.push({
          attemptNumber: attempt,
          attemptedAt,
          status: 'success',
          response: simulatedResponse
        });

        await emailRef.update({
          status: 'sent',
          attempts: loggedAttempts,
          updatedAt: FieldValue.serverTimestamp()
        });

        try {
          await EventBus.publish({
            name: 'EmailSent',
            timestamp: new Date(),
            payload: { emailId, bookingId, type: emailType, recipient: toStr, response: simulatedResponse }
          });
        } catch (pubErr) {
          logger.warn('EMAIL', 'Failed to publish EmailSent event (simulated)', { error: String(pubErr) });
        }

        return { success: true, simulated: true, data: simulatedResponse };
      }

      const resend = getResendClient();
      const data = await resend.emails.send({
        replyTo: 'healwithsaarthi@gmail.com',
        ...options,
      });
      
      if (data.error) {
        throw new Error(data.error.message || 'Unknown Resend error');
      }

      logger.success('EMAIL', `Successfully sent ${emailType}`, {
        to: options.to,
        bookingId,
        resendId: data.data?.id
      });

      loggedAttempts.push({
        attemptNumber: attempt,
        attemptedAt,
        status: 'success',
        response: data.data
      });

      await emailRef.update({
        status: 'sent',
        attempts: loggedAttempts,
        updatedAt: FieldValue.serverTimestamp()
      });

      try {
        await EventBus.publish({
          name: 'EmailSent',
          timestamp: new Date(),
          payload: { emailId, bookingId, type: emailType, recipient: toStr, response: data.data || { id: 'sent' } }
        });
      } catch (pubErr) {
        logger.warn('EMAIL', 'Failed to publish EmailSent event', { error: String(pubErr) });
      }

      return data;
    } catch (error) {
      lastError = error;
      const errorMsg = error instanceof Error ? error.message : String(error);

      logger.warn('EMAIL', `Failed to send ${emailType} (Attempt ${attempt}/${maxRetries})`, {
        error: errorMsg,
        to: options.to,
        bookingId
      });

      loggedAttempts.push({
        attemptNumber: attempt,
        attemptedAt,
        status: 'failed',
        error: errorMsg
      });

      await emailRef.update({
        attempts: loggedAttempts,
        updatedAt: FieldValue.serverTimestamp()
      });

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  
  logger.error('EMAIL', `Exhausted retries for ${emailType}`, { to: options.to, bookingId, error: lastError });
  
  await emailRef.update({
    status: 'failed',
    updatedAt: FieldValue.serverTimestamp()
  });

  try {
    await EventBus.publish({
      name: 'EmailFailed',
      timestamp: new Date(),
      payload: { emailId, bookingId, type: emailType, recipient: toStr, error: lastError instanceof Error ? lastError.message : String(lastError) }
    });
  } catch (pubErr) {
    logger.warn('EMAIL', 'Failed to publish EmailFailed event', { error: String(pubErr) });
  }

  throw lastError;
}

export async function resendSavedEmailAction(emailId: string) {
  const emailRef = adminDb.collection('emails').doc(emailId);
  const emailSnap = await emailRef.get();
  if (!emailSnap.exists) {
    throw new Error('Email log not found');
  }
  const emailData = emailSnap.data()!;

  const options: CreateEmailOptions = {
    from: 'Saarthi Contact <contact@saarthilife.com>',
    to: emailData.recipient,
    subject: emailData.subject,
    html: emailData.html,
    text: emailData.text,
  };

  return sendEmailWithRetry(options, emailData.bookingId, emailData.type, emailId);
}

async function updateBookingEmailStatus(bookingId: string, status: 'sent' | 'failed', errorMsg?: string) {
  if (!bookingId) return;
  try {
    const booking = await firestoreBookingRepository.findById(bookingId);
    if (booking) {
      booking.emailStatus = status;
      booking.lastEmailAttemptAt = FieldValue.serverTimestamp();
      if (errorMsg) {
        booking.lastEmailError = errorMsg;
      }
      await firestoreBookingRepository.save(booking);
    }
  } catch (err) {
    logger.warn('EMAIL', 'Could not update booking email status in DB', { error: String(err), bookingId });
  }
}

export interface EmailPayload {
  type: 'booking-received' | 'booking-confirmed' | 'payment-receipt' | 'booking-slot-released' | 'payment-failed' | 'booking-rescheduled' | 'therapist-notification' | 'booking-declined' | 'session-reminder';
  bookingId: string;
  therapistId: string;
  declineReason?: string;
  declineCustomNote?: string;
  meetingUrl?: string;
  paymentDetails?: {
    amount?: number;
    currency?: string;
    orderId?: string;
    paymentId?: string;
    paidAt?: string;
    failureReason?: string;
  };
  bookingDetails?: {
    name: string;
    email: string;
    phone?: string;
    date: string;
    time: string;
    originalDate?: string;
    originalTime?: string;
    sessionMode?: string;
    bookingToken?: string;
    meetingUrl?: string;
    sessionType?: string;
  };
}

export async function sendEmailAction(payload: EmailPayload) {
  const { type, bookingId, therapistId, bookingDetails, declineReason, declineCustomNote, paymentDetails } = payload;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let bookingData: any;
  try {
    const booking = await firestoreBookingRepository.findById(bookingId);
    if (booking) {
      bookingData = booking;
    } else {
      logger.warn("EMAIL", "Booking not found in database, proceeding with fallback metadata", { bookingId });
      bookingData = bookingDetails;
    }
    
    if (type === 'booking-received') {
      const createdAt = bookingData?.createdAt?.toDate();
      if (createdAt && (Date.now() - createdAt.getTime() > 1000 * 60 * 15)) {
        logger.warn("EMAIL", "Booking is too old for initial receipt email", { bookingId, createdAt });
        return { success: false, error: 'Booking is too old for initial receipt email' };
      }
    }
  } catch(err) {
    logger.warn("EMAIL", "Could not verify booking via admin DB, proceeding with payload if provided", { error: err });
    bookingData = bookingDetails;
  }

  if (!bookingData) {
    throw new Error('Missing booking details');
  }

  let therapistData;
  try {
    const therapistSnap = await adminDb.collection('therapists').doc(therapistId).get();
    if (therapistSnap.exists) therapistData = therapistSnap.data();
  } catch(err) {
    logger.warn("EMAIL", "Could not fetch therapist via admin DB", { error: err });
  }

  const therapistName = therapistData?.name || 'our therapist';
  const therapistEmail = therapistData?.email;
  const patientName = bookingData.name || bookingDetails?.name;
  const patientEmail = bookingData.email || bookingDetails?.email;
  const patientPhone = bookingData.phone || bookingDetails?.phone;
  const bookingDate = bookingData.date || bookingDetails?.date;
  const bookingTime = bookingData.time || bookingDetails?.time;

  if (!patientEmail || !patientName || !bookingDate || !bookingTime) {
    throw new Error('Booking missing required fields for email');
  }

  if (!process.env.RESEND_API_KEY) {
    logger.warn('EMAIL', 'RESEND_API_KEY is not set. Simulating email send.', { bookingId });
    return { success: true, simulated: true };
  }

  const safePatientName = escapeString(patientName);
  const safePatientPhone = patientPhone ? escapeString(patientPhone) : 'Not provided';
  const safeTherapistName = escapeString(therapistName);
  const safeTherapistSpecialization = therapistData?.specialization ? escapeString(therapistData.specialization) : undefined;
  const safeDate = escapeString(bookingDate);
  const safeTime = escapeString(bookingTime);
  const safeOriginalDate = bookingData.originalDate || bookingDetails?.originalDate ? escapeString(bookingData.originalDate || bookingDetails?.originalDate || '') : undefined;
  const safeOriginalTime = bookingData.originalTime || bookingDetails?.originalTime ? escapeString(bookingData.originalTime || bookingDetails?.originalTime || '') : undefined;
  const safeSessionMode = bookingData.sessionMode || bookingDetails?.sessionMode ? escapeString(bookingData.sessionMode || bookingDetails?.sessionMode || '') : undefined;
  const safeBookingToken = bookingData.bookingToken || bookingDetails?.bookingToken;
  const meetingUrl = payload.meetingUrl || bookingData.meetingUrl || bookingDetails?.meetingUrl;

  const emailData: BookingEmailData = {
    patientName: safePatientName,
    therapistName: safeTherapistName,
    therapistSpecialization: safeTherapistSpecialization,
    date: safeDate,
    time: safeTime,
    phone: safePatientPhone,
    sessionMode: safeSessionMode,
    bookingToken: safeBookingToken,
    meetingUrl: meetingUrl,
  };

  if (type === 'booking-received') {
    const patientPlainText = `Booking Request Received\nHi ${safePatientName},\nWe have successfully received your booking request with ${safeTherapistName}.\nDate: ${safeDate}\nTime: ${safeTime}\nWe will notify you once confirmed.\n- The Saarthi Team`.trim();

    const promises: Promise<unknown>[] = [
      sendEmailWithRetry({
        from: 'Saarthi Contact <contact@saarthilife.com>',
        to: patientEmail,
        subject: 'We’ve received your booking request | Saarthi',
        html: generateBookingReceivedEmail(emailData),
        text: patientPlainText,
      }, bookingId, 'booking-received-patient')
    ];

    if (therapistEmail) {
      const therapistPlainText = `New Booking Request\nPatient: ${safePatientName}\nDate: ${safeDate}\nTime: ${safeTime}`.trim();
      promises.push(sendEmailWithRetry({
        from: 'Saarthi Notifications <contact@saarthilife.com>',
        to: therapistEmail,
        subject: 'New Booking Request Received',
        html: generateTherapistNotificationEmail(emailData, 'new'),
        text: therapistPlainText,
      }, bookingId, 'booking-received-therapist'));
    }

    const results = await Promise.all(promises);
    await updateBookingEmailStatus(bookingId, 'sent');
    return { success: true, data: results };
  } 
  
  if (type === 'booking-confirmed') {
    const plainText = `Session Confirmed\nHi ${safePatientName},\nYour session with ${safeTherapistName} has been confirmed!\nDate: ${safeDate}\nTime: ${safeTime}\nHave a great session!\n- The Saarthi Team`.trim();

    const data = await sendEmailWithRetry({
      from: 'Saarthi Contact <contact@saarthilife.com>',
      to: patientEmail,
      subject: 'Your Saarthi session is confirmed',
      html: generateBookingConfirmedEmail(emailData),
      text: plainText,
    }, bookingId, 'booking-confirmed');
    
    await updateBookingEmailStatus(bookingId, 'sent');
    return { success: true, data };
  }

  if (type === 'payment-receipt') {
    const amount = paymentDetails?.amount || bookingData.paymentAmount || (bookingData.sessionMode === 'in_person' ? 2000 : 1500);
    const currency = paymentDetails?.currency || bookingData.paymentCurrency || 'INR';
    const orderId = paymentDetails?.orderId || bookingData.razorpayOrderId || 'N/A';
    const paymentId = paymentDetails?.paymentId || bookingData.razorpayPaymentId || 'N/A';
    const paidAt = paymentDetails?.paidAt || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const plainText = `Payment Receipt\nHi ${safePatientName},\nThank you for your payment of ₹${amount.toLocaleString('en-IN')} for your session with ${safeTherapistName}.\nPayment ID: ${paymentId}\nOrder ID: ${orderId}\nDate: ${safeDate} at ${safeTime} IST\n- The Saarthi Team`.trim();

    const data = await sendEmailWithRetry({
      from: 'Saarthi Accounts <contact@saarthilife.com>',
      to: patientEmail,
      subject: `Payment Receipt: Your session with ${safeTherapistName}`,
      html: generatePaymentReceiptEmail({
        patientName: safePatientName,
        therapistName: safeTherapistName,
        amount,
        currency,
        orderId,
        paymentId,
        sessionDate: safeDate,
        sessionTime: safeTime,
        paidAt,
        bookingToken: safeBookingToken,
      }),
      text: plainText,
    }, bookingId, 'payment-receipt');

    return { success: true, data };
  }

  if (type === 'booking-slot-released') {
    const reason = declineReason || declineCustomNote || 'Payment was not completed within the time window.';
    const plainText = `Slot Released\nHi ${safePatientName},\nYour tentative slot with ${safeTherapistName} on ${safeDate} at ${safeTime} was not confirmed and has been released.\nReason: ${reason}\nYou may book again anytime.\n- The Saarthi Team`.trim();

    const data = await sendEmailWithRetry({
      from: 'Saarthi Contact <contact@saarthilife.com>',
      to: patientEmail,
      subject: 'Update regarding your Saarthi slot reservation',
      html: generateBookingSlotReleasedEmail(emailData, reason),
      text: plainText,
    }, bookingId, 'booking-slot-released');

    return { success: true, data };
  }

  if (type === 'payment-failed') {
    const amount = paymentDetails?.amount || bookingData.paymentAmount;
    const currency = paymentDetails?.currency || bookingData.paymentCurrency || 'INR';
    const orderId = paymentDetails?.orderId || bookingData.razorpayOrderId;
    const paymentId = paymentDetails?.paymentId || bookingData.razorpayPaymentId;
    const reason = paymentDetails?.failureReason || declineReason || 'Payment could not be verified or was cancelled.';

    const plainText = `Payment Failed\nHi ${safePatientName},\nYour payment attempt for the session with ${safeTherapistName} on ${safeDate} at ${safeTime} was unsuccessful and the session was not confirmed.\nIf funds were temporarily deducted from your account, they were not settled to Saarthi and are typically reversed automatically by your bank within 5-7 business days. Please contact support if you need assistance.\n- The Saarthi Team`.trim();

    const data = await sendEmailWithRetry({
      from: 'Saarthi Contact <contact@saarthilife.com>',
      to: patientEmail,
      subject: 'Information regarding your Saarthi payment attempt',
      html: generatePaymentFailedEmail({
        patientName: safePatientName,
        therapistName: safeTherapistName,
        amount,
        currency,
        orderId,
        paymentId,
        sessionDate: safeDate,
        sessionTime: safeTime,
        failureReason: reason,
      }, reason),
      text: plainText,
    }, bookingId, 'payment-failed');

    return { success: true, data };
  }

  if (type === 'booking-rescheduled') {
    const plainText = `Session Rescheduled\nHi ${safePatientName},\nYour session with ${safeTherapistName} has been rescheduled to ${safeDate} at ${safeTime}.\n- The Saarthi Team`.trim();

    const promises: Promise<unknown>[] = [
      sendEmailWithRetry({
        from: 'Saarthi Contact <contact@saarthilife.com>',
        to: patientEmail,
        subject: 'Your session has been rescheduled',
        html: generateBookingRescheduledEmail(emailData, safeOriginalDate || '', safeOriginalTime || ''),
        text: plainText,
      }, bookingId, 'booking-rescheduled-patient')
    ];

    if (therapistEmail) {
      const therapistPlainText = `Session Rescheduled\nPatient: ${safePatientName}\nNew Date: ${safeDate}\nNew Time: ${safeTime}`.trim();
      promises.push(sendEmailWithRetry({
        from: 'Saarthi Notifications <contact@saarthilife.com>',
        to: therapistEmail,
        subject: 'A Session Has Been Rescheduled',
        html: generateTherapistNotificationEmail(emailData, 'rescheduled', safeOriginalDate, safeOriginalTime),
        text: therapistPlainText,
      }, bookingId, 'booking-rescheduled-therapist'));
    }

    const results = await Promise.all(promises);
    await updateBookingEmailStatus(bookingId, 'sent');
    return { success: true, data: results };
  }

  if (type === 'booking-declined') {
    const safeReason = declineReason ? escapeString(declineReason) : '';
    const safeNote = declineCustomNote ? escapeString(declineCustomNote) : '';
    
    const plainText = `Booking Request Unsuccessful\nHi ${safePatientName},\nWe're sorry, but we cannot proceed with your booking request for ${safeDate} at ${safeTime} at this time.\nReason: ${safeReason}\n${safeNote ? `Note: ${safeNote}\n` : ''}Please feel free to try another time slot or contact us for assistance.\n- The Saarthi Team`.trim();

    const data = await sendEmailWithRetry({
      from: 'Saarthi Contact <contact@saarthilife.com>',
      to: patientEmail,
      subject: 'Update regarding your booking request',
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #6B4C1A; font-weight: normal;">Booking Request Update</h2>
        <p>Hi ${safePatientName},</p>
        <p>Thank you for reaching out to us. Unfortunately, we are unable to proceed with your requested session at this time.</p>
        
        <div style="background-color: #FFFBE7; border-left: 4px solid #E6A520; padding: 15px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Requested Session:</strong> ${safeDate} at ${safeTime}</p>
          ${safeReason ? `<p style="margin: 10px 0 0 0;"><strong>Reason:</strong> ${safeReason}</p>` : ''}
          ${safeNote ? `<p style="margin: 10px 0 0 0; font-style: italic;">"${safeNote}"</p>` : ''}
        </div>

        <p>We understand finding the right time is important. We warmly encourage you to return to our platform to explore other available time slots that might work for you.</p>
        <p>If you have any questions or need immediate assistance, please reply directly to this email.</p>
        <br/>
        <p style="margin: 0;">Warm regards,</p>
        <p style="margin: 5px 0 0 0; font-weight: bold;">The Saarthi Team</p>
      </div>
      `,
      text: plainText,
    }, bookingId, 'booking-declined');
    
    await updateBookingEmailStatus(bookingId, 'sent');
    return { success: true, data };
  }

  if (type === 'session-reminder') {
    const meetingUrl = payload.meetingUrl || bookingData.meetingUrl || bookingDetails?.meetingUrl;
    if (!meetingUrl) {
      throw new Error('Cannot send session reminder without a valid meeting URL');
    }

    const reminderData: SessionReminderEmailData = {
      patientName: safePatientName,
      therapistName: safeTherapistName,
      sessionType: bookingData.sessionType || bookingDetails?.sessionType || 'Individual Therapy Session',
      sessionMode: safeSessionMode,
      date: safeDate,
      time: safeTime,
      duration: `${SESSION_DURATION_MINUTES} minutes`,
      meetingUrl: meetingUrl,
      bookingToken: safeBookingToken,
      phone: safePatientPhone !== 'Not provided' ? safePatientPhone : undefined,
    };

    const studentPlainText = `Session Reminder: Your session with ${safeTherapistName} is in 5 hours at ${safeTime} IST.\nJoin link: ${meetingUrl}\n- The Saarthi Team`.trim();

    const studentPromise = sendEmailWithRetry({
      from: 'Saarthi Reminders <contact@saarthilife.com>',
      to: patientEmail,
      subject: `Reminder: Your therapy session with ${safeTherapistName} is in 5 hours`,
      html: generateSessionReminderStudentEmail(reminderData),
      text: studentPlainText,
    }, bookingId, 'session-reminder-student');

    let therapistPromise: Promise<unknown> | null = null;
    if (therapistEmail) {
      const therapistPlainText = `Session Reminder: Upcoming session with ${safePatientName} in 5 hours at ${safeTime} IST.\nJoin link: ${meetingUrl}\n- The Saarthi Team`.trim();
      therapistPromise = sendEmailWithRetry({
        from: 'Saarthi Notifications <contact@saarthilife.com>',
        to: therapistEmail,
        subject: `Session Reminder: Appointment with ${safePatientName} in 5 hours`,
        html: generateSessionReminderTherapistEmail(reminderData),
        text: therapistPlainText,
      }, bookingId, 'session-reminder-therapist');
    } else {
      logger.warn('REMINDER', `Therapist ${therapistId} has no email configured. Skipping therapist reminder email.`, { bookingId });
    }

    const results = await Promise.all([
      studentPromise,
      ...(therapistPromise ? [therapistPromise] : [])
    ]);

    return { 
      success: true, 
      studentSent: true, 
      therapistSent: !!therapistEmail, 
      data: results 
    };
  }

  throw new Error('Invalid email type');
}
