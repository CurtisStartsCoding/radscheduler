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
  const now = new Date();
  return [
    { startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), duration: 30 },
    { startTime: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(), duration: 30 },
    { startTime: new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString(), duration: 30 }
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

      const response = await qieClient.get('/locations', {
        params: { modality }
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
async function getAvailableSlots(locationId, modality, startDate, endDate) {
  // Use mock data if RIS not configured
  if (USE_MOCK_RIS) {
    return getMockTimeSlots(locationId, modality, startDate, endDate);
  }

  return retryWithBackoff(async () => {
    try {
      logger.info('Fetching available slots from QIE', {
        locationId,
        modality,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });

      const response = await qieClient.get('/available-slots', {
        params: {
          locationId,
          modality,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        }
      });

      logger.info('Slots retrieved from QIE', {
        locationId,
        modality,
        slotCount: response.data.slots?.length || 0
      });

      return response.data.slots || [];
    } catch (error) {
      logger.error('Failed to get available slots from QIE', {
        locationId,
        modality,
        error: error.message,
        status: error.response?.status
      });
      throw error;
    }
  });
}

/**
 * Book an appointment in the RIS via QIE
 * @param {Object} bookingData - Appointment booking data
 * @param {string} bookingData.orderId - RIS order ID
 * @param {string} bookingData.patientId - Patient identifier
 * @param {string} bookingData.locationId - Location ID
 * @param {string} bookingData.modality - Imaging modality
 * @param {string} bookingData.appointmentTime - ISO timestamp for appointment
 * @param {string} bookingData.phoneNumber - Patient phone number (for confirmation)
 * @returns {Promise<Object>} - Booking confirmation
 */
async function bookAppointment(bookingData) {
  // Use mock data if RIS not configured
  if (USE_MOCK_RIS) {
    return getMockBookingConfirmation(bookingData);
  }

  return retryWithBackoff(async () => {
    try {
      logger.info('Booking appointment via QIE', {
        orderId: bookingData.orderId,
        locationId: bookingData.locationId,
        modality: bookingData.modality,
        appointmentTime: bookingData.appointmentTime
      });

      const response = await qieClient.post('/book-appointment', {
        orderId: bookingData.orderId,
        patientId: bookingData.patientId,
        locationId: bookingData.locationId,
        modality: bookingData.modality,
        appointmentTime: bookingData.appointmentTime,
        phoneNumber: bookingData.phoneNumber,
        source: 'SMS_SELF_SCHEDULING'
      });

      logger.info('Appointment booked successfully via QIE', {
        orderId: bookingData.orderId,
        confirmationNumber: response.data.confirmationNumber,
        appointmentId: response.data.appointmentId
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to book appointment via QIE', {
        orderId: bookingData.orderId,
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
