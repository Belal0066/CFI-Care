// environment.template.ts
export const environment = {
  production: false,
  apiUrl: '/api',  
  authUrl : '/auth',
  keycloakHost: 'https://${PUBLIC_HOSTNAME}/keycloak',
  appDashboardUrl: 'https://${PUBLIC_HOSTNAME}/dashboard'
};