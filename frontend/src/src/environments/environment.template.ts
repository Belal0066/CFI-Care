// environment.template.ts
export const environment = {
  production: false,
  apiUrl: '/api',
  authUrl : '/auth',
  aiUrl: '/ai',
  aiMock: false,
  keycloakHost: 'https://${LOCAL_HOSTNAME}/keycloak',
  appDashboardUrl: 'https://${LOCAL_HOSTNAME}/dashboard'
};
