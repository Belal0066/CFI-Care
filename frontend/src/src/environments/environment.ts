// environment.template.ts
export const environment = {
  production: false,
  apiUrl: '/api',
  authUrl : '/auth',
  aiUrl: '/ai',
  aiMock: true,   // set to false when AI server is live
  keycloakHost: 'https://192.168.0.101/keycloak',
  appDashboardUrl: 'https://192.168.0.101/dashboard'
};

