<#import "template.ftl" as layout>

<#assign realmName = ((realm.name)!"realm")>
<#assign cooldownRaw = (properties.cfiResendCooldownSeconds!"30")>
<#assign cooldownSeconds = 30>
<#if cooldownRaw?matches("^[0-9]+$")>
  <#assign cooldownSeconds = cooldownRaw?number>
</#if>

<#-- Pull the safely resolved email from the SPI backend context attributes -->
<#assign emailStorageValue = (resolvedEmail!"unknown")>

<#assign hasFieldErrors = messagesPerField?? && messagesPerField.existsError('email_code')>

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

          <#-- Safe Inline Alert Banner for custom messages and native errors -->
          <#if message?has_content && message.type??>
            <div class="cfi-inline-message cfi-inline-${message.type}" role="alert" aria-live="polite" style="margin-bottom: 1.25rem;">
              <p style="margin: 0; line-height: 1.5;">${kcSanitize(message.summary)?no_esc}</p>
            </div>
          </#if>

          <form id="kc-otp-login-form" action="${url.loginAction}" method="post" class="cfi-form">
            
            <input type="hidden" name="session_code" value="${sessionCode!''}" />
            <input type="hidden" name="execution" value="${execution!''}" />
            <input type="hidden" name="client_id" value="${clientId!''}" />
            <input type="hidden" name="tab_id" value="${tabId!''}" />

            <div class="form-group cfi-floating-group">
              <input tabindex="1" type="text" id="email_code" name="email_code" class="form-control" 
                     placeholder=" " inputmode="numeric" pattern="[0-9]*" maxlength="6" 
                     autocomplete="one-time-code" autofocus 
                     <#if hasFieldErrors>aria-invalid="true"</#if> />
              <label for="email_code" class="cfi-floating-label">Verification Code</label>
              
              <#if hasFieldErrors>
                <span id="input-error-email-code" class="kc-feedback-text" aria-live="polite" style="color: #ef4444; font-size: 0.85rem; margin-top: 6px; display: block; font-weight: 500;">
                  ${kcSanitize(messagesPerField.get('email_code'))?no_esc}
                </span>
              </#if>
            </div>

            <button tabindex="2" type="submit" class="cfi-submit" id="kc-login" style="margin-top: 1rem;">
              Confirm & Create Account
            </button>
          </form>

          <input type="hidden" id="cfi-cooldown-seconds" value="${cooldownSeconds}">

          <div class="cfi-help" style="margin-top: 1.5rem; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <a id="cfi-resend-link" class="cfi-link" href="${url.loginAction}&resend=true" >
              Re-send verification email
            </a>
            <div id="cfi-resend-countdown" aria-live="polite" style="display: none; font-weight: 500; color: #06b6d4; font-size: 0.85rem;"></div>
          </div>

          <div class="cfi-help" style="margin-top: 1.25rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1rem;">
            <a href="${url.loginUrl}" style="font-size: 0.9rem; color: #a1a1aa; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
              <i class="bi bi-arrow-left"></i> Cancel & Return to Login
            </a>
          </div>
        </div>
      </div>
    </div>

    <script>
  (function () {
    var link = document.getElementById("cfi-resend-link");
    var label = document.getElementById("cfi-resend-countdown");
    if (!link || !label) return;

    var cooldown = Number(document.getElementById("cfi-cooldown-seconds").value || "30");
    var realmName = "${(realm.name!'realm')?js_string}";
    var emailKey = "${emailStorageValue?js_string}";
    var storageKey = "cfi-resend:" + realmName + ":" + emailKey;

    function render() {
      var until = parseInt(localStorage.getItem(storageKey) || "0", 10);
      var left = Math.ceil((until - Date.now()) / 1000);

      if (left <= 0) {
        link.style.pointerEvents = "auto";
        link.style.opacity = "1";
        link.style.textDecoration = "none";
        link.removeAttribute("aria-disabled");
        label.style.display = "none";
        return;
      }

      link.style.pointerEvents = "none";
      link.style.opacity = "0.4";
      link.style.textDecoration = "line-through";
      link.setAttribute("aria-disabled", "true");
      label.style.display = "block";
      label.textContent = "Resend available in " + left + "s";
      setTimeout(render, 250);
    }

    link.addEventListener("click", function (e) {
      // Intentionally set timestamp flag right as click navigation begins
      var nextUntil = Date.now() + (cooldown * 1000);
      localStorage.setItem(storageKey, String(nextUntil));
    });

    // Execute checking routine immediately on load
    render();
  })();
</script>
  </#if>
</@layout.registrationLayout>