# nodejs-policy.hcl
path "secret/data/dev/nodejs/*" {
  capabilities = ["read", "list"]
}