const request = require('supertest');
const app = require('../../index'); 
const jwt = require('jsonwebtoken');

process.env.EXPECTED_AUDIENCE = 'hapi-fhir';
process.env.TRUST_X_AUTH_HEADERS = 'true';
process.env.NODE_ENV = 'test';

jest.mock('../../services/patientService', () => ({
  createPatient: jest.fn().mockResolvedValue({ id: '1' })
}));

describe('POST /api/patients', () => {
  const mockPatient = {
    firstName: 'John',
    lastName: 'Doe',
    email : 'john.doe@johndoe.com',
    birthDate: '1990-01-01',
    password: '1234abcde'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });
  // it('returns 401 when no token is provided', async () => {
  //   const res = await request(app).post('/api/patients').send( mockPatient);
  //   expect(res.statusCode).toBe(401); 
  // });

  it('accepts forwarded Authz header', async () => {
    mockToken = jest.spyOn(jwt, 'decode').mockReturnValue({ aud: 'hapi-fhir' });
    const res = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer mockToken1234567890`) 
      .send( mockPatient);

    expect(res.statusCode).toBe(201);
  });
});