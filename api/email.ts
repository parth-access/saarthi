import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { z } from 'zod';
import escapeHtml from 'escape-html';
import { adminAuth, adminDb } from './_lib/firebaseAdmin.js';
import { generateBookingReceivedEmail, generateBookingConfirmedEmail, generatePaymentLinkEmail, generateBookingRescheduledEmail, generateTherapistNotificationEmail, type BookingEmailData } from './_lib/emailTemplates.js';

import { logger } from './_lib/logger.js';
import { FieldValue } from 'firebase-admin/firestore';

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmailWithRetry(options: any, bookingId: string, emailType: string): Promise<any> {
    const maxRetries = 3;
    let attempt = 0;
    let lastError: any;

    while (attempt < maxRetries) {
        attempt++;
        try {
            logger.info('EMAIL', `Attempt ${attempt}/${maxRetries} to send ${emailType}`, {
                to: options.to,
                bookingId,
            });
            const data = await resend.emails.send(options);
            
            if (data.error) {
              throw new Error(data.error.message || 'Unknown Resend error');
            }

            logger.success('EMAIL', `Successfully sent ${emailType}`, {
                to: options.to,
                bookingId,
                resendId: data.data?.id
            });
            return data;
        } catch (error: any) {
            lastError = error;
            logger.warn('EMAIL', `Failed to send ${emailType} (Attempt ${attempt}/${maxRetries})`, {
                error: error.message,
                to: options.to,
                bookingId
            });
            if (attempt < maxRetries) {
                // Exponential backoff
                await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
            }
        }
    }
    
    logger.error('EMAIL', `Exhausted retries for ${emailType}`, { to: options.to, bookingId, error: lastError });
    throw lastError;
}

const EmailPayloadSchema = z.object({
  type: z.enum(['booking-received', 'booking-confirmed', 'booking-payment-link', 'booking-rescheduled', 'therapist-notification']),
  bookingId: z.string().min(1),
  therapistId: z.string().min(1),
  bookingDetails: z.object({
    name: z.string(),
    email: z.string().email(),
    phone: z.string().optional(),
    date: z.string(),
    time: z.string(),
    originalDate: z.string().optional(),
    originalTime: z.string().optional(),
    sessionMode: z.string().optional(),
    bookingToken: z.string().optional(),
  }).optional() // Fallback if not reading entirely from admin DB
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const parsed = EmailPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request payload', details: parsed.error.issues });
    }

    const { type, bookingId, therapistId, bookingDetails } = parsed.data;

    // Validate Auth Token for sensitive actions
    if (type === 'booking-confirmed') {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
      }

      const idToken = authHeader.split('Bearer ')[1];
      try {
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        if (!decodedToken) {
          throw new Error('Invalid token');
        }
      } catch (err) {
        return res.status(403).json({ error: 'Forbidden: Invalid token' });
      }
    }

    // Validate the booking exists in Firestore
    let bookingData;
    try {
      const bookingSnap = await adminDb.collection('bookings').doc(bookingId).get();
      if (!bookingSnap.exists) {
        return res.status(404).json({ error: 'Booking not found' });
      }
      bookingData = bookingSnap.data();
      
      // For booking-received, verify it's recent to prevent abuse
      if (type === 'booking-received') {
        const createdAt = bookingData?.createdAt?.toDate();
        if (createdAt && (Date.now() - createdAt.getTime() > 1000 * 60 * 15)) { // 15 mins window
           return res.status(400).json({ error: 'Booking is too old for initial receipt email' });
        }
      }
    } catch(err) {
      console.warn("Could not verify booking via admin DB, proceeding with payload if provided", err);
      // In case admin DB isn't configured, fallback to passed args
      bookingData = bookingDetails;
    }

    if (!bookingData) {
      return res.status(400).json({ error: 'Missing booking details' });
    }

    // Fetch Therapist Info
    let therapistData;
    try {
      const therapistSnap = await adminDb.collection('therapists').doc(therapistId).get();
      if (therapistSnap.exists) therapistData = therapistSnap.data();
    } catch(err) {
      console.warn("Could not fetch therapist via admin DB", err);
    }

    const therapistName = therapistData?.name || 'our therapist';
    const therapistEmail = therapistData?.email;
    const patientName = bookingData.name || bookingDetails?.name;
    const patientEmail = bookingData.email || bookingDetails?.email;
    const patientPhone = bookingData.phone || bookingDetails?.phone;
    const bookingDate = bookingData.date || bookingDetails?.date;
    const bookingTime = bookingData.time || bookingDetails?.time;

    if (!patientEmail || !patientName || !bookingDate || !bookingTime) {
      return res.status(400).json({ error: 'Booking missing required fields for email' });
    }

    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY is not set. Simulating email send.');
      return res.status(200).json({ success: true, simulated: true });
    }

    // Escape Inputs!
    const safePatientName = escapeHtml(patientName);
    const safePatientPhone = patientPhone ? escapeHtml(patientPhone) : 'Not provided';
    const safeTherapistName = escapeHtml(therapistName);
    const safeTherapistSpecialization = therapistData?.specialization ? escapeHtml(therapistData.specialization) : undefined;
    const safeDate = escapeHtml(bookingDate);
    const safeTime = escapeHtml(bookingTime);
    const safeOriginalDate = bookingData.originalDate || bookingDetails?.originalDate ? escapeHtml(bookingData.originalDate || bookingDetails?.originalDate || '') : undefined;
    const safeOriginalTime = bookingData.originalTime || bookingDetails?.originalTime ? escapeHtml(bookingData.originalTime || bookingDetails?.originalTime || '') : undefined;
    const safeSessionMode = bookingData.sessionMode || bookingDetails?.sessionMode ? escapeHtml(bookingData.sessionMode || bookingDetails?.sessionMode || '') : undefined;
    const safeBookingToken = bookingData.bookingToken || bookingDetails?.bookingToken;

    const emailData: BookingEmailData = {
      patientName: safePatientName,
      therapistName: safeTherapistName,
      therapistSpecialization: safeTherapistSpecialization,
      date: safeDate,
      time: safeTime,
      phone: safePatientPhone,
      sessionMode: safeSessionMode,
      bookingToken: safeBookingToken,
    };

    if (type === 'booking-received') {
      const patientPlainText = `Booking Request Received\nHi ${safePatientName},\nWe have successfully received your booking request with ${safeTherapistName}.\nDate: ${safeDate}\nTime: ${safeTime}\nWe will notify you once confirmed.\n- The Saarthi Team`.trim();

      const promises: Promise<any>[] = [
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
      return res.status(200).json({ success: true, data: results });
    } 
    
    if (type === 'booking-payment-link') {
      const plainText = `Payment Required\nHi ${safePatientName},\nYour session with ${safeTherapistName} has been approved. Please complete payment to confirm your booking.\nDate: ${safeDate}\nTime: ${safeTime}\n- The Saarthi Team`.trim();

      const data = await sendEmailWithRetry({
        from: 'Saarthi Contact <contact@saarthilife.com>',
        to: patientEmail,
        subject: 'Action Required: Complete your session payment | Saarthi',
        html: generatePaymentLinkEmail(emailData),
        text: plainText,
      }, bookingId, 'booking-payment-link');
      
      await updateBookingEmailStatus(bookingId, 'sent');
      return res.status(200).json({ success: true, data });
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
      return res.status(200).json({ success: true, data });
    }

    if (type === 'booking-rescheduled') {
      const plainText = `Session Rescheduled\nHi ${safePatientName},\nYour session with ${safeTherapistName} has been rescheduled to ${safeDate} at ${safeTime}.\n- The Saarthi Team`.trim();

      const promises: Promise<any>[] = [
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
      return res.status(200).json({ success: true, data: results });
    }

    return res.status(400).json({ error: 'Invalid email type' });
    
  } catch (error: any) {
    logger.error('EMAIL', 'Email API Error', error);
    
    // Attempt to parse out bookingId if we got far enough before error
    try {
      const parsed = EmailPayloadSchema.safeParse(req.body);
      if (parsed.success) {
        await updateBookingEmailStatus(parsed.data.bookingId, 'failed', error.message);
      }
    } catch(e) { /* ignore */ }

    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function updateBookingEmailStatus(bookingId: string, status: 'sent' | 'failed', errorMsg?: string) {
  if (!bookingId) return;
  try {
    await adminDb.collection('bookings').doc(bookingId).update({
      emailStatus: status,
      lastEmailAttemptAt: FieldValue.serverTimestamp(),
      ...(errorMsg ? { lastEmailError: errorMsg } : {})
    });
  } catch (err) {
    logger.warn('EMAIL', 'Could not update booking email status in DB', { error: String(err), bookingId });
  }
}
