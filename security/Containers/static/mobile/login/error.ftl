<#import "template.ftl" as layout>
<#assign summary = (message.summary!"Action expired.")>

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
        <span class="cfi-tab active">Link Expired</span>
      </div>

      <div class="cfi-inline-message cfi-inline-warning" role="alert" aria-live="polite">
        ${kcSanitize(summary)?no_esc}
      </div>

      <div class="form-group" style="margin-top:14px;">
        <#if url.loginUrl??>
          <a class="btn btn-primary" href="${url.loginUrl}" style="display:flex;align-items:center;justify-content:center;text-decoration:none;">
            Back to Login
          </a>
        <#elseif pageRedirectUri??>
          <a class="btn btn-primary" href="${pageRedirectUri}" style="display:flex;align-items:center;justify-content:center;text-decoration:none;">
            Continue
          </a>
        </#if>
      </div>
    </div>
  </#if>
</@layout.registrationLayout>