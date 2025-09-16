import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function PatientSchedule() {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [message, setMessage] = useState('');

  const [formData, setFormData] = useState({
    patientName: '',
    patientPhone: '',
    patientEmail: '',
    modality: '',
    studyType: '',
    urgency: 'routine',
    notes: ''
  });

  const modalities = [
    { value: 'MRI', label: 'MRI' },
    { value: 'CT', label: 'CT Scan' },
    { value: 'X-Ray', label: 'X-Ray' },
    { value: 'Ultrasound', label: 'Ultrasound' },
    { value: 'Mammography', label: 'Mammography' }
  ];

  const studyTypes = {
    'MRI': ['Brain', 'Spine', 'Knee', 'Shoulder', 'Abdomen', 'Chest'],
    'CT': ['Head', 'Chest', 'Abdomen', 'Spine', 'Extremities'],
    'X-Ray': ['Chest', 'Spine', 'Extremities', 'Skull'],
    'Ultrasound': ['Abdomen', 'Pelvis', 'Thyroid', 'Breast', 'Vascular'],
    'Mammography': ['Screening', 'Diagnostic', '3D Tomosynthesis']
  };

  // Get available slots when date or modality changes
  useEffect(() => {
    if (selectedDate && formData.modality) {
      fetchAvailableSlots();
    }
  }, [selectedDate, formData.modality]);

  const fetchAvailableSlots = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `http://localhost:3010/api/patient/available-slots?date=${selectedDate}&modality=${formData.modality}`
      );
      const data = await response.json();
      
      if (data.success) {
        setAvailableSlots(data.availableSlots);
      } else {
        setMessage('Error loading available slots');
      }
    } catch (error) {
      setMessage('Failed to load available slots');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBooking(true);
    setMessage('');

    try {
      const response = await fetch('http://localhost:3010/api/patient/book-appointment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          preferredDate: selectedDate,
          preferredTime: selectedTime
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setMessage(`Appointment scheduled successfully! Confirmation #${data.appointmentId}`);
        // Reset form
        setFormData({
          patientName: '',
          patientPhone: '',
          patientEmail: '',
          modality: '',
          studyType: '',
          urgency: 'routine',
          notes: ''
        });
        setSelectedDate('');
        setSelectedTime('');
        setAvailableSlots([]);
      } else {
        setMessage(data.error || 'Failed to schedule appointment');
      }
    } catch (error) {
      setMessage('Failed to schedule appointment');
    } finally {
      setBooking(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <Head>
        <title>Schedule Your Appointment - RadScheduler</title>
        <meta name="description" content="Schedule your radiology appointment online" />
      </Head>

      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Schedule Your Radiology Appointment
          </h1>
          <p className="text-lg text-gray-600">
            Book your appointment online - quick, easy, and convenient
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Patient Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name *
                </label>
                <input
                  type="text"
                  name="patientName"
                  value={formData.patientName}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter your full name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  name="patientPhone"
                  value={formData.patientPhone}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="+1234567890"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email (Optional)
                </label>
                <input
                  type="email"
                  name="patientEmail"
                  value={formData.patientEmail}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Urgency
                </label>
                <select
                  name="urgency"
                  value={formData.urgency}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="routine">Routine</option>
                  <option value="urgent">Urgent</option>
                  <option value="emergency">Emergency</option>
                </select>
              </div>
            </div>

            {/* Study Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Modality *
                </label>
                <select
                  name="modality"
                  value={formData.modality}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select modality</option>
                  {modalities.map(mod => (
                    <option key={mod.value} value={mod.value}>{mod.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Study Type *
                </label>
                <select
                  name="studyType"
                  value={formData.studyType}
                  onChange={handleInputChange}
                  required
                  disabled={!formData.modality}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                >
                  <option value="">Select study type</option>
                  {formData.modality && studyTypes[formData.modality]?.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Date and Time Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Preferred Date *
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  required
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Preferred Time *
                </label>
                <select
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  required
                  disabled={availableSlots.length === 0}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                >
                  <option value="">Select time</option>
                  {availableSlots.map(slot => (
                    <option key={slot.datetime} value={slot.time}>
                      {slot.time}
                    </option>
                  ))}
                </select>
                {loading && <p className="text-sm text-gray-500 mt-1">Loading available times...</p>}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Additional Notes (Optional)
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Any special instructions or notes..."
              />
            </div>

            {/* Message Display */}
            {message && (
              <div className={`p-4 rounded-md ${
                message.includes('successfully') 
                  ? 'bg-green-50 text-green-800 border border-green-200' 
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {message}
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-center">
              <button
                type="submit"
                disabled={booking || !selectedDate || !selectedTime}
                className="px-8 py-3 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {booking ? 'Scheduling...' : 'Schedule Appointment'}
              </button>
            </div>
          </form>
        </div>

        {/* Information Section */}
        <div className="mt-8 bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Important Information</h3>
          <ul className="space-y-2 text-gray-600">
            <li>• Please arrive 15 minutes before your scheduled appointment time</li>
            <li>• Bring your ID and insurance information</li>
            <li>• You will receive a confirmation SMS with your appointment details</li>
            <li>• Business hours: Monday-Friday, 8:00 AM - 6:00 PM</li>
            <li>• For urgent appointments, please call our office directly</li>
          </ul>
        </div>
      </div>
    </div>
  );
} 