const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const sql = fs.readFileSync('./db/migrations/001_create_sms_tables.sql', 'utf8');

pool.query(sql)
  .then(() => {
    console.log('✅ Migration complete');
    return pool.query("SELECT table_name FROM information_schema.tables WHERE table_name IN ('patient_sms_consents', 'sms_audit_log', 'sms_conversations')");
  })
  .then(result => {
    console.log('Tables created:', result.rows.map(r => r.table_name));
    pool.end();
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    pool.end();
    process.exit(1);
  });
