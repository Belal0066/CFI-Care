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
              <h3>Protected Session</h3>
              <p>Your login session timed out and must be restarted.</p>
            </div>
          </div>

          <div class="cfi-feature" role="listitem">
            <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-arrow-repeat"></i></div>
            <div class="cfi-feature-copy">
              <h3>Restart Cleanly</h3>
              <p>Use the safe restart link or return to the login screen.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="cfi-panel">
        <div class="cfi-card" role="region" aria-labelledby="cfi-card-title">
          <div class="cfi-card-head">
            <div>
              <h2 id="cfi-card-title">Session Expired</h2>
              <p>Choose how you want to continue</p>
            </div>
          </div>

          <div class="cfi-inline-message cfi-inline-warning" role="alert" aria-live="polite" style="margin-bottom: 2rem;">
            <p style="margin: 0 0 14px 0; line-height: 1.5; font-size: 15px;">
              To restart the login process, 
              <#if url.loginRestartFlowUrl??>
                <a href="${url.loginRestartFlowUrl}" style="color: #fff; font-weight: 600; text-decoration: underline;">click here</a>.
              <#elseif url.loginUrl??>
                <a href="${url.loginUrl}" style="color: #fff; font-weight: 600; text-decoration: underline;">go to login</a>.
              <#else>
                please go back to login.
              </#if>
            </p>
            <p style="margin: 0; line-height: 1.5; font-size: 15px;">
              To continue the current login process, 
              <#if url.loginAction??>
                <a href="${url.loginAction}" style="color: #fff; font-weight: 600; text-decoration: underline;">click here</a>.
              <#elseif url.loginUrl??>
                <a href="${url.loginUrl}" style="color: #fff; font-weight: 600; text-decoration: underline;">go to login</a>.
              <#else>
                please go back to login.
              </#if>
            </p>
          </div>

          <div class="cfi-help">
            <#if url.loginUrl??>
              <a href="${url.loginUrl}" > <i class="bi bi-arrow-left-short"></i> Back to Login</a>
            </#if>
          </div>
        </div>
      </div>
    </div>
  </#if>
</@layout.registrationLayout>