/**
 * AI-Powered Scheduling Analysis Service
 *
 * Provides intelligent analysis of radiology orders using Claude API:
 * - Equipment requirement inference from procedure descriptions
 * - Realistic duration calculation based on procedure complexity
 * - Patient prep instruction generation
 *
 * This service is OPTIONAL - the system works without it via rules-based approach.
 * AI analysis enhances accuracy for edge cases and provides natural language understanding.
 *
 * Features:
 * - Externalized prompts stored in database for A/B testing
 * - Comprehensive logging of all AI calls for analysis
 * - Graceful fallback when AI is unavailable
 */

const { getPool } = require('../db/connection');
const logger = require('../utils/logger');

// Lazy-load Anthropic SDK to handle case where it's not installed
let Anthropic = null;
let anthropicClient = null;

/**
 * Initialize Anthropic client (lazy loading)
 * @returns {Object|null} Anthropic client or null if not available
 */
function getAnthropicClient() {
  if (anthropicClient) {
    return anthropicClient;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY not configured - AI analysis disabled');
    return null;
  }

  try {
    if (!Anthropic) {
      Anthropic = require('@anthropic-ai/sdk');
    }
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
    logger.info('Anthropic client initialized for scheduling AI');
    return anthropicClient;
  } catch (error) {
    logger.warn('Failed to initialize Anthropic client - AI analysis disabled', {
      error: error.message
    });
    return null;
  }
}

/**
 * Check if AI analysis is available
 * @returns {boolean} True if AI can be used
 */
function isAIAvailable() {
  return !!getAnthropicClient();
}

/**
 * Get active prompt by key (with A/B test selection if multiple active)
 * Selects prompt based on ab_test_weight for variants
 *
 * @param {string} promptKey - Base key for prompt (e.g., 'order_analysis')
 * @returns {Promise<Object>} Prompt record from database
 * @throws {Error} If no active prompt found or database unavailable
 */
async function getActivePrompt(promptKey) {
  let pool;
  try {
    pool = getPool();
  } catch (error) {
    throw new Error('Database not available for prompt lookup');
  }

  // Find all active prompts matching the key pattern
  const result = await pool.query(`
    SELECT * FROM scheduling_prompts
    WHERE prompt_key LIKE $1
      AND is_active = TRUE
    ORDER BY ab_test_weight DESC, version DESC
  `, [`${promptKey}%`]);

  if (result.rows.length === 0) {
    throw new Error(`No active prompt found for key: ${promptKey}`);
  }

  // If multiple active prompts, select based on weight (simple weighted random)
  if (result.rows.length > 1) {
    const totalWeight = result.rows.reduce((sum, p) => sum + p.ab_test_weight, 0);
    let random = Math.random() * totalWeight;

    for (const prompt of result.rows) {
      random -= prompt.ab_test_weight;
      if (random <= 0) {
        return prompt;
      }
    }
  }

  return result.rows[0];
}

/**
 * Get prompt by exact key (for testing/specific selection)
 * @param {string} exactKey - Exact prompt key
 * @returns {Promise<Object|null>} Prompt record or null
 */
async function getPromptByKey(exactKey) {
  let pool;
  try {
    pool = getPool();
  } catch (error) {
    return null;  // Graceful fallback when database unavailable
  }

  const result = await pool.query(`
    SELECT * FROM scheduling_prompts
    WHERE prompt_key = $1
  `, [exactKey]);

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Interpolate placeholders in prompt template
 * Replaces {{placeholder}} with corresponding data values
 *
 * @param {string} template - Prompt template with {{placeholders}}
 * @param {Object} data - Data object with values for placeholders
 * @returns {string} Interpolated prompt
 */
function interpolatePrompt(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = data[key];
    if (value === undefined || value === null) {
      return 'Not provided';
    }
    return String(value);
  });
}

/**
 * Log AI analysis call to database
 * @param {Object} logData - Analysis log data
 * @returns {Promise<number>} Log entry ID
 */
async function logAnalysis(logData) {
  let pool;
  try {
    pool = getPool();
  } catch (error) {
    // Database not initialized - skip logging (graceful degradation)
    logger.debug('Skipping AI analysis log - database not available');
    return null;
  }

  try {
    const result = await pool.query(`
      INSERT INTO scheduling_analysis_log
        (conversation_id, prompt_id, prompt_key, input_data, output_data,
         model_used, prompt_tokens, completion_tokens, latency_ms, success, error_message)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `, [
      logData.conversationId,
      logData.promptId,
      logData.promptKey,
      JSON.stringify(logData.inputData),
      logData.outputData ? JSON.stringify(logData.outputData) : null,
      logData.modelUsed,
      logData.promptTokens,
      logData.completionTokens,
      logData.latencyMs,
      logData.success !== false,
      logData.errorMessage || null
    ]);

    return result.rows[0].id;
  } catch (error) {
    // Don't throw - logging failure shouldn't break analysis
    logger.error('Failed to log AI analysis', {
      error: error.message,
      promptKey: logData.promptKey
    });
    return null;
  }
}

/**
 * Analyze order using AI (with externalized prompt)
 * Returns equipment needs, duration estimate, and prep instructions
 *
 * @param {Object} order - Order data from webhook
 * @param {number} [conversationId] - Conversation ID for logging
 * @returns {Promise<Object>} Analysis results
 */
async function analyzeOrder(order, conversationId = null) {
  const startTime = Date.now();
  let prompt = null;

  // Check if AI is available
  const client = getAnthropicClient();
  if (!client) {
    logger.info('AI analysis skipped - client not available');
    return {
      success: false,
      error: 'AI_NOT_AVAILABLE',
      fallbackToRules: true
    };
  }

  try {
    // Get active prompt
    prompt = await getActivePrompt('order_analysis');

    // Prepare data for interpolation
    const promptData = {
      procedureDescription: order.orderDescription || '',
      cptCode: order.cptCode || order.procedures?.[0]?.cptCode || '',
      modality: order.modality || '',
      priority: order.priority || 'routine',
      clinicalIndication: order.clinicalIndication || order.indication || ''
    };

    // Interpolate placeholders
    const filledPrompt = interpolatePrompt(prompt.prompt_template, promptData);

    // Call Claude API
    const response = await client.messages.create({
      model: prompt.model,
      max_tokens: prompt.max_tokens,
      messages: [{ role: 'user', content: filledPrompt }]
    });

    const latencyMs = Date.now() - startTime;
    const outputText = response.content[0].text;

    // Parse JSON response (AI should return JSON only)
    let outputData;
    try {
      // Handle case where AI might wrap JSON in markdown code blocks
      const jsonMatch = outputText.match(/```json\s*([\s\S]*?)\s*```/) ||
                       outputText.match(/```\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : outputText;
      outputData = JSON.parse(jsonText.trim());
    } catch (parseError) {
      logger.warn('Failed to parse AI response as JSON', {
        responseText: outputText.substring(0, 500),
        error: parseError.message
      });
      throw new Error(`Invalid AI response format: ${parseError.message}`);
    }

    // Log successful analysis
    await logAnalysis({
      conversationId,
      promptId: prompt.id,
      promptKey: prompt.prompt_key,
      inputData: promptData,
      outputData,
      modelUsed: prompt.model,
      promptTokens: response.usage?.input_tokens,
      completionTokens: response.usage?.output_tokens,
      latencyMs,
      success: true
    });

    logger.info('AI order analysis completed', {
      conversationId,
      promptKey: prompt.prompt_key,
      latencyMs,
      tokensUsed: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
    });

    return {
      success: true,
      ...outputData,
      metadata: {
        promptKey: prompt.prompt_key,
        promptVersion: prompt.version,
        model: prompt.model,
        latencyMs,
        tokensUsed: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
      }
    };

  } catch (error) {
    const latencyMs = Date.now() - startTime;

    // Log failed analysis
    await logAnalysis({
      conversationId,
      promptId: prompt?.id,
      promptKey: prompt?.prompt_key || 'order_analysis',
      inputData: {
        procedureDescription: order.orderDescription,
        modality: order.modality
      },
      modelUsed: prompt?.model,
      latencyMs,
      success: false,
      errorMessage: error.message
    });

    logger.error('AI order analysis failed', {
      error: error.message,
      conversationId,
      promptKey: prompt?.prompt_key,
      latencyMs
    });

    return {
      success: false,
      error: error.message,
      fallbackToRules: true
    };
  }
}

/**
 * Analyze order for equipment requirements only
 * Lighter-weight analysis focused on equipment needs
 *
 * @param {Object} order - Order data
 * @param {number} [conversationId] - Conversation ID for logging
 * @returns {Promise<Object>} Equipment requirements
 */
async function analyzeEquipmentNeeds(order, conversationId = null) {
  const analysis = await analyzeOrder(order, conversationId);

  if (!analysis.success) {
    return {
      success: false,
      fallbackToRules: true
    };
  }

  return {
    success: true,
    equipmentNeeds: analysis.equipmentNeeds || {},
    contrastRequired: analysis.contrastRequired || false,
    contrastType: analysis.contrastType || 'None'
  };
}

/**
 * Analyze order for duration calculation
 * Returns realistic time estimates based on procedure complexity
 *
 * @param {Object} order - Order data
 * @param {Object} [patientContext] - Patient context (allergies, labs, etc.)
 * @param {number} [conversationId] - Conversation ID for logging
 * @returns {Promise<Object>} Duration breakdown
 */
async function analyzeDuration(order, patientContext = null, conversationId = null) {
  const analysis = await analyzeOrder(order, conversationId);

  if (!analysis.success) {
    return {
      success: false,
      fallbackToRules: true
    };
  }

  return {
    success: true,
    totalDurationMinutes: analysis.totalDurationMinutes || 30,
    scanTimeMinutes: analysis.scanTimeMinutes || 15,
    prepTimeMinutes: analysis.prepTimeMinutes || 10,
    breakdown: {
      prep: analysis.prepTimeMinutes || 10,
      scan: analysis.scanTimeMinutes || 15,
      post: (analysis.totalDurationMinutes || 30) - (analysis.prepTimeMinutes || 10) - (analysis.scanTimeMinutes || 15)
    }
  };
}

/**
 * Get analysis statistics for monitoring
 * @param {Object} [options] - Query options
 * @returns {Promise<Object>} Statistics
 */
async function getAnalysisStats(options = {}) {
  const pool = getPool();
  const { days = 7, promptKey = null } = options;

  const whereClause = promptKey
    ? 'WHERE created_at > NOW() - $1::interval AND prompt_key = $2'
    : 'WHERE created_at > NOW() - $1::interval';

  const params = promptKey
    ? [`${days} days`, promptKey]
    : [`${days} days`];

  const result = await pool.query(`
    SELECT
      COUNT(*) as total_calls,
      COUNT(*) FILTER (WHERE success = TRUE) as successful_calls,
      COUNT(*) FILTER (WHERE success = FALSE) as failed_calls,
      AVG(latency_ms) FILTER (WHERE success = TRUE) as avg_latency_ms,
      SUM(prompt_tokens) as total_prompt_tokens,
      SUM(completion_tokens) as total_completion_tokens,
      COUNT(DISTINCT prompt_key) as unique_prompts
    FROM scheduling_analysis_log
    ${whereClause}
  `, params);

  return result.rows[0];
}

/**
 * Get recent analysis logs for debugging
 * @param {number} [limit] - Number of logs to return
 * @returns {Promise<Array>} Recent logs
 */
async function getRecentLogs(limit = 10) {
  const pool = getPool();

  const result = await pool.query(`
    SELECT
      id, conversation_id, prompt_key, model_used,
      latency_ms, success, error_message, created_at,
      input_data->>'procedureDescription' as procedure,
      output_data->>'totalDurationMinutes' as duration_result
    FROM scheduling_analysis_log
    ORDER BY created_at DESC
    LIMIT $1
  `, [limit]);

  return result.rows;
}

module.exports = {
  // Core analysis functions
  analyzeOrder,
  analyzeEquipmentNeeds,
  analyzeDuration,

  // Prompt management
  getActivePrompt,
  getPromptByKey,
  interpolatePrompt,

  // Utilities
  isAIAvailable,
  getAnalysisStats,
  getRecentLogs,

  // For testing
  logAnalysis
};
