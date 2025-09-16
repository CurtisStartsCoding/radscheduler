describe('Debug Test', () => {
  it('should debug page loading', () => {
    // Visit the main application
    cy.visit('/')
    cy.wait(5000)
    
    // Log the current URL
    cy.url().then((url) => {
      cy.log('Current URL:', url)
    })
    
    // Log the page title
    cy.title().then((title) => {
      cy.log('Page title:', title)
    })
    
    // Check if we're on login page
    cy.get('body').then(($body) => {
      if ($body.find('#email').length > 0) {
        cy.log('Found login form')
        cy.get('#email').type('admin@radscheduler.com')
        cy.get('#password').type('password')
        cy.get('button[type="submit"]').click()
        cy.wait(3000)
      } else {
        cy.log('No login form found')
      }
    })
    
    // Log all h1 elements
    cy.get('h1').then(($h1s) => {
      cy.log('Found h1 elements:', $h1s.length)
      $h1s.each((i, el) => {
        cy.log(`H1 ${i}:`, el.textContent)
      })
    })
    
    // Log all text content
    cy.get('body').invoke('text').then((text) => {
      cy.log('Body text (first 500 chars):', text.substring(0, 500))
    })
  })
}) 