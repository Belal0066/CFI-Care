<#import "template.ftl" as layout>
<#assign canLogin=realm.password>
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
            <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-shield"></i></div>
            <div class="cfi-feature-copy">
              <h3>Protected by Design</h3>
              <p>Access stays secure and under your control from the first step.</p>
            </div>
          </div>

          <div class="cfi-feature" role="listitem">
            <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-heart"></i></div>
            <div class="cfi-feature-copy">
              <h3>Built Around Patients</h3>
              <p>Bring records, insights, and AI support into one connected flow.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="cfi-panel">
        <div class="cfi-card" role="region" aria-labelledby="cfi-card-title">
          <div class="cfi-card-head">
            <div>
              <h2 id="cfi-card-title">Create Account</h2>
              <p>Fill the details to sign up</p>
            </div>
          </div>

          <form id="kc-register-form" action="${url.registrationAction}" method="post" class="cfi-form">
            
            <div class="form-group cfi-floating-group <#if messagesPerField.existsError('firstName')>has-error</#if>">
              <input tabindex="1" type="text" id="firstName" name="firstName" class="form-control <#if messagesPerField.existsError('firstName')>is-invalid</#if>" value="${(register.formData.firstName!'')}" autocomplete="given-name" placeholder=" " autofocus />
              <label for="firstName" class="cfi-floating-label">${msg("firstName")}</label>
              <#if messagesPerField.existsError('firstName')>
                <span class="kc-feedback-text" aria-live="polite"><i class="bi bi-exclamation-circle"></i> ${kcSanitize(messagesPerField.get('firstName'))?no_esc}</span>
              </#if>
            </div>

            <div class="form-group cfi-floating-group <#if messagesPerField.existsError('lastName')>has-error</#if>">
              <input tabindex="2" type="text" id="lastName" name="lastName" class="form-control <#if messagesPerField.existsError('lastName')>is-invalid</#if>" value="${(register.formData.lastName!'')}" autocomplete="family-name" placeholder=" " />
              <label for="lastName" class="cfi-floating-label">${msg("lastName")}</label>
              <#if messagesPerField.existsError('lastName')>
                <span class="kc-feedback-text" aria-live="polite"><i class="bi bi-exclamation-circle"></i> ${kcSanitize(messagesPerField.get('lastName'))?no_esc}</span>
              </#if>
            </div>

            <div class="form-group cfi-floating-group <#if messagesPerField.existsError('email')>has-error</#if>">
              <input tabindex="3" type="email" id="email" name="email" class="form-control <#if messagesPerField.existsError('email')>is-invalid</#if>" value="${(register.formData.email!'')}" autocomplete="email" placeholder=" " />
              <label for="email" class="cfi-floating-label">${msg("email")}</label>
              <#if messagesPerField.existsError('email')>
                <span class="kc-feedback-text" aria-live="polite"><i class="bi bi-exclamation-circle"></i> ${kcSanitize(messagesPerField.get('email'))?no_esc}</span>
              </#if>
            </div>

            <#if !realm.registrationEmailAsUsername>
              <div class="form-group cfi-floating-group <#if messagesPerField.existsError('username')>has-error</#if>">
                <input tabindex="4" type="text" id="username" name="username" class="form-control <#if messagesPerField.existsError('username')>is-invalid</#if>" value="${(register.formData.username!'')}" autocomplete="username" placeholder=" " />
                <label for="username" class="cfi-floating-label">${msg("username")}</label>
                <#if messagesPerField.existsError('username')>
                  <span class="kc-feedback-text" aria-live="polite"><i class="bi bi-exclamation-circle"></i> ${kcSanitize(messagesPerField.get('username'))?no_esc}</span>
                </#if>
              </div>
            </#if>

            <div class="form-group cfi-floating-group <#if messagesPerField.existsError('password')>has-error</#if>">
              <div class="cfi-password-wrap">
                <input tabindex="5" type="password" id="password" name="password" class="form-control <#if messagesPerField.existsError('password')>is-invalid</#if>" autocomplete="new-password" placeholder=" " />
                <label for="password" class="cfi-floating-label">${msg("password")}</label>
                <button type="button" class="cfi-password-toggle" id="kc-pass-toggle-1" data-target="password" aria-label="Toggle password">
                  <i class="bi bi-eye" aria-hidden="true"></i>
                </button>
              </div>
              <#if messagesPerField.existsError('password')>
                <span class="kc-feedback-text" aria-live="polite"><i class="bi bi-exclamation-circle"></i> ${kcSanitize(messagesPerField.get('password'))?no_esc}</span>
              </#if>
            </div>

            <div class="form-group cfi-floating-group <#if messagesPerField.existsError('password-confirm')>has-error</#if>">
              <div class="cfi-password-wrap">
                <input tabindex="6" type="password" id="password-confirm" name="password-confirm" class="form-control <#if messagesPerField.existsError('password-confirm')>is-invalid</#if>" autocomplete="new-password" placeholder=" " />
                <label for="password-confirm" class="cfi-floating-label">${msg("passwordConfirm")}</label>
                <button type="button" class="cfi-password-toggle" id="kc-pass-toggle-2" data-target="password-confirm" aria-label="Toggle password">
                  <i class="bi bi-eye" aria-hidden="true"></i>
                </button>
              </div>
              <#if messagesPerField.existsError('password-confirm')>
                <span class="kc-feedback-text" aria-live="polite"><i class="bi bi-exclamation-circle"></i> ${kcSanitize(messagesPerField.get('password-confirm'))?no_esc}</span>
              </#if>
            </div>

            <button tabindex="7" type="submit" class="cfi-submit" id="kc-register" style="margin-top: 1rem;">
              Continue to Verification
            </button>
          </form>

          <div class="cfi-help">
            <#if canLogin>
              <span>Already have an account?</span>
              <a href="${url.loginUrl}">Sign in</a>
            </#if>
          </div>
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
      })();
    </script>
  <#elseif section="info">
    <div class="cfi-help">
      <a href="${url.loginUrl}">${msg("backToLogin")}</a>
    </div>
  </#if>
</@layout.registrationLayout>