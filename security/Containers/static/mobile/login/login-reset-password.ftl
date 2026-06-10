<#import "template.ftl" as layout>
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
        <span class="cfi-tab active">Reset Password</span>
      </div>

      <#if message?has_content>
        <div class="cfi-inline-message cfi-inline-${message.type!"info"}" role="alert" aria-live="polite">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <form id="kc-reset-password-form" action="${url.loginAction}" method="post">
        <div class="form-group">
          <label for="username">${msg("usernameOrEmail")}</label>
          <input tabindex="1" id="username" class="form-control" name="username" type="text" autofocus autocomplete="username"/>
          <#if messagesPerField.existsError('username')>
            <span class="kc-feedback-text" aria-live="polite">${kcSanitize(messagesPerField.get('username'))?no_esc}</span>
          </#if>
        </div>

        <div class="form-group" style="margin-top:14px;">
          <input tabindex="2" class="btn btn-primary" type="submit" value="${msg("doSubmit")}"/>
        </div>
      </form>
    </div>

  <#elseif section = "info" >
    <div class="cfi-help">
       <a href="${url.loginRestartFlowUrl}">
              Back to Login
        </a>
    </div>
  </#if>
</@layout.registrationLayout>
