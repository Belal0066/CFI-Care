const Label = {
  EPIC: "epic",
  FEATURE: "feature",
  TYPE: "type",
  LAYER: "layer",
  STABILITY: "stability",
  COMPONENT: "component",
  SEVERITY: "severity",
  OWNER: "owner",
  SCOPE: "scope",
  DEPENDENCY: "dependency",
  JOURNEY: "journey",
  PLATFORM: "platform",
  ENVIRONMENT: "environment"
};

const Layer = {
  UNIT: "unit",
  INTEGRATION: "integration",
  SYSTEM: "system"
};

const Component = {
  BACKEND: "backend",
  AI: "ai"
};

const Scope = {
  BACKEND_AI: "backend-ai",
  BACKEND_DB: "backend-db",
  BACKEND_AUTH: "backend-auth",
  BACKEND_FHIR: "backend-fhir"
};

const Dependency = {
  POSTGRES: "postgres",
  REDIS: "redis",
  FHIR: "fhir",
  OPENAI: "openai"
};

const Journey = {
  PATIENT: "patient",
  PROVIDER: "provider",
  ADMIN: "admin"
};

const Platform = {
  WEB: "web",
  ANDROID: "android",
  IOS: "ios"
};

const Environment = {
  LOCAL: "local",
  DEV: "dev",
  STAGING: "staging",
  PROD: "prod"
};

const Stability = {
  NEW: "new",
  STABLE: "stable",
  FLAKY: "flaky",
  FIXED: "fixed",
  REGRESSED: "regressed",
  DEPENDENCY_FLAKY: "dependency-flaky",
  WORKFLOW_FLAKY: "workflow-flaky"
};

module.exports = { Label, Layer, Component, Scope, Dependency, Journey, Platform, Environment, Stability };
