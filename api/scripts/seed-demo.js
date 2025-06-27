const { Client } = require('pg');
require('dotenv').config();

async function seedDemo() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    
    // Clear existing data
    await client.query('TRUNCATE appointments RESTART IDENTITY;');
    
    // Insert demo appointments
    const now = new Date();
    const appointments = [];
    
    for (let i = 0; i < 20; i++) {
      const appointmentTime = new Date(now);
      appointmentTime.setHours(8 + Math.floor(i / 2));
      appointmentTime.setMinutes((i % 2) * 30);
      
      appointments.push({
        patient_id: 'P' + (1000 + i),
        patient_name: ['John Smith', 'Jane Doe', 'Robert Johnson', 'Mary Williams'][i % 4],
        modality: ['MRI', 'CT', 'X-Ray', 'Ultrasound'][i % 4],
        study_type: ['Brain', 'Chest', 'Abdomen', 'Spine'][i % 4],
        datetime: appointmentTime,
        status: i < 10 ? 'COMPLETED' : 'SCHEDULED'
      });
    }
    
    for (const apt of appointments) {
      await client.query(
        `INSERT INTO appointments (patient_id, patient_name, modality, study_type, datetime, status) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [apt.patient_id, apt.patient_name, apt.modality, apt.study_type, apt.datetime, apt.status]
      );
    }
    
    console.log('Demo data seeded successfully');
  } catch (error) {
    console.error('Demo seeding failed:', error);
  } finally {
    await client.end();
  }
}

seedDemo();
