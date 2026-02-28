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
        <p class="cfi-subtitle">Your Health, Our Priority</p>
      </div>

      <div class="cfi-tabs cfi-tabs-single">
        <span class="cfi-tab active">Reset OTP</span>
      </div>

      <#if message?has_content>
        <div class="cfi-inline-message cfi-inline-${(message.type!'info')?lower_case}" role="alert" aria-live="polite">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <form id="kc-otp-reset-form" action="${url.loginAction}" method="post">
        <div class="form-group">
          <p id="kc-otp-reset-form-description" class="cfi-help" style="margin-top: 0; text-align: left;">
            ${msg("otp-reset-description")}
          </p>

          <div class="cfi-otp-list">
            <#list configuredOtpCredentials.userOtpCredentials as otpCredential>
              <label class="cfi-otp-item" for="kc-otp-credential-${otpCredential?index}">
                <input id="kc-otp-credential-${otpCredential?index}" type="radio" name="selectedCredentialId" value="${otpCredential.id}" <#if otpCredential.id == configuredOtpCredentials.selectedCredentialId>checked="checked"</#if>>
                <span>${otpCredential.userLabel}</span>
              </label>
            </#list>
          </div>
        </div>

        <div class="form-group" style="margin-top:14px;">
          <input id="kc-otp-reset-form-submit" class="btn btn-primary" type="submit" value="${msg("doSubmit")}"/>
        </div>
      </form>

      <div class="cfi-help" style="margin-top:8px;">
        <a href="${url.loginUrl}">Back to Login</a>
      </div>
    </div>
  </#if>
</@layout.registrationLayout>
