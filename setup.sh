#!/bin/bash

# RadScheduler Hackathon Quick Setup Script
# This gets you from zero to demo-ready in minutes

echo "=========================================="
echo "RadScheduler Hackathon Setup"
echo "=========================================="

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "Docker is required but not installed. Aborting." >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js is required but not installed. Aborting." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required but not installed. Aborting." >&2; exit 1; }

# Create .env file with defaults
echo "Creating environment configuration..."
cat > api/.env << EOF
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://raduser:radpass123@localhost:5432/radscheduler
REDIS_URL=redis://localhost:6379
FRONTEND_URL=http://localhost:3000

# Twilio (update with your credentials)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
DEMO_PHONE=+1234567890

# Claude AI (update with your key)
ANTHROPIC_API_KEY=your_api_key

# Security
JWT_SECRET=hackathon_secret_change_in_production
EOF

cat > web/.env.local << EOF
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
EOF

# Start Docker services
echo "Starting Docker services..."
docker-compose up -d

# Wait for services to be ready
echo "Waiting for services to initialize..."
sleep 10

# Install dependencies
echo "Installing API dependencies..."
cd api && npm install

echo "Installing Web dependencies..."
cd ../web && npm install

# Create database schema
echo "Setting up database..."
cd ../api
cat > scripts/init-db.js << 'EOF'
const { Client } = require('pg');

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
EOF

node scripts/init-db.js

# Create demo data seeder
cat > scripts/seed-demo.js << 'EOF'
const { Client } = require('pg');

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
EOF

node scripts/seed-demo.js

# Create Mirth channel configuration
echo "Creating Mirth channel configuration..."
mkdir -p ../mirth/channels
cat > ../mirth/channels/RIS_Integration.xml << 'EOF'
<!-- Mirth Channel Config - Import this via Mirth Administrator -->
<channel>
  <name>RIS_Integration</name>
  <sourceConnector>
    <transportName>TCP Listener</transportName>
    <port>8661</port>
  </sourceConnector>
  <destinationConnectors>
    <connector>
      <transportName>HTTP Sender</transportName>
      <host>host.docker.internal</host>
      <port>3001</port>
      <method>POST</method>
      <url>/api/hl7/appointment</url>
    </connector>
  </destinationConnectors>
</channel>
EOF

# Success message
echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Services running:"
echo "- PostgreSQL: localhost:5432"
echo "- Redis: localhost:6379"
echo "- Mirth Connect: https://localhost:8443 (admin/admin)"
echo ""
echo "Next steps:"
echo "1. Update api/.env with your Twilio and Anthropic credentials"
echo "2. Import Mirth channel from mirth/channels/RIS_Integration.xml"
echo "3. Start the API: cd api && npm run dev"
echo "4. Start the UI: cd web && npm run dev"
echo "5. Run demo: npm run demo:dramatic-save"
echo ""
echo "Happy hacking!"
EOF

chmod +x setup.sh