/**
 * Delete Conversation Script
 *
 * Deletes a single SMS conversation from the database by ID.
 * Useful for clearing stuck conversations during development/testing.
 *
 * Usage:
 *   node api/scripts/delete-conversation.js <conversation_id>
 *
 * Example:
 *   node api/scripts/delete-conversation.js 85
 *
 * The script will:
 * - Connect to the database using DATABASE_URL from .env
 * - Delete the conversation with the specified ID
 * - Report success or failure
 */

const { Client } = require('pg');
require('dotenv').config();

async function deleteConversation() {
  const conversationId = process.argv[2];

  if (!conversationId) {
    console.error('❌ Usage: node delete-conversation.js <conversation_id>');
    console.error('   Example: node delete-conversation.js 85');
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    const result = await client.query('DELETE FROM sms_conversations WHERE id = $1', [conversationId]);

    if (result.rowCount > 0) {
      console.log(`✅ Deleted conversation ${conversationId}`);
    } else {
      console.log(`⚠️  No conversation found with id ${conversationId}`);
    }

  } catch (error) {
    console.error('❌ Error deleting conversation:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

deleteConversation();
