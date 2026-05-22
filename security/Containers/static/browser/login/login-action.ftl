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
            <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-envelope-check"></i></div>
            <div class="cfi-feature-copy">
              <h3>Email Verified Flow</h3>
              <p>This step continues the secure account activation process.</p>
            </div>
          </div>

          <div class="cfi-feature" role="listitem">
            <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-shield"></i></div>
            <div class="cfi-feature-copy">
              <h3>Protected Access</h3>
              <p>Your session stays inside the Keycloak authentication flow.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="cfi-panel">
        <div class="cfi-card" role="region" aria-labelledby="cfi-card-title">
          <div class="cfi-card-head">
            <div>
              <h2 id="cfi-card-title">Verify Email</h2>
              <p>Continue after confirming your email</p>
            </div>
          </div>

          <div class="cfi-inline-message cfi-inline-info" role="status" aria-live="polite" style="margin-bottom: 2rem;">
            <#if message?has_content>
              <p style="margin: 0; line-height: 1.5; font-size: 15px;">${kcSanitize(message.summary)?no_esc}</p>
            <#else>
              <p style="margin: 0; line-height: 1.5; font-size: 15px;">Please confirm your email verification to continue.</p>
            </#if>
          </div>

          <div class="cfi-help">
            <a class="cfi-submit" href="${url.loginAction}" style="display: flex; align-items: center; justify-content: center; text-decoration: none;">
              Click here to proceed
            </a>
          </div>
        </div>
      </div>
    </div>
  </#if>
</@layout.registrationLayout>