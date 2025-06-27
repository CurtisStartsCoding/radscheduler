const { Client } = require('pg');
require('dotenv').config();

async function initDB() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    
    // Create appointments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        patient_id VARCHAR(50) NOT NULL,
        patient_name VARCHAR(200) NOT NULL,
        patient_phone VARCHAR(20),
        modality VARCHAR(50) NOT NULL,
        study_type VARCHAR(200),
        datetime TIMESTAMP NOT NULL,
        duration INTEGER DEFAULT 30,
        status VARCHAR(50) DEFAULT 'SCHEDULED',
        referring_physician VARCHAR(200),
        urgency VARCHAR(50) DEFAULT 'routine',
        notes TEXT,
        conflicts JSONB,
        source VARCHAR(50) DEFAULT 'HL7',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_appointments_datetime ON appointments(datetime);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_appointments_modality ON appointments(modality);');

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

initDB();
