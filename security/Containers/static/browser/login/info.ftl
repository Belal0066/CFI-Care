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
              <h3>Trusted Access</h3>
              <p>Your session and account actions stay within the Keycloak security flow.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="cfi-panel">
        <div class="cfi-card" role="region" aria-labelledby="cfi-card-title">
          <div class="cfi-card-head">
            <div>
              <h2 id="cfi-card-title">Information</h2>
              <p>Review the message below</p>
            </div>
          </div>

          <div class="cfi-inline-message cfi-inline-info" role="alert" aria-live="polite" style="margin-bottom: 2rem; line-height: 1.5;">
            <#if message?has_content>
              ${kcSanitize(message.summary)?no_esc}
            <#else>
              No additional information is available.
            </#if>
          </div>

          <div class="cfi-help">
            <a href="${url.loginUrl}" > <i class="bi bi-arrow-left-short"></i> Back to Login</a>
          </div>
        </div>
      </div>
    </div>
  </#if>
</@layout.registrationLayout>