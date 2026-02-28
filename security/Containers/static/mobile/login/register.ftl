<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('firstName','lastName','email','username','password','password-confirm') displayInfo=false ; section>
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

      <form id="kc-register-form" action="${url.registrationAction}" method="post">
        <div class="form-group">
          <label for="firstName">${msg("firstName")}</label>
          <input type="text" id="firstName" class="form-control" name="firstName" value="${(register.formData.firstName!'')}" autocomplete="given-name"/>
          <#if messagesPerField.existsError('firstName')>
            <span class="kc-feedback-text">${kcSanitize(messagesPerField.get('firstName'))?no_esc}</span>
          </#if>
        </div>

        <div class="form-group">
          <label for="lastName">${msg("lastName")}</label>
          <input type="text" id="lastName" class="form-control" name="lastName" value="${(register.formData.lastName!'')}" autocomplete="family-name"/>
          <#if messagesPerField.existsError('lastName')>
            <span class="kc-feedback-text">${kcSanitize(messagesPerField.get('lastName'))?no_esc}</span>
          </#if>
        </div>

        <div class="form-group">
          <label for="email">${msg("email")}</label>
          <input type="email" id="email" class="form-control" name="email" value="${(register.formData.email!'')}" autocomplete="email"/>
          <#if messagesPerField.existsError('email')>
            <span class="kc-feedback-text">${kcSanitize(messagesPerField.get('email'))?no_esc}</span>
          </#if>
        </div>

        <#if !realm.registrationEmailAsUsername>
          <div class="form-group">
            <label for="username">${msg("username")}</label>
            <input type="text" id="username" class="form-control" name="username" value="${(register.formData.username!'')}" autocomplete="username"/>
            <#if messagesPerField.existsError('username')>
              <span class="kc-feedback-text">${kcSanitize(messagesPerField.get('username'))?no_esc}</span>
            </#if>
          </div>
        </#if>

        <div class="form-group">
          <label for="password">${msg("password")}</label>
          <div class="cfi-password-wrap">
            <input type="password" id="password" class="form-control" name="password" autocomplete="new-password"/>
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
            <input type="password" id="password-confirm" class="form-control" name="password-confirm" autocomplete="new-password"/>
            <button type="button" class="cfi-password-toggle" data-target="password-confirm" aria-label="Show password" aria-pressed="false">
              <span class="eye-open">Show</span>
              <span class="eye-closed">Hide</span>
            </button>
          </div>
          <#if messagesPerField.existsError('password-confirm')>
            <span class="kc-feedback-text">${kcSanitize(messagesPerField.get('password-confirm'))?no_esc}</span>
          </#if>
        </div>

        <div class="form-group" style="margin-top:14px;">
          <input class="btn btn-primary" type="submit" value="${msg("doRegister")}"/>
        </div>
      </form>

      <script>
        (function () {
          var toggles = document.querySelectorAll('.cfi-password-toggle');
          for (var i = 0; i < toggles.length; i++) {
            toggles[i].addEventListener('click', function () {
              var targetId = this.getAttribute('data-target');
              var input = document.getElementById(targetId);
              if (!input) return;
              var isHidden = input.type === 'password';
              input.type = isHidden ? 'text' : 'password';
              this.classList.toggle('is-visible', isHidden);
              this.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
              this.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
            });
          }
        })();
      </script>
    </div>
  <#elseif section = "info" >
    <div class="cfi-help">
      <a href="${url.loginUrl}">${msg("backToLogin")}</a>
    </div>
  </#if>
</@layout.registrationLayout>
