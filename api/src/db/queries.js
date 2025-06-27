const { getPool } = require('./connection');
const logger = require('../utils/logger');

async function createAppointment(appointmentData) {
  const pool = getPool();
  
  try {
    const query = `
      INSERT INTO appointments (
        patient_id, patient_name, patient_phone, modality, 
        study_type, datetime, duration, status, 
        referring_physician, urgency, notes, conflicts, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;
    
    const values = [
      appointmentData.patientId,
      appointmentData.patientName,
      appointmentData.patientPhone,
      appointmentData.modality,
      appointmentData.studyType,
      appointmentData.datetime,
      appointmentData.duration || 30,
      appointmentData.status || 'SCHEDULED',
      appointmentData.referringPhysician,
      appointmentData.urgency || 'routine',
      appointmentData.notes,
      appointmentData.conflicts ? JSON.stringify(appointmentData.conflicts) : null,
      appointmentData.source || 'HL7'
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    logger.error('Error creating appointment:', error);
    throw error;
  }
}

async function getAppointment(id) {
  const pool = getPool();
  
  try {
    const result = await pool.query(
      'SELECT * FROM appointments WHERE id = $1',
      [id]
    );
    return result.rows[0];
  } catch (error) {
    logger.error('Error getting appointment:', error);
    throw error;
  }
}

async function getAppointments(filters = {}) {
  const pool = getPool();
  
  try {
    let query = 'SELECT * FROM appointments WHERE 1=1';
    const values = [];
    let paramCount = 0;
    
    if (filters.date) {
      paramCount++;
      query += ` AND DATE(datetime) = $${paramCount}`;
      values.push(filters.date);
    }
    
    if (filters.modality) {
      paramCount++;
      query += ` AND modality = $${paramCount}`;
      values.push(filters.modality);
    }
    
    if (filters.status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      values.push(filters.status);
    }
    
    query += ' ORDER BY datetime ASC';
    
    const result = await pool.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error('Error getting appointments:', error);
    throw error;
  }
}

async function updateAppointment(id, updates) {
  const pool = getPool();
  
  try {
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    
    const setClause = fields.map((field, index) => 
      `${field} = $${index + 2}`
    ).join(', ');
    
    const query = `
      UPDATE appointments 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await pool.query(query, [id, ...values]);
    return result.rows[0];
  } catch (error) {
    logger.error('Error updating appointment:', error);
    throw error;
  }
}

async function getPatientHistory(patientId) {
  const pool = getPool();
  
  try {
    const result = await pool.query(
      `SELECT * FROM appointments 
       WHERE patient_id = $1 
       ORDER BY datetime DESC 
       LIMIT 10`,
      [patientId]
    );
    return result.rows;
  } catch (error) {
    logger.error('Error getting patient history:', error);
    throw error;
  }
}

async function getStats(date) {
  const pool = getPool();
  
  try {
    const dateFilter = date || new Date().toISOString().split('T')[0];
    
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'SCHEDULED' THEN 1 END) as scheduled,
        COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled,
        AVG(duration) as avg_duration
      FROM appointments
      WHERE DATE(datetime) = $1
    `, [dateFilter]);
    
    return result.rows[0];
  } catch (error) {
    logger.error('Error getting stats:', error);
    throw error;
  }
}

module.exports = {
  createAppointment,
  getAppointment,
  getAppointments,
  updateAppointment,
  getPatientHistory,
  getStats
};