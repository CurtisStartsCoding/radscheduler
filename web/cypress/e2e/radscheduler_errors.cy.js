describe('RadScheduler Error and Validation Scenarios', () => {
  it('should show error on invalid login', () => {
    cy.visit('http://localhost:3002/login');
    cy.get('input[name="email"]').type('wrong@user.com');
    cy.get('input[name="password"]').type('wrongpass');
    cy.get('button[type="submit"]').click();
    cy.contains('Invalid credentials').should('be.visible');
  });

  it('should require email and password fields', () => {
    cy.visit('http://localhost:3002/login');
    cy.get('button[type="submit"]').click();
    cy.get('input[name="email"]').then($input => {
      expect($input[0].validationMessage).to.match(/fill out this field/i);
    });
    cy.get('input[name="password"]').then($input => {
      expect($input[0].validationMessage).to.match(/fill out this field/i);
    });
  });

  it('should block unauthorized access to dashboard', () => {
    cy.clearCookies();
    cy.visit('http://localhost:3002/');
    cy.url().should('include', '/login');
  });

  // Add more form validation tests as needed
}); 