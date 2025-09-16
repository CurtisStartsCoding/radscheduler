describe('RadScheduler API Endpoints', () => {
  const api = 'http://localhost:3010/api';
  const admin = { email: 'admin@radscheduler.com', password: 'password' };
  let token = '';

  it('should log in and get a JWT', () => {
    cy.request('POST', `${api}/auth/login`, admin).then((resp) => {
      expect(resp.body.success).to.be.true;
      expect(resp.body.token).to.exist;
      token = resp.body.token;
    });
  });

  it('should get appointments list (authorized)', () => {
    cy.request({
      url: `${api}/appointments`,
      headers: { Authorization: `Bearer ${token}` },
    }).then((resp) => {
      expect(resp.body.success).to.be.true;
      expect(resp.body.appointments).to.be.an('array');
    });
  });

  it('should get today stats (authorized)', () => {
    cy.request({
      url: `${api}/appointments/stats/today`,
      headers: { Authorization: `Bearer ${token}` },
    }).then((resp) => {
      expect(resp.body.success).to.be.true;
      expect(resp.body.stats).to.exist;
    });
  });

  it('should fail to get appointments if unauthorized', () => {
    cy.request({
      url: `${api}/appointments`,
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.eq(401);
    });
  });
}); 