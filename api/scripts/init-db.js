const { Client } = require('pg');
require('dotenv').config();

async function initDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    
    // Create appointments table with Avreo integration fields
    await client.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        avreo_id VARCHAR(100) UNIQUE, -- Avreo appointment ID for sync tracking
        patient_id VARCHAR(50) NOT NULL,
        patient_name VARCHAR(100) NOT NULL,
        patient_phone VARCHAR(20),
        patient_email VARCHAR(100), -- Patient email for self-scheduling
        modality VARCHAR(50) NOT NULL,
        study_type VARCHAR(100) NOT NULL,
        datetime TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'SCHEDULED',
        referring_physician VARCHAR(100),
        urgency VARCHAR(20) DEFAULT 'routine',
        notes TEXT,
        source VARCHAR(50) DEFAULT 'manual', -- Source: manual, avreo_sync, patient_self_schedule, hl7
        last_synced TIMESTAMP, -- Last sync time with Avreo
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index for Avreo sync performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_appointments_avreo_id ON appointments(avreo_id)
    `);

    // Create index for date queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_appointments_datetime ON appointments(datetime)
    `);

    // Create index for status queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status)
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

initDatabase();
