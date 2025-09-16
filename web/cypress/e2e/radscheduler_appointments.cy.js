describe('RadScheduler Appointments Dashboard', () => {
  const adminEmail = 'admin@radscheduler.com';
  const adminPassword = 'password';

  beforeEach(() => {
    cy.visit('http://localhost:3002/login');
    cy.get('input[name="email"]').type(adminEmail);
    cy.get('input[name="password"]').type(adminPassword);
    cy.get('button[type="submit"]').click();
    cy.contains('Appointments').should('be.visible');
  });

  it('should show a list of appointments with correct data', () => {
    cy.contains('Recent Appointments').should('be.visible');
    cy.contains('John Smith').should('be.visible');
    cy.contains('COMPLETED').should('be.visible');
    cy.contains('routine').should('be.visible');
  });

  it('should show no appointments state if none exist', () => {
    // This test assumes you can clear appointments or use a test DB
    // cy.request('POST', 'http://localhost:3010/api/appointments/clear');
    // cy.reload();
    // cy.contains('No appointments').should('be.visible');
  });

  // Add more tests for appointment details if there is a details page/modal
}); 