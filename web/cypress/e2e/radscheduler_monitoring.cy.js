describe('RadScheduler Monitoring Dashboard (Admin)', () => {
  const adminEmail = 'admin@radscheduler.com';
  const adminPassword = 'password';

  it('should show monitoring tab and metrics for admin', () => {
    cy.visit('http://localhost:3002/login');
    cy.get('input[name="email"]').type(adminEmail);
    cy.get('input[name="password"]').type(adminPassword);
    cy.get('button[type="submit"]').click();
    cy.contains('Monitoring').click();
    cy.contains('System Health').should('be.visible');
    cy.contains('Performance Metrics').should('be.visible');
    cy.contains('Business Impact').should('be.visible');
    // Alerts section (if any alerts are present)
    cy.get('div').then($divs => {
      if ($divs.text().includes('Low Utilization') || $divs.text().includes('High Error Rate')) {
        cy.contains('Low Utilization').should('be.visible');
      }
    });
    cy.get('button').contains('Logout').click();
    cy.url().should('include', '/login');
  });
}); 