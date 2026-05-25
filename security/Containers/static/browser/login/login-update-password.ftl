<#import "template.ftl" as layout>
<#import "password-commons.ftl" as passwordCommons>
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
              <h3>Secure Credentials</h3>
              <p>Set a fresh password with the same secure flow.</p>
            </div>
          </div>

          <div class="cfi-feature" role="listitem">
            <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-people-fill"></i></div>
            <div class="cfi-feature-copy">
              <h3>Continuity of Care</h3>
              <p>Keep access to your collaborative health records uninterrupted.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="cfi-panel">
        <div class="cfi-card" role="region" aria-labelledby="cfi-card-title">
          <div class="cfi-card-head">
            <div>
              <h2 id="cfi-card-title">Update Password</h2>
              <p>Enter and confirm your new password</p>
            </div>
          </div>

          <#if message?has_content && message.type?? && message.type == 'error'>
            <div class="cfi-inline-message cfi-inline-${(message.type!'info')?lower_case}" role="alert" aria-live="polite">
              ${kcSanitize(message.summary)?no_esc}
            </div>
          </#if>

          <form id="kc-passwd-update-form" action="${url.loginAction}" method="post" class="cfi-form" novalidate>
            
            <div class="form-group cfi-floating-group">
              <div class="cfi-password-wrap">
                <input tabindex="1"
                       type="password"
                       id="password-new"
                       class="form-control"
                       name="password-new"
                       autocomplete="new-password"
                       placeholder=" "
                       autofocus
                       aria-invalid="<#if messagesPerField.existsError('password','password-confirm')>true</#if>" />
                <label for="password-new" class="cfi-floating-label">${msg("passwordNew")}</label>
                <button type="button" class="cfi-password-toggle" data-target="password-new" aria-label="Toggle password">
                  <i class="bi bi-eye" aria-hidden="true"></i>
                </button>
              </div>
              <#if messagesPerField.existsError('password')>
                <span id="input-error-password-new" class="kc-feedback-text" aria-live="polite">
                  ${kcSanitize(messagesPerField.get('password'))?no_esc}
                </span>
              </#if>
            </div>

            <div class="form-group cfi-floating-group">
              <div class="cfi-password-wrap">
                <input tabindex="2"
                       type="password"
                       id="password-confirm"
                       class="form-control"
                       name="password-confirm"
                       autocomplete="new-password"
                       placeholder=" "
                       aria-invalid="<#if messagesPerField.existsError('password-confirm')>true</#if>" />
                <label for="password-confirm" class="cfi-floating-label">${msg("passwordConfirm")}</label>
                <button type="button" class="cfi-password-toggle" data-target="password-confirm" aria-label="Toggle password">
                  <i class="bi bi-eye" aria-hidden="true"></i>
                </button>
              </div>
              <#if messagesPerField.existsError('password-confirm')>
                <span id="input-error-password-confirm" class="kc-feedback-text" aria-live="polite">
                  ${kcSanitize(messagesPerField.get('password-confirm'))?no_esc}
                </span>
              </#if>
            </div>

            <div class="cfi-actions" style="margin: 1.5rem 0 2rem;">
              <div class="cfi-remember">
                <@passwordCommons.logoutOtherSessions/>
              </div>
            </div>

            <button tabindex="3" class="cfi-submit" type="submit">${msg("doSubmit")}</button>

            <#if isAppInitiatedAction??>
              <button type="submit" class="cfi-submit" style="margin-top: 12px; background: linear-gradient(135deg, #52525b 0%, #3f3f46 100%) !important; box-shadow: none;" name="cancel-aia" value="true">
                ${msg("doCancel")}
              </button>
            </#if>
          </form>
        </div>
      </div>
    </div>

    <script>
      (function () {
        var toggles = document.querySelectorAll('.cfi-password-toggle');
        for (var i = 0; i < toggles.length; i++) {
          toggles[i].addEventListener('click', function () {
            var targetId = this.getAttribute('data-target');
            var input = document.getElementById(targetId);
            var icon = this.querySelector('i');
            if (!input || !icon) return;

            if (input.type === 'password') {
              input.type = 'text';
              icon.classList.remove('bi-eye');
              icon.classList.add('bi-eye-slash');
            } else {
              input.type = 'password';
              icon.classList.remove('bi-eye-slash');
              icon.classList.add('bi-eye');
            }
          });
        }
        
        // Minor alignment correction for keycloak built-in templates
        var sessionLabel = document.querySelector('.cfi-remember label');
        if (sessionLabel) {
          sessionLabel.style.display = 'inline-flex';
          sessionLabel.style.alignItems = 'center';
          sessionLabel.style.gap = '8px';
          sessionLabel.style.cursor = 'pointer';
        }
      })();
    </script>
  </#if>
</@layout.registrationLayout>