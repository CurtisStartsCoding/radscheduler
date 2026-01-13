/**
 * Equipment Service
 *
 * Queries equipment database and filters locations by capability.
 * Works with equipment-rules.js to determine which locations can perform
 * specific procedures based on their equipment specifications.
 */

const { getPool } = require('../db/connection');
const logger = require('../utils/logger');
const { getEquipmentRequirements, buildEquipmentWhereClause, describeRequirements } = require('./equipment-rules');

/**
 * Filter locations by equipment capability for an order
 * @param {Array} allLocations - All available locations from RIS
 * @param {Object} order - Order with orderDescription and modality
 * @returns {Promise<Array>} - Locations that can perform this procedure
 */
async function filterLocationsByCapability(allLocations, order) {
  const pool = getPool();
  const modality = (order.modality || '').toUpperCase();

  // Get equipment requirements for this order
  const requirements = getEquipmentRequirements(order);

  logger.info('Filtering locations by equipment capability', {
    orderDescription: order.orderDescription?.substring(0, 100),
    modality,
    requirements: requirements ? describeRequirements(requirements) : 'none',
    totalLocations: allLocations.length
  });

  // Build WHERE clause from requirements
  const { conditions, params } = buildEquipmentWhereClause(requirements, modality);

  try {
    // Query equipment database for capable locations
    const query = `
      SELECT DISTINCT
        sl.location_id,
        sl.name,
        sl.address,
        sl.city,
        sl.state,
        sl.phone,
        sl.timezone,
        se.equipment_type,
        se.ct_slice_count,
        se.ct_has_cardiac,
        se.ct_has_contrast_injector,
        se.mri_field_strength,
        se.mri_wide_bore,
        se.mri_has_cardiac,
        se.max_patient_weight_kg,
        se.has_bariatric_table
      FROM scheduling_locations sl
      JOIN scheduling_equipment se ON sl.location_id = se.location_id
      WHERE sl.active = TRUE
        AND ${conditions.join(' AND ')}
    `;

    const result = await pool.query(query, params);
    const capableLocationIds = new Set(result.rows.map(r => r.location_id));

    // Create a map of location equipment for later use
    const equipmentByLocation = {};
    result.rows.forEach(row => {
      equipmentByLocation[row.location_id] = {
        equipment_type: row.equipment_type,
        ct_slice_count: row.ct_slice_count,
        ct_has_cardiac: row.ct_has_cardiac,
        ct_has_contrast_injector: row.ct_has_contrast_injector,
        mri_field_strength: row.mri_field_strength,
        mri_wide_bore: row.mri_wide_bore,
        mri_has_cardiac: row.mri_has_cardiac,
        max_patient_weight_kg: row.max_patient_weight_kg,
        has_bariatric_table: row.has_bariatric_table
      };
    });

    // Filter the RIS-provided locations to only those with capability
    const capableLocations = allLocations.filter(loc => {
      const locationId = loc.id || loc.location_id;
      return capableLocationIds.has(locationId);
    });

    // Attach equipment info to each location
    capableLocations.forEach(loc => {
      const locationId = loc.id || loc.location_id;
      loc.equipment = equipmentByLocation[locationId] || null;
    });

    logger.info('Location filtering complete', {
      totalLocations: allLocations.length,
      capableLocations: capableLocations.length,
      filteredOut: allLocations.length - capableLocations.length
    });

    return capableLocations;

  } catch (error) {
    logger.error('Failed to filter locations by capability', {
      error: error.message,
      modality,
      orderDescription: order.orderDescription
    });

    // On error, return all locations (fail open for availability)
    // but log the error for investigation
    return allLocations;
  }
}

/**
 * Check if any location can handle this order
 * @param {Object} order - Order with orderDescription and modality
 * @returns {Promise<boolean>} - True if at least one location can handle it
 */
async function hasCapableLocation(order) {
  const pool = getPool();
  const modality = (order.modality || '').toUpperCase();
  const requirements = getEquipmentRequirements(order);
  const { conditions, params } = buildEquipmentWhereClause(requirements, modality);

  try {
    const query = `
      SELECT COUNT(*) as count
      FROM scheduling_locations sl
      JOIN scheduling_equipment se ON sl.location_id = se.location_id
      WHERE sl.active = TRUE
        AND ${conditions.join(' AND ')}
    `;

    const result = await pool.query(query, params);
    return parseInt(result.rows[0].count) > 0;

  } catch (error) {
    logger.error('Failed to check for capable locations', {
      error: error.message,
      modality
    });
    // Return true on error to avoid blocking scheduling
    return true;
  }
}

/**
 * Get equipment details for a specific location and modality
 * @param {string} locationId - Location ID
 * @param {string} modality - Imaging modality (CT, MRI, etc.)
 * @returns {Promise<Object|null>} - Equipment details or null
 */
async function getLocationEquipment(locationId, modality) {
  const pool = getPool();

  try {
    const result = await pool.query(`
      SELECT *
      FROM scheduling_equipment
      WHERE location_id = $1
        AND equipment_type = $2
        AND active = TRUE
      LIMIT 1
    `, [locationId, modality.toUpperCase()]);

    return result.rows.length > 0 ? result.rows[0] : null;

  } catch (error) {
    logger.error('Failed to get location equipment', {
      error: error.message,
      locationId,
      modality
    });
    return null;
  }
}

/**
 * Get all equipment at a location
 * @param {string} locationId - Location ID
 * @returns {Promise<Array>} - Array of equipment at location
 */
async function getAllEquipmentAtLocation(locationId) {
  const pool = getPool();

  try {
    const result = await pool.query(`
      SELECT *
      FROM scheduling_equipment
      WHERE location_id = $1
        AND active = TRUE
      ORDER BY equipment_type
    `, [locationId]);

    return result.rows;

  } catch (error) {
    logger.error('Failed to get all equipment at location', {
      error: error.message,
      locationId
    });
    return [];
  }
}

/**
 * Get all active locations
 * @returns {Promise<Array>} - Array of active locations
 */
async function getAllLocations() {
  const pool = getPool();

  try {
    const result = await pool.query(`
      SELECT *
      FROM scheduling_locations
      WHERE active = TRUE
      ORDER BY name
    `);

    return result.rows;

  } catch (error) {
    logger.error('Failed to get all locations', {
      error: error.message
    });
    return [];
  }
}

module.exports = {
  filterLocationsByCapability,
  hasCapableLocation,
  getLocationEquipment,
  getAllEquipmentAtLocation,
  getAllLocations
};
