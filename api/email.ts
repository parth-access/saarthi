import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { z } from 'zod';
import escapeHtml from 'escape-html';
import { adminAuth, adminDb } from './_lib/firebaseAdmin.js';
import { generateBookingReceivedEmail, generateBookingConfirmedEmail, type BookingEmailData } from './_lib/emailTemplates.js';

const resend = new Resend(process.env.RESEND_API_KEY);

const EmailPayloadSchema = z.object({
  type: z.enum(['booking-received', 'booking-confirmed']),
  bookingId: z.string().min(1),
  therapistId: z.string().min(1),
  bookingDetails: z.object({
    name: z.string(),
    email: z.string().email(),
    phone: z.string().optional(),
    date: z.string(),
    time: z.string()
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
    const safeDate = escapeHtml(bookingDate);
    const safeTime = escapeHtml(bookingTime);

    if (type === 'booking-received') {
      const emailData: BookingEmailData = {
        patientName: safePatientName,
        therapistName: safeTherapistName,
        date: safeDate,
        time: safeTime,
        phone: safePatientPhone,
      };

      const data = await resend.emails.send({
        from: 'Saarthi Contact <healwithsaarthi@gmail.com>',
        to: patientEmail,
        subject: 'We’ve received your booking request | Saarthi',
        html: generateBookingReceivedEmail(emailData),
      });
      return res.status(200).json({ success: true, data });
    } 
    
    if (type === 'booking-confirmed') {
      const emailData: BookingEmailData = {
        patientName: safePatientName,
        therapistName: safeTherapistName,
        date: safeDate,
        time: safeTime,
        phone: safePatientPhone,
      };

      const options: any = {
        from: 'Saarthi Contact <healwithsaarthi@gmail.com>',
        to: patientEmail,
        subject: 'Your Saarthi session is confirmed',
        html: generateBookingConfirmedEmail(emailData),
      };

      if (therapistEmail) {
        options.bcc = therapistEmail;
      }

      const data = await resend.emails.send(options);
      return res.status(200).json({ success: true, data });
    }

    return res.status(400).json({ error: 'Invalid email type' });
    
  } catch (error: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Email API Error:', error);
    }
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
