const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/createApp');
const { createMemoryUserRepository } = require('../src/repositories/memory-user.repository');
const { AuthService } = require('../src/services/auth.service');

describe('Minimal auth API', () => {
  let app;

  beforeEach(() => {
    const repository = createMemoryUserRepository();
    const authService = new AuthService({
      users: repository,
      jwtSecret: 'test-secret',
      jwtExpiresIn: '1h',
      cookieName: 'auth_token',
      cookieSecure: false,
      bcryptRounds: 4,
    });

    app = createApp({
      userRepository: repository,
      authService,
    });
  });

  it('registers a user', async () => {
    const response = await request(app)
      .post('/api/register')
      .send({ email: 'leo@example.com', password: 'Password123' });

    assert.equal(response.status, 201);
    assert.equal(response.body.user.email, 'leo@example.com');
  });

  it('logs in and returns a JWT', async () => {
    await request(app)
      .post('/api/register')
      .send({ email: 'leo@example.com', password: 'Password123' });

    const response = await request(app)
      .post('/api/login')
      .send({ email: 'leo@example.com', password: 'Password123' });

    assert.equal(response.status, 200);
    assert.ok(response.body.token);
  });

  it('shows the profile with a bearer token', async () => {
    await request(app)
      .post('/api/register')
      .send({ email: 'leo@example.com', password: 'Password123' });

    const loginResponse = await request(app)
      .post('/api/login')
      .send({ email: 'leo@example.com', password: 'Password123' });

    const profileResponse = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${loginResponse.body.token}`);

    assert.equal(profileResponse.status, 200);
    assert.equal(profileResponse.body.user.email, 'leo@example.com');
  });
});
