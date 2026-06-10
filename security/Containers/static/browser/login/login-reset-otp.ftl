<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false displayInfo=false; section>
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
              <h3>Recovery Step</h3>
              <p>Choose which authenticator should be reset.</p>
            </div>
          </div>

          <div class="cfi-feature" role="listitem">
            <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-arrow-repeat"></i></div>
            <div class="cfi-feature-copy">
              <h3>Continue Safely</h3>
              <p>Keep the account access flow within Keycloak.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="cfi-panel">
        <div class="cfi-card" role="region" aria-labelledby="cfi-card-title">
          <div class="cfi-card-head">
            <div>
              <h2 id="cfi-card-title">Reset OTP</h2>
              <p>Select the credential you want to reset</p>
            </div>
          </div>

          <#if message?has_content>
            <div class="cfi-inline-message cfi-inline-${(message.type!'info')?lower_case}" role="alert" aria-live="polite">
              ${kcSanitize(message.summary)?no_esc}
            </div>
          </#if>

          <form id="kc-otp-reset-form" action="${url.loginAction}" method="post" class="cfi-form">
            <div class="form-group" style="margin-bottom: 2rem;">
              <p style="margin: 0 0 1.25rem 0; text-align: left; font-size: 0.95rem; line-height: 1.5; color: rgba(255,255,255,0.85);">
                ${msg("otp-reset-description")}
              </p>

              <div style="display: grid; gap: 12px;">
                <#list configuredOtpCredentials.userOtpCredentials as otpCredential>
                  <label style="display: flex; align-items: center; gap: 12px; padding: 16px; border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; background: rgba(255,255,255,0.06); color: #fff; font-weight: 500; font-size: 15px; cursor: pointer; transition: background 0.2s ease;">
                    <input id="kc-otp-credential-${otpCredential?index}"
                           type="radio"
                           name="selectedCredentialId"
                           value="${otpCredential.id}"
                           style="accent-color: #06b6d4; width: 18px; height: 18px; margin: 0;"
                           <#if otpCredential.id == configuredOtpCredentials.selectedCredentialId>checked="checked"</#if> />
                    <span>${otpCredential.userLabel}</span>
                  </label>
                </#list>
              </div>
            </div>

            <button id="kc-otp-reset-form-submit" class="cfi-submit" type="submit" style="margin-bottom: 1.5rem;">${msg("doSubmit")}</button>
          </form>

          <div class="cfi-help">
            <a href="${url.loginUrl}" > <i class="bi bi-arrow-left-short"></i> Back to Login</a>
          </div>
        </div>
      </div>
    </div>
  </#if>
</@layout.registrationLayout>