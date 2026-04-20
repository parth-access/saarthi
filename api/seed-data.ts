import { db } from './firebase-admin.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // 1. Create a Therapist
    const therapistData = {
      name: "Dravina Gupta",
      title: "Psychologist & Mindfulness Coach",
      specialties: ["Anxiety", "Depression", "Mindfulness-based Stress Reduction"],
      bio: "Master’s in Clinical Psychology with extensive experience in helping individuals find their inner peace.",
      photoUrl: "home_page.jpeg",
      active: true
    };

    const therapistRef = await db.collection('therapists').add(therapistData);
    const therapistId = therapistRef.id;

    // 2. Create Availability Rules (Mon-Fri, 10 AM - 7 PM)
    const availabilityConfigs = [];
    for (let day = 1; day <= 5; day++) {
      availabilityConfigs.push({
        therapistId,
        dayOfWeek: day,
        startTime: "10:00",
        endTime: "19:00",
        slotDuration: 60
      });
    }

    const batch = db.batch();
    availabilityConfigs.forEach(config => {
      const ref = db.collection('availability').doc();
      batch.set(ref, config);
    });

    await batch.commit();

    return res.status(200).json({ 
      success: true, 
      message: 'Seed data created successfully',
      therapistId 
    });
  } catch (error: any) {
    console.error('❌ Error seeding data:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
