describe('RadScheduler HL7 Integration and SMS Notification', () => {
  const adminEmail = 'admin@radscheduler.com';
  const adminPassword = 'password';

  it('should create an appointment via HL7 and show it in dashboard', () => {
    // Simulate HL7 message via API (correct payload)
    const hl7Payload = {
      patientName: 'HL7 Test Patient',
      modality: 'MRI',
      datetime: new Date(Date.now() + 3600000).toISOString()
    };
    cy.request('POST', 'http://localhost:3010/api/hl7/simulate', hl7Payload).then((resp) => {
      expect(resp.status).to.eq(201);
      expect(resp.body.success).to.be.true;
      expect(resp.body.message).to.include('Simulated HL7 processed');
    });

    // Log in and check dashboard for new appointment
    cy.visit('http://localhost:3002/login');
    cy.get('input[name="email"]').type(adminEmail);
    cy.get('input[name="password"]').type(adminPassword);
    cy.get('button[type="submit"]').click();
    cy.contains('Appointments').should('be.visible');
    cy.contains('HL7 Test Patient').should('be.visible');
    // Optionally, check for SMS log/notification (if visible in UI or via API)
    // cy.request('GET', 'http://localhost:3010/api/notifications/logs').then((resp) => {
    //   expect(resp.body.logs.some(log => log.phone === '+15555550123')).to.be.true;
    // });
  });
}); 