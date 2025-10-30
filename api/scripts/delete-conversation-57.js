const { Client } = require('pg');
require('dotenv').config();

async function deleteConversation() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();

    const result = await client.query('DELETE FROM sms_conversations WHERE id = 57');

    console.log('✅ Deleted', result.rowCount, 'conversation(s) with id 57');

  } catch (error) {
    console.error('❌ Error deleting conversation:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

deleteConversation();
