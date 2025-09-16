// RadScheduler E2E: Login and Dashboard Test

describe('RadScheduler Admin Login and Dashboard', () => {
  const adminEmail = 'admin@radscheduler.com';
  const adminPassword = 'password'; // Updated to match demo credentials

  it('should log in as admin and see dashboard', () => {
    // Visit login page
    cy.visit('http://localhost:3002/login');

    // Fill in credentials
    cy.get('input[name="email"]').type(adminEmail);
    cy.get('input[name="password"]').type(adminPassword);
    cy.get('button[type="submit"]').click();

    // Should redirect to dashboard and show welcome message with user name
    cy.contains('Welcome,').should('be.visible');
    cy.contains('admin').should('be.visible'); // role badge

    // Appointments tab should be visible
    cy.contains('Appointments').should('be.visible');
    cy.contains('Recent Appointments').should('be.visible');

    // At least one appointment card should be present (e.g., John Smith)
    cy.contains('John Smith').should('be.visible');

    // Logout
    cy.get('button').contains('Logout').click();
    cy.url().should('include', '/login');
  });
}); 