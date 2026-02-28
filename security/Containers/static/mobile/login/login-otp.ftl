<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false displayInfo=false; section>
  <#if section = "header">

  <#elseif section = "form">
    <div class="cfi-form">
      <div class="cfi-brand">
        <div class="cfi-logo">
          <img class="cfi-logo-img" src="${url.resourcesPath}/img/cfi-logo.png" alt="CFI-CARE" />
        </div>
        <h2 class="cfi-title">CFI-CARE</h2>
        <p class="cfi-subtitle">Two-Factor Verification</p>
      </div>

      <div class="cfi-tabs cfi-tabs-single">
        <span class="cfi-tab active">OTP Code</span>
      </div>

      <#if message?has_content>
        <div class="cfi-inline-message cfi-inline-${(message.type!'info')?lower_case}" role="alert" aria-live="polite">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <form id="kc-otp-login-form" action="${url.loginAction}" method="post" onsubmit="login.disabled = true; return true;">
        <#if otpLogin.userOtpCredentials?size gt 1>
          <div class="form-group">
            <label>${msg("loginChooseAuthenticator")}</label>
            <div class="cfi-otp-list">
              <#list otpLogin.userOtpCredentials as otpCredential>
                <label class="cfi-otp-item" for="kc-otp-credential-${otpCredential?index}">
                  <input id="kc-otp-credential-${otpCredential?index}" type="radio" name="selectedCredentialId" value="${otpCredential.id}" <#if otpCredential.id == otpLogin.selectedCredentialId>checked="checked"</#if>>
                  <span>${otpCredential.userLabel}</span>
                </label>
              </#list>
            </div>
          </div>
        </#if>

        <div class="form-group">
          <label for="otp">${msg("loginOtpOneTime")}</label>
          <input id="otp" name="otp" type="text" class="form-control" autocomplete="one-time-code" inputmode="numeric" autofocus aria-invalid="<#if messagesPerField.existsError('totp')>true</#if>" dir="ltr"/>
          <#if messagesPerField.existsError('totp')>
            <span id="input-error-otp-code" class="kc-feedback-text" aria-live="polite">
              ${kcSanitize(messagesPerField.get('totp'))?no_esc}
            </span>
          </#if>
        </div>

        <div class="form-group" style="margin-top:14px;">
          <input class="btn btn-primary" name="login" id="kc-login" type="submit" value="${msg("doLogIn")}"/>
        </div>
      </form>
    </div>
  </#if>
</@layout.registrationLayout>
