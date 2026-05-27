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
            <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-shield-exclamation"></i></div>
            <div class="cfi-feature-copy">
              <h3>Security Check</h3>
              <p>The request could not be completed in the current authentication session.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="cfi-panel">
        <div class="cfi-card" role="region" aria-labelledby="cfi-card-title">
          <div class="cfi-card-head">
            <div>
              <h2 id="cfi-card-title">Authentication Error</h2>
              <p>Please review the message and try again</p>
            </div>
          </div>

          <div class="cfi-inline-message cfi-inline-error" role="alert" aria-live="polite" style="margin-bottom: 2rem; line-height: 1.5;">
            <#if message?has_content>
              ${kcSanitize(message.summary)?no_esc}
            <#else>
              An unexpected error occurred.
            </#if>
          </div>

          <div class="cfi-help">
            <#assign hostUrl = url.resourcesCommonPath?keep_before("/keycloak")>
            
            <a href="${hostUrl}/login" style="text-decoration: underline; font-weight: 500; color: #fff;">Back to Login</a>
          </div>
        </div>
      </div>
    </div>
  </#if>
</@layout.registrationLayout>