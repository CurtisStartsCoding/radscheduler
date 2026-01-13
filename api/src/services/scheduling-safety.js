/**
 * Scheduling Safety Service
 *
 * Validates patient context for contraindications before allowing scheduling.
 * This service checks:
 *   - Contrast allergies (type MC or allergen matches contrast/iodine)
 *   - Renal function (eGFR levels)
 *   - Recent contrast administration (7-day rule)
 *
 * Returns warnings (proceed with caution) and blocks (route to coordinator).
 */

const logger = require('../utils/logger');

/**
 * Check patient safety for scheduling
 * @param {Object} order - Order object with orderDescription and patientContext
 * @returns {Object} - { warnings, blocks, canProceed, minScheduleDate }
 */
function checkSchedulingSafety(order) {
  const warnings = [];
  const blocks = [];

  const ctx = order.patientContext;
  if (!ctx) {
    logger.debug('No patient context provided, skipping safety checks');
    return { warnings, blocks, canProceed: true, minScheduleDate: null };
  }

  logger.info('Running safety checks', {
    orderId: order.orderId,
    orderDescription: order.orderDescription?.substring(0, 100),
    hasAllergies: !!(ctx.allergies?.length),
    hasLabs: !!(ctx.labs?.length),
    hasPriorImaging: !!(ctx.priorImaging?.length)
  });

  // 1. Check contrast allergy
  if (orderRequiresContrast(order)) {
    const contrastAllergy = ctx.allergies?.find(a =>
      a.type === 'MC' ||
      a.allergen?.toLowerCase().includes('contrast') ||
      a.allergen?.toLowerCase().includes('iodine') ||
      a.allergen?.toLowerCase().includes('gadolinium')
    );

    if (contrastAllergy) {
      if (contrastAllergy.severity === 'SV') {
        blocks.push({
          reason: 'CONTRAST_ALLERGY_SEVERE',
          message: 'You have a severe contrast allergy on file. A scheduling coordinator will call you to discuss options.',
          details: {
            allergen: contrastAllergy.allergen,
            severity: 'Severe',
            reaction: contrastAllergy.reaction
          }
        });
        logger.warn('Safety block: Severe contrast allergy', {
          orderId: order.orderId,
          allergen: contrastAllergy.allergen
        });
      } else {
        warnings.push({
          reason: 'CONTRAST_ALLERGY',
          message: 'Note: You have a contrast allergy on file. Pre-medication may be required.',
          details: {
            allergen: contrastAllergy.allergen,
            severity: contrastAllergy.severity === 'MO' ? 'Moderate' : 'Mild',
            reaction: contrastAllergy.reaction
          }
        });
        logger.info('Safety warning: Contrast allergy', {
          orderId: order.orderId,
          severity: contrastAllergy.severity
        });
      }
    }
  }

  // 2. Check renal function (eGFR)
  if (orderRequiresContrast(order)) {
    const egfr = ctx.labs?.find(l =>
      l.code === '33914-3' ||
      l.name?.toLowerCase().includes('egfr') ||
      l.name?.toLowerCase().includes('gfr')
    );

    if (egfr) {
      const egfrValue = parseFloat(egfr.value);
      const labDate = egfr.date;
      const daysSinceLab = labDate ? daysSince(labDate) : null;

      if (!isNaN(egfrValue)) {
        if (egfrValue < 30) {
          blocks.push({
            reason: 'RENAL_FUNCTION_CRITICAL',
            message: 'Your kidney function requires review before contrast imaging. A coordinator will call you.',
            details: {
              eGFR: egfrValue,
              labDate,
              threshold: 30
            }
          });
          logger.warn('Safety block: Critical renal function', {
            orderId: order.orderId,
            eGFR: egfrValue
          });
        } else if (egfrValue < 45) {
          warnings.push({
            reason: 'RENAL_FUNCTION_LOW',
            message: 'Note: Your kidney function is slightly reduced. Extra precautions will be taken with contrast.',
            details: {
              eGFR: egfrValue,
              labDate,
              threshold: 45
            }
          });
          logger.info('Safety warning: Low renal function', {
            orderId: order.orderId,
            eGFR: egfrValue
          });
        }

        // Additional warning if labs are old (> 30 days)
        if (daysSinceLab !== null && daysSinceLab > 30) {
          warnings.push({
            reason: 'LABS_OUTDATED',
            message: `Note: Your kidney function labs are ${daysSinceLab} days old. Updated labs may be required.`,
            details: {
              labDate,
              daysSince: daysSinceLab
            }
          });
        }
      }
    }
  }

  // 3. Check recent contrast (7-day rule)
  if (orderRequiresContrast(order)) {
    const recentContrast = ctx.priorImaging?.find(i =>
      i.hadContrast && daysSince(i.date) < 7
    );

    if (recentContrast) {
      const daysSinceContrast = daysSince(recentContrast.date);
      const waitDays = 7 - daysSinceContrast;
      const minDate = addDays(new Date(), waitDays);

      warnings.push({
        reason: 'RECENT_CONTRAST',
        message: `You had a contrast exam ${daysSinceContrast} days ago. We'll schedule your appointment ${waitDays}+ days out to ensure safety.`,
        minScheduleDate: minDate,
        details: {
          priorExam: recentContrast.modality,
          priorDate: recentContrast.date,
          waitDays
        }
      });
      logger.info('Safety warning: Recent contrast', {
        orderId: order.orderId,
        daysSinceContrast,
        minScheduleDate: minDate.toISOString()
      });
    }
  }

  const result = {
    warnings,
    blocks,
    canProceed: blocks.length === 0,
    minScheduleDate: warnings.find(w => w.minScheduleDate)?.minScheduleDate || null
  };

  logger.info('Safety check complete', {
    orderId: order.orderId,
    warningCount: warnings.length,
    blockCount: blocks.length,
    canProceed: result.canProceed
  });

  return result;
}

/**
 * Check if order requires contrast administration
 * @param {Object} order - Order object with orderDescription
 * @returns {boolean} - True if contrast is required
 */
function orderRequiresContrast(order) {
  const desc = (order.orderDescription || '').toUpperCase();

  // Patterns indicating contrast is required
  const contrastPatterns = [
    /WITH\s*(IV\s*)?CONTRAST/,
    /W\/?\s*CONTRAST/,
    /W\/C\b/,
    /CONTRAST\s*ENHANCED/,
    /\bCTA\b/,                    // CT Angiography always uses contrast
    /\bMRA\b/,                    // MR Angiography typically uses contrast
    /WITH\s*GAD/,                 // Gadolinium
    /\+\s*C\b/,                   // +C notation
    /ANGIOGRAPH/                  // Angiography
  ];

  // Check if any pattern matches
  const requiresContrast = contrastPatterns.some(pattern => pattern.test(desc));

  // Also check explicit non-contrast indicators
  const noContrastPatterns = [
    /WITHOUT\s*CONTRAST/,
    /W\/O\s*CONTRAST/,
    /NON[\s-]*CONTRAST/,
    /-C\b/,
    /W\/O\s*C\b/
  ];

  const explicitlyNoContrast = noContrastPatterns.some(pattern => pattern.test(desc));

  return requiresContrast && !explicitlyNoContrast;
}

/**
 * Calculate days since a date
 * @param {string|Date} dateString - Date to calculate from
 * @returns {number} - Number of days since the date
 */
function daysSince(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Add days to a date
 * @param {Date} date - Base date
 * @param {number} days - Days to add
 * @returns {Date} - New date
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Format safety result for SMS messaging
 * @param {Object} safetyResult - Result from checkSchedulingSafety
 * @returns {string} - Formatted message for patient
 */
function formatSafetyMessages(safetyResult) {
  const messages = [];

  // Add block messages first
  safetyResult.blocks.forEach(block => {
    messages.push(block.message);
  });

  // Add warning messages
  safetyResult.warnings.forEach(warning => {
    messages.push(warning.message);
  });

  return messages.join('\n\n');
}

module.exports = {
  checkSchedulingSafety,
  orderRequiresContrast,
  formatSafetyMessages,
  daysSince,
  addDays
};
