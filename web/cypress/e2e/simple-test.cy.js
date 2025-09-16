describe('Simple Test', () => {
  it('should load the main page', () => {
    cy.visit('/')
    cy.wait(5000)
    
    // Just check if the page loads
    cy.get('body').should('be.visible')
    
    // Log what we find
    cy.get('body').invoke('text').then((text) => {
      cy.log('Page contains text:', text.substring(0, 200))
    })
  })
  
  it('should load the login page', () => {
    cy.visit('/login')
    cy.wait(3000)
    
    // Check if login form is present
    cy.get('#email').should('be.visible')
    cy.get('#password').should('be.visible')
    cy.get('button[type="submit"]').should('be.visible')
  })
}) 