<#import "template.ftl" as layout>
<#assign summary = (message.summary!"")>

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
        <span class="cfi-tab active">Verification</span>
      </div>

      <#if actionUri?has_content>
        <#if summary?has_content>
          <div class="cfi-inline-message cfi-inline-info" role="status" aria-live="polite">
            ${kcSanitize(summary)?no_esc}
          </div>
        </#if>

        <div class="form-group" style="margin-top:14px;">
          <a class="btn btn-primary" href="${actionUri}" style="display:flex;align-items:center;justify-content:center;text-decoration:none;">
            Click here to proceed
          </a>
        </div>
      <#else>
        <div class="cfi-inline-message cfi-inline-success" role="status" aria-live="polite">
          Your email has been verified.
        </div>
      </#if>
    </div>
  </#if>
</@layout.registrationLayout>