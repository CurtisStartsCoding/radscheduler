describe('RadScheduler Authentication and Role-Based Access', () => {
  const users = [
    { email: 'admin@radscheduler.com', password: 'password', role: 'admin', canSeeMonitoring: true },
    { email: 'radiologist@radscheduler.com', password: 'password', role: 'radiologist', canSeeMonitoring: false },
    { email: 'technologist@radscheduler.com', password: 'password', role: 'technologist', canSeeMonitoring: false },
    { email: 'scheduler@radscheduler.com', password: 'password', role: 'scheduler', canSeeMonitoring: false },
    { email: 'viewer@radscheduler.com', password: 'password', role: 'viewer', canSeeMonitoring: false },
  ];

  users.forEach(({ email, password, role, canSeeMonitoring }) => {
    it(`should log in as ${role} and see correct dashboard`, () => {
      cy.visit('http://localhost:3002/login');
      cy.get('input[name="email"]').type(email);
      cy.get('input[name="password"]').type(password);
      cy.get('button[type="submit"]').click();
      cy.contains('Welcome,').should('be.visible');
      cy.contains(role).should('be.visible');
      cy.contains('Appointments').should('be.visible');
      if (canSeeMonitoring) {
        cy.contains('Monitoring').should('be.visible');
      } else {
        cy.contains('Monitoring').should('not.exist');
      }
      cy.get('button').contains('Logout').click();
      cy.url().should('include', '/login');
    });
  });
}); 