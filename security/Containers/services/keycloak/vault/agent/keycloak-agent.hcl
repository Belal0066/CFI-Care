auto_auth {
  method "approle" {
    mount_path = "auth/approle"
    config = {
      role_id_file_path   = "/etc/vault/role/role_id"
      secret_id_file_path = "/etc/vault/role/secret_id"
    }
  }

  sink "file" {
    config = {
      path = "/home/vault/.vault-token"
    }
  }
}

vault {
  address = "${VAULT_ADDR}"
}

template {
  source      = "/etc/vault/templates/keycloak-env.ctmpl"
  destination = "/etc/keycloak-vault/.env.kc"
  command     = "chmod 644 /etc/keycloak-vault/.env.kc || true"
}