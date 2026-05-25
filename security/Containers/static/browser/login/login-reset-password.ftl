<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false displayInfo=true; section>
  <#if section = "header">
  <#elseif section = "form">
    <div class="cfi-shell">
      <div class="cfi-hero">
        <div class="cfi-brand">
          <div class="cfi-brand-mark" aria-hidden="true">
            <i class="bi bi-activity"></i>
          </div>
          <div class="cfi-brand-copy">
            <h1>CFI-Care</h1>
            <p>AI-Powered Collaborative Health Records</p>
          </div>
        </div>

        <div class="cfi-feature-list" role="list">
          <div class="cfi-feature" role="listitem">
            <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-shield"></i></div>
            <div class="cfi-feature-copy">
              <h3>Protected Recovery</h3>
              <p>Password recovery stays encrypted and controlled through Keycloak.</p>
            </div>
          </div>

          <div class="cfi-feature" role="listitem">
            <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-heart"></i></div>
            <div class="cfi-feature-copy">
              <h3>Patient-Friendly Access</h3>
              <p>Restore access without losing the connected care experience.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="cfi-panel">
        <div class="cfi-card" role="region" aria-labelledby="cfi-card-title">
          <div class="cfi-card-head">
            <div>
              <h2 id="cfi-card-title">Reset Password</h2>
              <p>Enter details to request a secure link</p>
            </div>
          </div>

          <#if message?has_content>
            <div class="cfi-inline-message cfi-inline-${(message.type!'info')?lower_case}" role="alert" aria-live="polite">
              ${kcSanitize(message.summary)?no_esc}
            </div>
          </#if>

          <form id="kc-reset-password-form" action="${url.loginAction}" method="post" class="cfi-form" novalidate>
            <div class="form-group cfi-floating-group">
              <input tabindex="1"
                     id="username"
                     class="form-control"
                     name="username"
                     type="text"
                     placeholder=" "
                     autofocus
                     autocomplete="username" />
              <label for="username" class="cfi-floating-label">${msg("usernameOrEmail")}</label>
              <#if messagesPerField.existsError('username')>
                <span class="kc-feedback-text" aria-live="polite">
                  ${kcSanitize(messagesPerField.get('username'))?no_esc}
                </span>
              </#if>
            </div>

            <button tabindex="2" class="cfi-submit" type="submit" style="margin-bottom: 1.5rem;">${msg("doSubmit")}</button>
          </form>

          <div class="cfi-help">
            <a href="${url.loginUrl}" style="text-decoration: underline; font-weight: 500; color: #fff;">Back to Login</a>
          </div>
        </div>
      </div>
    </div>
  <#elseif section = "info">
  </#if>
</@layout.registrationLayout>