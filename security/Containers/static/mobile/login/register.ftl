<#import "template.ftl" as layout>
<#assign canLogin=realm.password>
<@layout.registrationLayout displayMessage=false displayInfo=false; section>
  <#if section = "header">
  <#elseif section = "form">
    <div class="cfi-form cfi-form-register">
      <div class="cfi-brand">
        <div class="cfi-logo">
          <img class="cfi-logo-img" src="${url.resourcesPath}/img/cfi-logo.png" alt="CFI-CARE" />
        </div>
        <h2 class="cfi-title">CFI-CARE</h2>
        <p class="cfi-subtitle">Your Health, Our Priority</p>
      </div>

      <div class="cfi-tabs">
        <a class="cfi-tab" href="${url.loginUrl}">Login</a>
        <span class="cfi-tab active">Register</span>
      </div>

      <#-- 
        DETERMINE THE ACTIVE VIEW LAYER CONTEXT BASED ON CURRENT KEYCLOAK ERRORS:
        If there's an 'email_code' error block, we are on Step 2.
        If there are details errors (or no errors), we must display Step 1.
      -->
      <#assign isOtpActive = messagesPerField.existsError('email_code')>
      <#assign hasDetailsErrors = messagesPerField.existsError('firstName','lastName','email','username','password','password-confirm')>
      
      <#if hasDetailsErrors>
        <#assign isOtpActive = false>
      </#if>

      <form id="kc-register-form" action="${url.registrationAction}" method="post">
        
        <input type="hidden" id="otp_step" name="otp_step" value="${isOtpActive?c}" />

        <div id="registration-fields-step" style="<#if isOtpActive>display: none;<#else>display: block;</#if>">
          <div class="form-group">
            <label for="firstName">${msg("firstName")}</label>
            <input type="text" id="firstName" name="firstName" class="form-control <#if messagesPerField.existsError('firstName')>is-invalid</#if>" value="${(register.formData.firstName!'')}" autocomplete="given-name"/>
            <#if messagesPerField.existsError('firstName')>
              <span class="kc-feedback-text">${kcSanitize(messagesPerField.get('firstName'))?no_esc}</span>
            </#if>
          </div>

          <div class="form-group">
            <label for="lastName">${msg("lastName")}</label>
            <input type="text" id="lastName" name="lastName" class="form-control <#if messagesPerField.existsError('lastName')>is-invalid</#if>" value="${(register.formData.lastName!'')}" autocomplete="family-name"/>
            <#if messagesPerField.existsError('lastName')>
              <span class="kc-feedback-text">${kcSanitize(messagesPerField.get('lastName'))?no_esc}</span>
            </#if>
          </div>

          <div class="form-group">
            <label for="email">${msg("email")}</label>
            <input type="email" id="email" name="email" class="form-control <#if messagesPerField.existsError('email')>is-invalid</#if>" value="${(register.formData.email!'')}" autocomplete="email"/>
            <#if messagesPerField.existsError('email')>
              <span class="kc-feedback-text">${kcSanitize(messagesPerField.get('email'))?no_esc}</span>
            </#if>
          </div>

          <#if !realm.registrationEmailAsUsername>
            <div class="form-group">
              <label for="username">${msg("username")}</label>
              <input type="text" id="username" name="username" class="form-control <#if messagesPerField.existsError('username')>is-invalid</#if>" value="${(register.formData.username!'')}" autocomplete="username"/>
              <#if messagesPerField.existsError('username')>
                <span class="kc-feedback-text">${kcSanitize(messagesPerField.get('username'))?no_esc}</span>
              </#if>
            </div>
          </#if>

          <div class="form-group">
            <label for="password">${msg("password")}</label>
            <div class="cfi-password-wrap">
              <input type="password" id="password" name="password" class="form-control <#if messagesPerField.existsError('password')>is-invalid</#if>" autocomplete="new-password"/>
              <button type="button" class="cfi-password-toggle" data-target="password" aria-label="Show password" aria-pressed="false">
                <span class="eye-open">Show</span>
                <span class="eye-closed">Hide</span>
              </button>
            </div>
            <#if messagesPerField.existsError('password')>
              <span class="kc-feedback-text">${kcSanitize(messagesPerField.get('password'))?no_esc}</span>
            </#if>
          </div>

          <div class="form-group">
            <label for="password-confirm">${msg("passwordConfirm")}</label>
            <div class="cfi-password-wrap">
              <input type="password" id="password-confirm" name="password-confirm" class="form-control <#if messagesPerField.existsError('password-confirm')>is-invalid</#if>" autocomplete="new-password"/>
              <button type="button" class="cfi-password-toggle" data-target="password-confirm" aria-label="Show password" aria-pressed="false">
                <span class="eye-open">Show</span>
                <span class="eye-closed">Hide</span>
              </button>
            </div>
            <#if messagesPerField.existsError('password-confirm')>
              <span class="kc-feedback-text">${kcSanitize(messagesPerField.get('password-confirm'))?no_esc}</span>
            </#if>
          </div>

          <button type="button" class="btn btn-primary" id="kc-register-continue" style="margin-top: 1rem;">
            Continue to Verification
          </button>
        </div>

        <div id="otp-fields-step" style="<#if isOtpActive>display: block;<#else>display: none;</#if>">
          <div class="login-header">
            <h2 class="cfi-title2">Verify Your Email</h2>
            <p class="cfi-subtitle" style="margin-top: 20px;">We've sent a 6-digit code to your inbox</p>
          </div>

          <#if messagesPerField.existsError('email_code')>
            <#assign emailCodeMessage = messagesPerField.get('email_code')!''>
            <#if !emailCodeMessage?contains('Verification code sent')>
              <div class="cfi-inline-message cfi-inline-error" role="alert" style="margin-top: 20px; color: #ef4444; font-weight: 500;">
                <i class="bi bi-exclamation-triangle-fill"></i> <span>${kcSanitize(emailCodeMessage)?no_esc}</span>
              </div>
            </#if>
          </#if>

          <div class="form-group" style="margin-top: 40px;">
            <label for="email_code">Verification Code</label>
            <input type="text" 
                   id="email_code" 
                   name="email_code" 
                   class="form-control" 
                   placeholder="000000"
                   inputmode="numeric" 
                   pattern="[0-9]*" 
                   maxlength="6"
                   autocomplete="one-time-code">
          </div>

          <button type="button" class="btn btn-primary" id="kc-register-submit-final">
            Confirm & Create Account
          </button>
          
          <div class="cfi-help" style="margin-top: 40px;">
            <a href="javascript:void(0)" id="cfi-back-link" class="cfi-help">
              <i class="bi bi-arrow-left"></i> Back to Details
            </a>
          </div>
        </div>
      </form>

      <script>
        (function () {
          var toggles = document.querySelectorAll('.cfi-password-toggle');
          var form = document.getElementById('kc-register-form');
          var registrationStep = document.getElementById('registration-fields-step');
          var otpStep = document.getElementById('otp-fields-step');
          var continueButton = document.getElementById('kc-register-continue');
          var finalSubmitButton = document.getElementById('kc-register-submit-final');
          var backBtn = document.getElementById('cfi-back-link');
          var otpStepField = document.getElementById('otp_step');

          for (var i = 0; i < toggles.length; i++) {
            toggles[i].addEventListener('click', function () {
              var targetId = this.getAttribute('data-target');
              var input = document.getElementById(targetId);
              if (!input) return;
              var isHidden = input.type === 'password';
              input.type = isHidden ? 'text' : 'password';
            });
          }

          // Step 1: Requesting code -> forces step indicator to false
          if (continueButton) {
            continueButton.addEventListener('click', function(e) {
              if (otpStepField) { otpStepField.value = 'false'; } 
              form.submit();
            });
          }

          // Step 2: Submitting code -> explicitly flags step indicator to true right before submission
          if (finalSubmitButton) {
            finalSubmitButton.addEventListener('click', function(e) {
              if (otpStepField) { otpStepField.value = 'true'; }
              form.submit();
            });
          }

          if (backBtn) {
            backBtn.addEventListener('click', function(e) {
              e.preventDefault();
              if (otpStepField) { otpStepField.value = 'false'; }
              if (registrationStep) registrationStep.style.display = 'block';
              if (otpStep) otpStep.style.display = 'none';
            });
          }

          // Dynamic rendering engine preservation bypasses browser anti-phishing data stripping
          if (form) {
            form.addEventListener('submit', function() {
              if (otpStepField && otpStepField.value === 'true') {
                if (registrationStep) {
                  registrationStep.style.setProperty('display', 'block', 'important');
                  registrationStep.style.position = 'absolute';
                  registrationStep.style.height = '0px';
                  registrationStep.style.width = '0px';
                  registrationStep.style.overflow = 'hidden';
                  registrationStep.style.opacity = '0';
                }
              }
            });
          }
        })();
      </script>
    </div>
  <#elseif section = "info">
    <div class="cfi-help">
      <a href="${url.loginUrl}">${msg("backToLogin")}</a>
    </div>
  </#if>
</@layout.registrationLayout>