const axios = require('axios');
const logger = require('../utils/logger');

/**
 * RIS API Client - Interface with QIE REST Endpoints
 * QIE handles ALL RIS communication, RadScheduler just calls REST APIs
 * Implements retry logic with exponential backoff
 */

const QIE_API_URL = process.env.QIE_API_URL || 'http://10.0.1.211:8082/api/ris';
const QIE_API_KEY = process.env.QIE_API_KEY;
const QIE_TIMEOUT_MS = parseInt(process.env.QIE_TIMEOUT_MS) || 5000;
const MAX_RETRY_ATTEMPTS = parseInt(process.env.SMS_MAX_RETRY_ATTEMPTS) || 3;
const USE_MOCK_RIS = process.env.USE_MOCK_RIS === 'true' || !process.env.QIE_API_URL;

/**
 * Create axios instance with default config
 */
const qieClient = axios.create({
  baseURL: QIE_API_URL,
  timeout: QIE_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
    ...(QIE_API_KEY && { 'X-API-Key': QIE_API_KEY })
  }
});

/**
 * Retry with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} attempt - Current attempt number
 * @returns {Promise} - Result of function
 */
async function retryWithBackoff(fn, attempt = 1) {
  try {
    return await fn();
  } catch (error) {
    if (attempt >= MAX_RETRY_ATTEMPTS) {
      throw error;
    }

    const delayMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
    logger.warn(`RIS API call failed, retrying in ${delayMs}ms`, {
      attempt,
      maxAttempts: MAX_RETRY_ATTEMPTS,
      error: error.message
    });

    await new Promise(resolve => setTimeout(resolve, delayMs));
    return retryWithBackoff(fn, attempt + 1);
  }
}

/**
 * Mock data for testing when RIS is not available
 */
function getMockLocations(modality) {
  logger.info('Using MOCK locations data', { modality });
  return [
    { id: 'LOC001', name: 'Main Campus Imaging', address: '123 Medical Plaza, Fort Myers, FL' },
    { id: 'LOC002', name: 'South Fort Myers Clinic', address: '456 Healthcare Blvd, Fort Myers, FL' },
    { id: 'LOC003', name: 'Cape Coral Imaging Center', address: '789 Wellness Dr, Cape Coral, FL' }
  ];
}

function getMockTimeSlots(locationId, modality, startDate, endDate) {
  logger.info('Using MOCK time slots data', { locationId, modality });

  // Generate realistic appointment times (9 AM, 2 PM, 10 AM over next 3 days)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0); // 9:00 AM tomorrow

  const dayAfter = new Date();
  dayAfter.setDate(dayAfter.getDate() + 2);
  dayAfter.setHours(14, 0, 0, 0); // 2:00 PM day after tomorrow

  const threeDays = new Date();
  threeDays.setDate(threeDays.getDate() + 3);
  threeDays.setHours(10, 0, 0, 0); // 10:00 AM in 3 days

  return [
    { startTime: tomorrow.toISOString(), duration: 30 },
    { startTime: dayAfter.toISOString(), duration: 30 },
    { startTime: threeDays.toISOString(), duration: 30 }
  ];
}

function getMockBookingConfirmation(bookingData) {
  logger.info('Using MOCK booking confirmation', { orderId: bookingData.orderId });
  return {
    confirmationNumber: `CONF-${Date.now()}`,
    appointmentId: `APPT-${Date.now()}`,
    status: 'confirmed'
  };
}

/**
 * Get available locations for imaging
 * @param {string} modality - Imaging modality (e.g., 'CT', 'MRI', 'X-RAY')
 * @returns {Promise<Array>} - List of available locations
 */
async function getLocations(modality) {
  // Use mock data if RIS not configured
  if (USE_MOCK_RIS) {
    return getMockLocations(modality);
  }

  return retryWithBackoff(async () => {
    try {
      logger.info('Fetching available locations from QIE', { modality });

      // Use Channel 8082 for location queries (same channel as schedule requests)
      const response = await axios.post('http://10.0.1.211:8082', {
        modality: modality
      });

      logger.info('Locations retrieved from QIE', {
        modality,
        locationCount: response.data.locations?.length || 0
      });

      return response.data.locations || [];
    } catch (error) {
      logger.error('Failed to get locations from QIE', {
        modality,
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText
      });
      throw error;
    }
  });
}

/**
 * Get available time slots for a location and modality
 * @param {string} locationId - Location identifier
 * @param {string} modality - Imaging modality
 * @param {Date} startDate - Start date for availability search
 * @param {Date} endDate - End date for availability search
 * @returns {Promise<Array>} - List of available time slots
 */


/**
 * Fetch available time slots for scheduling
 * @param {string} locationId - Location identifier
 * @param {string} modality - Imaging modality
 * @param {Date} startDate - Start date for availability search
 * @param {Date} endDate - End date for availability search
 * @param {Object} patientData - Patient demographics from webhook
 * @param {string[]} orderIds - Array of order IDs to schedule
 * @returns {Promise<Array>} - List of available time slots
 */
async function getAvailableSlots(locationId, modality, startDate, endDate, patientData = {}, orderIds = []) {
  // Use mock data if RIS not configured
  if (USE_MOCK_RIS) {
    return getMockTimeSlots(locationId, modality, startDate, endDate);
  }

  return retryWithBackoff(async () => {
    try {
      // Parse patient name if needed (format: "LastName^FirstName" or "First Last")
      let firstName = patientData.firstName || '';
      let lastName = patientData.lastName || '';

      if (!firstName && !lastName && patientData.patientName) {
        const nameParts = patientData.patientName.split(/[\s^]+/);
        if (nameParts.length >= 2) {
          firstName = nameParts[0];
          lastName = nameParts[nameParts.length - 1];
        }
      }

      // QIE Channel 8082 expects JSON POST with schedule request
      const payload = {
        orderIds: orderIds,
        patientMrn: patientData.patientMrn || patientData.mrn || '',
        firstName: firstName,
        lastName: lastName,
        dateOfBirth: patientData.patientDob || patientData.dob || '',
        gender: patientData.patientGender || patientData.gender || '',
        requestedDate: startDate.toISOString().split('T')[0], // YYYY-MM-DD
        modality: modality.toUpperCase(),
        cptCodes: [],
        locationId: locationId // Add location ID for filtering
      };

      logger.info('Requesting slots from QIE', {
        modality,
        requestedDate: payload.requestedDate,
        orderIds: orderIds,
        patientMrn: payload.patientMrn
      });

      // POST directly to QIE port 8082 (no path)
      const response = await axios.post('http://10.0.1.211:8082', payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: QIE_TIMEOUT_MS
      });

      logger.info('Schedule request submitted to QIE', {
        success: response.data.success,
        messageControlId: response.data.messageControlId
      });

      // NOTE: Slots will arrive asynchronously via webhook
      // at /api/webhooks/hl7/schedule-response
      // For now, return empty array and rely on webhook flow
      return [];

    } catch (error) {
      logger.error('Failed to request slots from QIE', {
        error: error.message,
        status: error.response?.status
      });
      throw error;
    }
  });
}
async function bookAppointment(bookingData) {
  // Use mock data if RIS not configured
  if (USE_MOCK_RIS) {
    return getMockBookingConfirmation(bookingData);
  }

  return retryWithBackoff(async () => {
    try {
      // Support both single orderId and orderIds array
      const orderIds = Array.isArray(bookingData.orderIds)
        ? bookingData.orderIds
        : [bookingData.orderId || bookingData.orderIds];

      logger.info('Booking appointment via QIE Channel 8085', {
        orderIds,
        orderCount: orderIds.length,
        location: bookingData.locationId,
        modality: bookingData.modality,
        datetime: bookingData.appointmentTime
      });

      // QIE Channel 8085 (Appointment Booking Requests) expects JSON POST
      // Similar to Channel 8082 (slot requests), this sends to QIE and
      // confirmation will arrive via Channel 8084 webhook
      const payload = {
        orderIds,
        patientMrn: bookingData.patientMrn || '',
        patientPhone: bookingData.phoneNumber,
        patientName: bookingData.patientName || 'Patient',
        modality: bookingData.modality.toUpperCase(),
        locationId: bookingData.locationId,
        slotId: bookingData.slotId,
        appointmentTime: bookingData.appointmentTime
      };

      // POST to QIE Channel 8085 (booking requests)
      const response = await axios.post('http://10.0.1.211:8085', payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: QIE_TIMEOUT_MS
      });

      logger.info('Booking request submitted to QIE', {
        success: response.data.success,
        messageControlId: response.data.messageControlId
      });

      // NOTE: Booking confirmation will arrive asynchronously via webhook
      // at /api/webhooks/hl7/appointment-notification (Channel 8084)
      // Webhook handler will send SMS confirmation to patient
      // Return pending status for now
      return {
        confirmationNumber: 'PENDING',
        appointmentId: response.data.messageControlId,
        orderIds,
        status: 'pending'
      };
    } catch (error) {
      logger.error('Failed to submit booking request to QIE', {
        error: error.message,
        status: error.response?.status,
        errorData: error.response?.data
      });
      throw error;
    }
  });
}

/**
 * Cancel an appointment in the RIS via QIE
 * @param {string} appointmentId - Appointment ID to cancel
 * @param {string} reason - Cancellation reason
 * @returns {Promise<Object>} - Cancellation confirmation
 */
async function cancelAppointment(appointmentId, reason = 'Patient requested cancellation') {
  return retryWithBackoff(async () => {
    try {
      logger.info('Cancelling appointment via QIE', {
        appointmentId,
        reason
      });

      const response = await qieClient.post('/cancel-appointment', {
        appointmentId,
        reason,
        source: 'SMS_SELF_SCHEDULING'
      });

      logger.info('Appointment cancelled successfully via QIE', {
        appointmentId
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to cancel appointment via QIE', {
        appointmentId,
        error: error.message,
        status: error.response?.status
      });
      throw error;
    }
  });
}

/**
 * Get order details from RIS via QIE
 * @param {string} orderId - RIS order ID
 * @returns {Promise<Object>} - Order details
 */
async function getOrderDetails(orderId) {
  return retryWithBackoff(async () => {
    try {
      logger.info('Fetching order details from QIE', { orderId });

      const response = await qieClient.get(`/orders/${orderId}`);

      logger.info('Order details retrieved from QIE', {
        orderId,
        modality: response.data.modality,
        priority: response.data.priority
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get order details from QIE', {
        orderId,
        error: error.message,
        status: error.response?.status
      });
      throw error;
    }
  });
}

/**
 * Health check for QIE API
 * @returns {Promise<boolean>} - True if QIE is healthy
 */
async function healthCheck() {
  try {
    const response = await qieClient.get('/health', { timeout: 2000 });
    return response.status === 200;
  } catch (error) {
    logger.error('QIE health check failed', {
      error: error.message
    });
    return false;
  }
}

module.exports = {
  getLocations,
  getAvailableSlots,
  bookAppointment,
  cancelAppointment,
  getOrderDetails,
  healthCheck
};
