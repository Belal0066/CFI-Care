// environment.template.ts
export const environment = {
  production: false,
  apiUrl: '/api',  
  authUrl : '/auth',
  keycloakHost: 'https://${PUBLIC_HOSTNAME}:8443',
  appDashboardUrl: 'https://${PUBLIC_HOSTNAME}/dashboard'
};