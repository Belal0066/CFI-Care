const Label = {
  EPIC: "epic",
  FEATURE: "feature",
  TYPE: "type",
  LAYER: "layer",
  STABILITY: "stability",
  COMPONENT: "component",
  SEVERITY: "severity",
  OWNER: "owner"
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

const Stability = {
  NEW: "new",
  STABLE: "stable",
  FLAKY: "flaky",
  FIXED: "fixed",
  REGRESSED: "regressed"
};

module.exports = { Label, Layer, Component, Stability };
