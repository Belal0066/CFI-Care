<#import "template.ftl" as layout>
<#assign canRegister = realm.password && realm.registrationAllowed && !(registrationDisabled??)>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password') displayInfo=realm.resetPasswordAllowed; section>
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

      <div class="cfi-tabs">
        <span class="cfi-tab active">Login</span>
        <#if canRegister>
          <a class="cfi-tab" href="${url.registrationUrl}">Register</a>
        <#else>
          <span class="cfi-tab cfi-tab-disabled">Register</span>
        </#if>
      </div>

      <form id="kc-form-login" action="${url.loginAction}" method="post">
        <input type="hidden" id="id-hidden-input" name="credentialId"
          <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>
        />
        <div class="form-group">
          <label for="username">${msg("usernameOrEmail")}</label>
          <input tabindex="1" id="username" class="form-control" name="username" value="${(login.username!'')}" type="text" autofocus autocomplete="username"/>
          <#if messagesPerField.existsError('username')>
            <span id="input-error-username" class="kc-feedback-text" aria-live="polite">${kcSanitize(messagesPerField.get('username'))?no_esc}</span>
          </#if>
        </div>

        <div class="form-group">
          <label for="password">${msg("password")}</label>
          <input tabindex="2" id="password" class="form-control" name="password" type="password" autocomplete="current-password"/>
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
    </div>
  <#elseif section = "info" >
    <div class="cfi-help">
      <#if realm.resetPasswordAllowed>
        <a href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
      </#if>
    </div>
  </#if>
</@layout.registrationLayout>
