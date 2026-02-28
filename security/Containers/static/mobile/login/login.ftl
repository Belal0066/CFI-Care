<#import "template.ftl" as layout>
<#assign canRegister = realm.password && realm.registrationAllowed && !(registrationDisabled??)>
<#assign showRegisterTab = (properties.cfiShowRegisterTab!'true')?lower_case == 'true'>
<#assign hideRegisterOnKcAction = (properties.cfiHideRegisterOnKcAction!'true')?lower_case == 'true'>
<#assign hideTabsOnKcAction = (properties.cfiHideTabsOnKcAction!'true')?lower_case == 'true'>
<#assign lockUsernameOnKcAction = (properties.cfiLockUsernameOnKcAction!'true')?lower_case == 'true'>
<#assign loginActionValue = (url.loginAction!'')>
<#assign loginUrlValue = (url.loginUrl!'')>
<#assign isKcActionFlow = loginActionValue?contains('kc_action=') || loginUrlValue?contains('kc_action=')>
<#assign effectiveShowRegisterTab = showRegisterTab && !(hideRegisterOnKcAction && isKcActionFlow)>
<#assign effectiveShowTabs = !(hideTabsOnKcAction && isKcActionFlow)>
<#assign hasKnownUsername = (login.username!'')?has_content>
<#assign lockUsernameField = lockUsernameOnKcAction && isKcActionFlow && hasKnownUsername>
<#assign hasCredentialFieldErrors = messagesPerField.existsError('username') || messagesPerField.existsError('password')>
<@layout.registrationLayout displayMessage=false displayInfo=realm.resetPasswordAllowed; section>
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

      <#if effectiveShowTabs>
        <div class="cfi-tabs" data-role="auth-tabs">
          <span class="cfi-tab active">Login</span>
          <#if effectiveShowRegisterTab && canRegister>
            <a class="cfi-tab cfi-register-tab" data-role="register-tab" href="${url.registrationUrl}">Register</a>
          <#elseif effectiveShowRegisterTab>
            <span class="cfi-tab cfi-tab-disabled cfi-register-tab" data-role="register-tab">Register</span>
          </#if>
        </div>
      </#if>

      <#if message?has_content && message.type?? && !hasCredentialFieldErrors>
        <div class="cfi-inline-message cfi-inline-${(message.type!'info')?lower_case}" role="alert" aria-live="polite">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <form id="kc-form-login" action="${url.loginAction}" method="post">
        <input type="hidden" id="id-hidden-input" name="credentialId"
          <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>
        />
        <div class="form-group">
          <label for="username">${msg("usernameOrEmail")}</label>
          <input tabindex="1" id="username" class="form-control" name="username" value="${(login.username!'')}" type="text" autofocus autocomplete="username" <#if lockUsernameField>readonly aria-readonly="true"</#if>/>
          <#if messagesPerField.existsError('username')>
            <span id="input-error-username" class="kc-feedback-text" aria-live="polite">${kcSanitize(messagesPerField.get('username'))?no_esc}</span>
          </#if>
        </div>

        <div class="form-group">
          <label for="password">${msg("password")}</label>
          <div class="cfi-password-wrap">
            <input tabindex="2" id="password" class="form-control" name="password" type="password" autocomplete="current-password"/>
            <button type="button" class="cfi-password-toggle" data-target="password" aria-label="Show password" aria-pressed="false">
              <span class="eye-open">Show</span>
              <span class="eye-closed">Hide</span>
            </button>
          </div>
          <#if messagesPerField.existsError('password')>
            <span id="input-error-password" class="kc-feedback-text" aria-live="polite">${kcSanitize(messagesPerField.get('password'))?no_esc}</span>
          </#if>
        </div>

        <#if realm.rememberMe>
          <div class="checkbox" style="margin: 8px 0 14px;">
            <label>
              <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox" <#if login.rememberMe??>checked</#if> />
              ${msg("rememberMe")}
            </label>
          </div>
        </#if>

        <div class="form-group">
          <input tabindex="4" class="btn btn-primary" name="login" id="kc-login" type="submit" value="${msg("doLogIn")}"/>
        </div>
      </form>

      <script>
        (function () {
          var hideRegisterOnKcAction = '${hideRegisterOnKcAction?string("true", "false")}' === 'true';
          var hideTabsOnKcAction = '${hideTabsOnKcAction?string("true", "false")}' === 'true';
          var lockUsernameOnKcAction = '${lockUsernameOnKcAction?string("true", "false")}' === 'true';
          if (hideRegisterOnKcAction) {
            var search = (window.location && window.location.search) ? window.location.search : '';
            var href = (window.location && window.location.href) ? window.location.href : '';
            var isKcActionInBrowserUrl = search.indexOf('kc_action=') !== -1 || href.indexOf('kc_action=') !== -1;
            if (isKcActionInBrowserUrl) {
              var regTabs = document.querySelectorAll('[data-role="register-tab"]');
              for (var t = 0; t < regTabs.length; t++) {
                regTabs[t].style.display = 'none';
              }

              if (hideTabsOnKcAction) {
                var authTabs = document.querySelectorAll('[data-role="auth-tabs"]');
                for (var a = 0; a < authTabs.length; a++) {
                  authTabs[a].style.display = 'none';
                }
              }

              if (lockUsernameOnKcAction) {
                var usernameInput = document.getElementById('username');
                if (usernameInput && usernameInput.value && usernameInput.value.trim().length > 0) {
                  usernameInput.setAttribute('readonly', 'readonly');
                  usernameInput.setAttribute('aria-readonly', 'true');
                }
              }
            }
          }

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
      <#if realm.resetPasswordAllowed>
        <a href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
      </#if>
    </div>
  </#if>
</@layout.registrationLayout>
