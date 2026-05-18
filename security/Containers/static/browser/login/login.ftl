<#import "template.ftl" as layout>
  <#assign canRegister=realm.password && realm.registrationAllowed && !(registrationDisabled??)>
  <#assign hasCredentialFieldErrors=messagesPerField.existsError('username') ||
      messagesPerField.existsError('password')>

  <#-- Custom logic to check for Keycloak execution actions (e.g., TOTP setup or password update) -->
  <#assign loginActionValue = (url.loginAction!'')>
  <#assign loginUrlValue = (url.loginUrl!'')>
  <#assign isKcActionFlow = loginActionValue?contains('kc_action=') || loginUrlValue?contains('kc_action=')>
  <#assign hasKnownUsername = (login.username!'')?has_content>
  <#assign lockUsernameField = isKcActionFlow && hasKnownUsername>

      <@layout.registrationLayout displayMessage=false displayInfo=realm.resetPasswordAllowed; section>
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
                    <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-shield"></i></div>
                    <div class="cfi-feature-copy">
                      <h3>Enterprise Security</h3>
                      <p>Health data you can trust, secured and under your control.</p>
                    </div>
                  </div>

                  <div class="cfi-feature" role="listitem">
                    <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-people-fill"></i></div>
                    <div class="cfi-feature-copy">
                      <h3>Seamless Collaboration</h3>
                      <p>Real-time sharing between patients,caregivers and specialists.</p>
                    </div>
                  </div>

                  <div class="cfi-feature" role="listitem">
                    <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-heart"></i></div>
                    <div class="cfi-feature-copy">
                      <h3>Patient-Centered Care</h3>
                      <p>Comprehensive health insights powered by AI analytics.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div class="cfi-panel">
                <div class="cfi-card" role="region" aria-labelledby="cfi-card-title">
                  <div class="cfi-card-head">
                    <div>
                      <h2 id="cfi-card-title">Welcome Back</h2>
                      <p>Sign in to your account</p>
                    </div>
                  </div>

                  <#if message?has_content && message.type?? && !hasCredentialFieldErrors>
                    <div class="cfi-inline-message cfi-inline-${(message.type!'info')?lower_case}" role="alert"
                      aria-live="polite">
                      ${kcSanitize(message.summary)?no_esc}
                    </div>
                  </#if>

                  <form id="kc-form-login" action="${url.loginAction}" method="post" class="cfi-form" novalidate>
                    <input type="hidden" id="id-hidden-input" name="credentialId" <#if
                      auth.selectedCredential?has_content>value="${auth.selectedCredential}"
        </#if>/>

        <div class="form-group cfi-floating-group">
          <#-- The username input field below now includes the conditional <#if lockUsernameField> readonly aria-readonly="true"</#if> block -->
          <input tabindex="1" id="username" class="form-control" name="username" value="${(login.username!'')}"
            type="text" <#if !lockUsernameField>autofocus</#if> autocomplete="username" placeholder=" " <#if lockUsernameField>readonly aria-readonly="true"</#if> />
          <label for="username" class="cfi-floating-label">
            <#if realm.loginWithEmailAllowed>
              ${msg("usernameOrEmail")}
              <#else>
                ${msg("username")}
            </#if>
          </label>
          <#if messagesPerField.existsError('username')>
            <span id="input-error-username" class="kc-feedback-text" aria-live="polite">
              ${kcSanitize(messagesPerField.get('username'))?no_esc}
            </span>
          </#if>
        </div>

        <div class="form-group cfi-floating-group">
          <div class="cfi-password-wrap">
            <input id="password" class="form-control" name="password" type="password" autocomplete="current-password"
              placeholder=" " <#if lockUsernameField>autofocus</#if> />
            <label for="password" class="cfi-floating-label">${msg("password")}</label>
            <button type="button" class="cfi-password-toggle" id="kc-pass-toggle" aria-label="Toggle password">
              <i class="bi bi-eye" aria-hidden="true"></i>
            </button>
          </div>
          <#if messagesPerField.existsError('password')>
            <span id="input-error-password" class="kc-feedback-text" aria-live="polite">
              ${kcSanitize(messagesPerField.get('password'))?no_esc}
            </span>
          </#if>
        </div>

        <div class="cfi-actions">
          <#if realm.rememberMe>
            <label class="cfi-remember">
              <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox" <#if login.rememberMe??>checked
          </#if> />
          <span>Remember me</span>
          </label>
          </#if>

          <#if realm.resetPasswordAllowed>
            <a class="cfi-link" href="${url.loginResetCredentialsUrl}">Forgot password?</a>
          </#if>
        </div>

        <button tabindex="4" class="cfi-submit" name="login" id="kc-login" type="submit">${msg("doLogIn")}</button>

        <#if social?? && social.providers?? && social.providers?has_content>
          <div class="cfi-divider"><span>or continue with</span></div>
          <div class="cfi-social" role="list">
            <#list social.providers as provider>
              <a class="cfi-social-btn" href="${provider.loginUrl}" aria-label="${provider.displayName}"
                role="listitem">
                <#if provider.providerId?lower_case=="google">
                  <i class="bi bi-google google-icon" aria-hidden="true"></i>
                  <#elseif provider.providerId?lower_case=="facebook">
                    <i class="bi bi-facebook facebook-icon" aria-hidden="true"></i>
                    <#else>
                      <span class="cfi-social-icon" aria-hidden="true">${provider.displayName?substring(0,1)}</span>
                </#if>
                <span>${provider.displayName}</span>
              </a>
            </#list>
          </div>
        </#if>

        <#if canRegister>
          <div class="cfi-help">
            <span>Don't have an account?</span>
            <a href="${url.registrationUrl}">Sign up</a>
          </div>
        </#if>
        </form>
        </div>
        </div>
        </div>

        <script>
          (function () {
            var btn = document.getElementById('kc-pass-toggle');
            var input = document.querySelector('#password, input[type="password"]');
            if (!btn || !input) return;
            btn.addEventListener('click', function (e) {
              if (input.type === 'password') {
                input.type = 'text';
                btn.querySelector('i').classList.remove('bi-eye');
                btn.querySelector('i').classList.add('bi-eye-slash');
              } else {
                input.type = 'password';
                btn.querySelector('i').classList.remove('bi-eye-slash');
                btn.querySelector('i').classList.add('bi-eye');
              }
            });

            // Fallback script ensuring DOM matches URL parameters on load
            var search = (window.location && window.location.search) ? window.location.search : '';
            var href = (window.location && window.location.href) ? window.location.href : '';
            if (search.indexOf('kc_action=') !== -1 || href.indexOf('kc_action=') !== -1) {
              var usernameInput = document.getElementById('username');
              if (usernameInput && usernameInput.value && usernameInput.value.trim().length > 0) {
                usernameInput.setAttribute('readonly', 'readonly');
                usernameInput.setAttribute('aria-readonly', 'true');
              }
            }
          })();
        </script>
        </#if>
      </@layout.registrationLayout>