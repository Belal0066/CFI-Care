# Security Docs

quick overviews of the diagrams in this folder

## Files
- **Doctor-Patient-access-granting.puml**: Sequence diagram of patient consent granting and doctor access flow (consent creation, caching, validation, revocation) [Doctor-Patient-access-granting.puml](./Doctor-Patient-access-granting.puml)  
<!-- - **browser-tokens-flow.puml**: Browser authentication/session sequence (registration, login, cookie-backed sessions, refresh, logout) [browser-tokens-flow.puml](./browser-tokens-flow.puml)  
- **Mobile-tokens-flow.puml**: Mobile authentication flow using PKCE (auth code for mobile, token handling, refresh, logout) Mobile-tokens-flow.puml   -->
- **components.puml**: Component diagram showing Edge, API gateway, BFF, identity/storage, and resource server [components.puml](./components.puml)  
<!-- - **init-token-flow-sequence.puml**: Token initialization/exchange sequence (login ⇨ auth code ⇨ token exchange ⇨ session handling and refresh) init-token-flow-sequence.puml   -->
- **registration flow listeners.puml**: Event-driven provisioning for Keycloak: REGISTER events ⇨ listener ⇨ BFF ⇨ FHIR (user resource creation) [registration flow listeners.puml](./registration%20flow%20listeners.puml)  
- **security-components.mmd**: Vertical mermaid version of the component diagram with notes [security-components.mmd](./security-components.mmd)  
- **security-components-landscape.mmd**: Landscape mermaid version of the component diagram mapping services and interactions [security-components-landscape.mmd](./security-components-landscape.mmd)  
- **System-access-plan.mmd**: Network plan (OPNsense firewall, private networks, exposure policies) [System-access-plan.mmd](./System-access-plan.mmd)  
- **token-flow-overview.puml**: Tokens overview (browser vs mobile flows, refresh, logout variants) [token-flow-overview.puml](./token-flow-overview.puml)

