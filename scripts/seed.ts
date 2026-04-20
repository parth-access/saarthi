import { db } from '../api/firebase-admin.js';

async function seed() {
  console.log('🌱 Starting database seeding...');

  try {
    const therapists = [
      {
        name: "Dravina Gupta",
        specialization: "Clinical Psychologist & Mindfulness Coach",
        experience: "8+ Years",
        bio: "Specializing in anxiety, depression, and mindfulness-based stress reduction. I believe in a compassionate, non-judgmental approach to healing.",
        image: "about_page.png",
        active: true
      },
      {
        name: "Ananya Sharma",
        specialization: "Child & Adolescent Specialist",
        experience: "5 Years",
        bio: "Helping young minds navigate the complexities of growing up. Focused on emotional regulation and family dynamics.",
        image: "https://picsum.photos/seed/ananya/400/400",
        active: true
      },
      {
        name: "Vikram Malhotra",
        specialization: "Trauma & CBT Expert",
        experience: "12 Years",
        bio: "Dedicated to helping survivors of trauma reclaim their lives through evidence-based cognitive behavioral therapy.",
        image: "https://picsum.photos/seed/vikram/400/400",
        active: true
      }
    ];

    for (const t of therapists) {
      const existing = await db.collection('therapists').where('name', '==', t.name).get();
      
      let therapistId;
      if (existing.empty) {
        const therapistRef = db.collection('therapists').doc();
        await therapistRef.set(t);
        therapistId = therapistRef.id;
        console.log(`✅ Created therapist: ${t.name}`);
      } else {
        therapistId = existing.docs[0].id;
        console.log(`ℹ️ Therapist ${t.name} already exists.`);
      }

      const availabilityQuery = await db.collection('availability').where('therapistId', '==', therapistId).get();
      if (availabilityQuery.empty) {
        const batch = db.batch();
        for (let day = 1; day <= 5; day++) {
          const availRef = db.collection('availability').doc();
          batch.set(availRef, {
            therapistId,
            dayOfWeek: day,
            startTime: "10:00",
            endTime: "18:00",
            slotDuration: 60
          });
        }
        await batch.commit();
        console.log(`📅 Created availability for ${t.name}`);
      }
    }

    console.log('✨ Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seed();
