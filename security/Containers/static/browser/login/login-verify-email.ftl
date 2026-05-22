<#import "template.ftl" as layout>

<#assign emailValue = ((user.email)!"")>
<#assign realmName = ((realm.name)!"realm")>
<#assign cooldownRaw = (properties.cfiResendCooldownSeconds!"30")>
<#assign cooldownSeconds = 30>
<#if cooldownRaw?matches("^[0-9]+$")>
  <#assign cooldownSeconds = cooldownRaw?number>
</#if>
<#assign emailStorageValue = emailValue>
<#if !emailStorageValue?has_content>
  <#assign emailStorageValue = "unknown">
</#if>

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
            <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-envelope-check"></i></div>
            <div class="cfi-feature-copy">
              <h3>Email Confirmation</h3>
              <p>We send an instruction email before the account becomes active.</p>
            </div>
          </div>

          <div class="cfi-feature" role="listitem">
            <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-shield"></i></div>
            <div class="cfi-feature-copy">
              <h3>Account Protection</h3>
              <p>Verification helps keep access to your records secure.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="cfi-panel">
        <div class="cfi-card" role="region" aria-labelledby="cfi-card-title">
          <div class="cfi-card-head">
            <div>
              <h2 id="cfi-card-title">Verify Email</h2>
              <p>Check your inbox to finish signing up</p>
            </div>
          </div>

          <div class="cfi-inline-message cfi-inline-info" role="status" aria-live="polite">
            <p style="margin: 0 0 12px 0; line-height: 1.5;">You need to verify your email address to activate your account.</p>
            <#if emailValue?has_content>
              <p style="margin: 0 0 12px 0; line-height: 1.5;">An email with instructions has been sent to:<br><strong style="color: #fff; word-break: break-all;">${kcSanitize(emailValue)?no_esc}</strong>.</p>
            <#else>
              <p style="margin: 0 0 12px 0; line-height: 1.5;">An email with instructions has been sent to your inbox.</p>
            </#if>
            <p style="margin: 0; line-height: 1.5; color: rgba(255,255,255,0.7);">Didn't receive it? You can trigger a new link below.</p>
          </div>

          <input type="hidden" id="cfi-cooldown-seconds" value="${cooldownSeconds}">

          <div class="cfi-help" style="margin-top: 2rem;">
            <a id="cfi-resend-link" class="cfi-link" href="${url.loginAction}" style="text-decoration: underline; font-weight: 600; color: #fff;">Re-send verification email</a>
            <div id="cfi-resend-countdown" aria-live="polite" style="display: none; margin-top: 12px; font-weight: 500; color: #06b6d4;"></div>
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
        var realmName = "${realmName?js_string}";
        var emailKey = "${emailStorageValue?js_string}";
        var storageKey = "cfi-resend:" + realmName + ":" + emailKey;

        var now = Date.now();
        var until = parseInt(localStorage.getItem(storageKey) || "0", 10);

        if (!until || until < now) {
          until = now + (cooldown * 1000);
          localStorage.setItem(storageKey, String(until));
        }

        function render() {
          var left = Math.ceil((until - Date.now()) / 1000);

          if (left <= 0) {
            link.style.pointerEvents = "auto";
            link.style.opacity = "1";
            link.removeAttribute("aria-disabled");
            label.style.display = "none";
            return;
          }

          link.style.pointerEvents = "none";
          link.style.opacity = "0.5";
          link.setAttribute("aria-disabled", "true");
          label.style.display = "block";
          label.textContent = "You can resend in " + left + "s";
          setTimeout(render, 250);
        }

        link.addEventListener("click", function () {
          var nextUntil = Date.now() + (cooldown * 1000);
          localStorage.setItem(storageKey, String(nextUntil));
        });

        render();
      })();
    </script>

  <#elseif section = "info">
    <div class="cfi-help">
      <#if url.loginUrl??>
        <a href="${url.loginUrl}">Back to Login</a>
      </#if>
    </div>
  </#if>
</@layout.registrationLayout>