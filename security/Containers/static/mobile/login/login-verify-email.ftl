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
    <div class="cfi-form">
      <div class="cfi-brand">
        <div class="cfi-logo">
          <img class="cfi-logo-img" src="${url.resourcesPath}/img/cfi-logo.png" alt="CFI-CARE" />
        </div>
        <h2 class="cfi-title">CFI-CARE</h2>
        <p class="cfi-subtitle">Your Health, Our Priority</p>
      </div>

      <div class="cfi-tabs cfi-tabs-single">
        <span class="cfi-tab active">Verify Email</span>
      </div>

      <div class="cfi-inline-message cfi-inline-info" role="status" aria-live="polite">
        <p>You need to verify your email address to activate your account.</p>
        <#if emailValue?has_content>
          <p>An email with instructions has been sent to <strong>${kcSanitize(emailValue)?no_esc}</strong>.</p>
        <#else>
          <p>An email with instructions has been sent to your email address.</p>
        </#if>
        <p>Didn’t receive it? You can resend it below.</p>
      </div>
      <input type="hidden" id="cfi-cooldown-seconds" value="${cooldownSeconds}">

      <div class="cfi-help">
        <a id="cfi-resend-link" href="${url.loginAction}">Re-send verification email</a>
        <div id="cfi-resend-countdown" aria-live="polite" style="display:none; margin-top:8px;"></div>
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
            link.style.opacity = "0.6";
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
    </div>

  <#elseif section = "info">
    <div class="cfi-help">
      <#if url.loginUrl??>
        <a href="${url.loginUrl}">Back to Login</a>
      </#if>
    </div>
  </#if>
</@layout.registrationLayout>