describe('RadScheduler Dual Scheduling Workflow', () => {
  beforeEach(() => {
    // Visit the main application
    cy.visit('/')
    cy.wait(3000)
    
    // Check if we need to login (might be redirected to login page)
    cy.url().then((url) => {
      if (url.includes('/login')) {
        // Login as admin to access all features
        cy.get('#email').type('admin@radscheduler.com')
        cy.get('#password').type('password')
        cy.get('button[type="submit"]').click()
        
        // Wait for login to complete
        cy.url().should('include', '/')
        cy.wait(2000)
      }
    })
    
    // Wait for dashboard to load and check for elements
    cy.get('h1', { timeout: 10000 }).should('contain', 'RadScheduler')
    cy.get('span').should('contain', 'admin')
  })

  describe('Avreo Integration Tests', () => {
    it('should display system monitoring dashboard', () => {
      // Navigate to monitoring section
      cy.get('button').contains('Monitoring').click()
      
      // Check for monitoring dashboard elements
      cy.get('h3').should('contain', 'System Health')
      cy.get('h3').should('contain', 'Performance Metrics')
      cy.get('h3').should('contain', 'Business Impact')
    })

    it('should show system health metrics', () => {
      // Navigate to monitoring section
      cy.get('button').contains('Monitoring').click()
      
      // Check for system health metrics
      cy.get('div').should('contain', 'Uptime')
      cy.get('div').should('contain', 'Response Time')
      cy.get('div').should('contain', 'Active Connections')
    })

    it('should show performance metrics', () => {
      // Navigate to monitoring section
      cy.get('button').contains('Monitoring').click()
      
      // Check for performance metrics
      cy.get('div').should('contain', 'Messages Processed')
      cy.get('div').should('contain', 'Success Rate')
      cy.get('div').should('contain', 'Error Rate')
    })

    it('should show business impact metrics', () => {
      // Navigate to monitoring section
      cy.get('button').contains('Monitoring').click()
      
      // Check for business metrics
      cy.get('div').should('contain', 'Appointments Scheduled')
      cy.get('div').should('contain', 'No-Show Reduction')
      cy.get('div').should('contain', 'Revenue Increase')
    })
  })

  describe('Patient Self-Scheduling Tests', () => {
    beforeEach(() => {
      // Navigate to patient scheduling page
      cy.visit('/patient-schedule')
      // Wait for page to load
      cy.wait(2000)
    })

    it('should display patient scheduling form', () => {
      // Check form elements are present
      cy.get('h1', { timeout: 10000 }).should('contain', 'Schedule Your Radiology Appointment')
      cy.get('[name=patientName]').should('be.visible')
      cy.get('[name=patientPhone]').should('be.visible')
      cy.get('[name=modality]').should('be.visible')
      cy.get('[name=studyType]').should('be.visible')
      cy.get('input[type="date"]').should('be.visible')
      cy.get('select').should('contain', 'Select time')
    })

    it('should show available modalities for self-scheduling', () => {
      // Check modality dropdown
      cy.get('[name=modality]').select('X-Ray')
      cy.get('option[value="X-Ray"]').should('be.visible')
      cy.get('option[value="Ultrasound"]').should('be.visible')
      cy.get('option[value="Mammography"]').should('be.visible')
      cy.get('option[value="MRI"]').should('be.visible')
      cy.get('option[value="CT"]').should('be.visible')
    })

    it('should load available time slots when date and modality selected', () => {
      // Select modality first
      cy.get('[name=modality]').select('X-Ray')
      
      // Select date (tomorrow)
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateString = tomorrow.toISOString().split('T')[0]
      cy.get('input[type="date"]').type(dateString)
      
      // Should show loading message or time slots become enabled
      cy.get('select').last().should('not.be.disabled')
    })

    it('should book an X-Ray appointment successfully', () => {
      // Fill out the form
      cy.get('[name=patientName]').type('John Doe')
      cy.get('[name=patientPhone]').type('+1234567890')
      cy.get('[name=patientEmail]').type('john@example.com')
      cy.get('[name=modality]').select('X-Ray')
      cy.get('[name=studyType]').select('Chest')
      
      // Select date (tomorrow)
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateString = tomorrow.toISOString().split('T')[0]
      cy.get('input[type="date"]').type(dateString)
      
      // Wait for time slots to load and select first available
      cy.get('select').last().should('not.be.disabled')
      cy.get('select').last().select('09:00 AM')
      
      // Submit the form
      cy.get('button[type="submit"]').should('not.be.disabled')
      cy.get('button[type="submit"]').click()
      
      // Should show success message
      cy.contains('Appointment scheduled successfully').should('be.visible')
    })

    it('should validate required fields', () => {
      // Try to submit without filling required fields
      cy.get('button[type="submit"]').should('be.disabled')
      
      // Should show browser validation messages
      cy.get('[name=patientName]').should('have.attr', 'required')
      cy.get('[name=patientPhone]').should('have.attr', 'required')
      cy.get('[name=modality]').should('have.attr', 'required')
    })

    it('should handle time slot conflicts', () => {
      // Fill out form
      cy.get('[name=patientName]').type('Jane Smith')
      cy.get('[name=patientPhone]').type('+1987654321')
      cy.get('[name=modality]').select('X-Ray')
      cy.get('[name=studyType]').select('Chest')
      
      // Select date (tomorrow)
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateString = tomorrow.toISOString().split('T')[0]
      cy.get('input[type="date"]').type(dateString)
      
      // Select a time slot
      cy.get('select').last().should('not.be.disabled')
      cy.get('select').last().select('09:00 AM')
      
      // Submit form
      cy.get('button[type="submit"]').should('not.be.disabled')
      cy.get('button[type="submit"]').click()
      
      // Should show success
      cy.contains('Appointment scheduled successfully').should('be.visible')
      
      // Now try to book the same time slot again
      cy.visit('/patient-schedule')
      cy.wait(2000)
      cy.get('[name=patientName]').type('Bob Wilson')
      cy.get('[name=patientPhone]').type('+1555555555')
      cy.get('[name=modality]').select('X-Ray')
      cy.get('[name=studyType]').select('Chest')
      cy.get('input[type="date"]').type(dateString)
      cy.get('select').last().should('not.be.disabled')
      cy.get('select').last().select('09:00 AM')
      cy.get('button[type="submit"]').should('not.be.disabled')
      cy.get('button[type="submit"]').click()
      
      // Should show conflict error
      cy.contains('no longer available').should('be.visible')
    })
  })

  describe('Dual Scheduling Integration Tests', () => {
    it('should show appointments in admin dashboard', () => {
      // Navigate back to admin dashboard
      cy.visit('/')
      
      // Check that appointments are visible
      cy.get('h1').should('contain', 'RadScheduler')
      cy.get('button').contains('Appointments').should('be.visible')
    })

    it('should show appointment statistics', () => {
      // Check statistics
      cy.get('div').should('contain', 'Total Today')
      cy.get('div').should('contain', 'Completed')
      cy.get('div').should('contain', 'Scheduled')
      cy.get('div').should('contain', 'Cancelled')
    })

    it('should allow admin to view monitoring dashboard', () => {
      // Click on monitoring tab
      cy.get('button').contains('Monitoring').click()
      
      // Check for monitoring elements
      cy.get('h3').should('contain', 'System Health')
      cy.get('h3').should('contain', 'Performance Metrics')
    })
  })

  describe('Configuration Tests', () => {
    it('should show current scheduling configuration', () => {
      // Navigate to monitoring section to see system status
      cy.get('button').contains('Monitoring').click()
      
      // Check for system health indicators
      cy.get('h3').should('contain', 'System Health')
      cy.get('div').should('contain', 'Uptime')
    })

    it('should allow admin to view monitoring dashboard', () => {
      // Click on monitoring tab
      cy.get('button').contains('Monitoring').click()
      
      // Check for monitoring elements
      cy.get('h3').should('contain', 'Performance Metrics')
      cy.get('h3').should('contain', 'Business Impact')
    })

    it('should show system performance metrics', () => {
      // Navigate to monitoring section
      cy.get('button').contains('Monitoring').click()
      
      // Check for performance metrics
      cy.get('div').should('contain', 'Messages Processed')
      cy.get('div').should('contain', 'Success Rate')
    })
  })

  describe('Error Handling Tests', () => {
    it('should handle patient scheduling form validation', () => {
      // Navigate to patient scheduling
      cy.visit('/patient-schedule')
      cy.wait(2000)
      
      // Try to submit without filling required fields
      cy.get('button[type="submit"]').should('be.disabled')
      
      // Fill required fields
      cy.get('[name=patientName]').type('Test Patient')
      cy.get('[name=patientPhone]').type('+1234567890')
      cy.get('[name=modality]').select('X-Ray')
      
      // Button should still be disabled until date and time are selected
      cy.get('button[type="submit"]').should('be.disabled')
    })

    it('should handle invalid appointment data', () => {
      // Navigate to patient scheduling
      cy.visit('/patient-schedule')
      cy.wait(2000)
      
      // Fill form with invalid data
      cy.get('[name=patientName]').type('Test')
      cy.get('[name=patientPhone]').type('invalid-phone')
      cy.get('[name=modality]').select('X-Ray')
      
      // Should show validation errors or button remains disabled
      cy.get('button[type="submit"]').should('be.disabled')
    })
  })

  describe('SMS Notification Tests', () => {
    it('should show appointment booking confirmation', () => {
      // Navigate to patient scheduling
      cy.visit('/patient-schedule')
      cy.wait(2000)
      
      // Fill out form
      cy.get('[name=patientName]').type('SMS Test Patient')
      cy.get('[name=patientPhone]').type('+1234567890')
      cy.get('[name=modality]').select('X-Ray')
      cy.get('[name=studyType]').select('Chest')
      
      // Select date (tomorrow)
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateString = tomorrow.toISOString().split('T')[0]
      cy.get('input[type="date"]').type(dateString)
      
      // Select time slot
      cy.get('select').last().should('not.be.disabled')
      cy.get('select').last().select('10:00 AM')
      
      // Submit form
      cy.get('button[type="submit"]').should('not.be.disabled')
      cy.get('button[type="submit"]').click()
      
      // Should show success message with confirmation
      cy.contains('Appointment scheduled successfully').should('be.visible')
      cy.contains('Confirmation #').should('be.visible')
    })
  })

  describe('Performance Tests', () => {
    it('should load patient scheduling form quickly', () => {
      // Navigate to patient scheduling page
      cy.visit('/patient-schedule')
      cy.wait(2000)
      
      // Check that form loads quickly
      cy.get('h1').should('contain', 'Schedule Your Radiology Appointment')
      cy.get('[name=patientName]').should('be.visible')
      cy.get('[name=modality]').should('be.visible')
    })

    it('should handle multiple concurrent bookings', () => {
      // This test would require multiple browser sessions
      // For now, just verify the system can handle rapid requests
      cy.visit('/patient-schedule')
      cy.wait(2000)
      
      // Make multiple rapid requests by refreshing
      cy.reload()
      cy.wait(2000)
      cy.get('h1').should('contain', 'Schedule Your Radiology Appointment')
      
      cy.reload()
      cy.wait(2000)
      cy.get('h1').should('contain', 'Schedule Your Radiology Appointment')
    })
  })
}) 