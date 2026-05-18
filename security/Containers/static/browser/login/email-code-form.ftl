<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false displayInfo=false; section>
  <#if section="header">
  <#elseif section="form">
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
              <h3>Verify Your Inbox</h3>
              <p>A quick 6-digit confirmation keeps clinical data profiles shielded and secure.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="cfi-panel">
        <div class="cfi-card" role="region" aria-labelledby="cfi-card-title">
          <div class="cfi-card-head">
            <div>
              <h2 id="cfi-card-title">Verify Email</h2>
              <p>We've sent a 6-digit verification code to your inbox</p>
            </div>
          </div>

          <form id="kc-otp-login-form" action="${url.loginAction}" method="post" class="cfi-form">
            
            <input type="hidden" name="session_code" value="${sessionCode!''}" />
            <input type="hidden" name="execution" value="${execution!''}" />
            <input type="hidden" name="client_id" value="${clientId!''}" />
            <input type="hidden" name="tab_id" value="${tabId!''}" />

            <div class="form-group cfi-floating-group">
              <input tabindex="1" type="text" id="email_code" name="email_code" class="form-control" 
                     placeholder=" " inputmode="numeric" pattern="[0-9]*" maxlength="6" 
                     autocomplete="one-time-code" autofocus />
              <label for="email_code" class="cfi-floating-label">Verification Code</label>
            </div>

            <button tabindex="2" type="submit" class="cfi-submit" id="kc-login" style="margin-top: 1rem;">
              Confirm & Create Account
            </button>
          </form>

          <div class="cfi-help">
            <a href="${url.loginUrl}"><i class="bi bi-arrow-left"></i> Cancel & Return to Login</a>
          </div>
        </div>
      </div>
    </div>
  </#if>
</@layout.registrationLayout>