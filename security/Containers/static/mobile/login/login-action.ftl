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
        <span class="cfi-tab active">Verify Email</span>
      </div>

      <div class="cfi-inline-message cfi-inline-info" role="status" aria-live="polite">
        <#if message?has_content>
          <p>${kcSanitize(message.summary)?no_esc}</p>
        <#else>
          <p>Please confirm your email verification to continue.</p>
        </#if>
      </div>

      <div class="form-group" style="margin-top:14px;">
        <a class="btn btn-primary" href="${url.loginAction}" style="display:flex;align-items:center;justify-content:center;text-decoration:none;">
          Click here to proceed
        </a>
      </div>
    </div>
  </#if>
</@layout.registrationLayout>