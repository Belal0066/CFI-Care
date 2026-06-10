<#import "template.ftl" as layout>

<#assign summary = ((message.summary)!"")>
<#assign actionLink = (actionUri!"")>
<#assign redirectLink = (pageRedirectUri!"")>

<#assign summaryLc = summary?lower_case>
<#assign isPasswordReset = summaryLc?contains("password") && (summaryLc?contains("updat") || summaryLc?contains("reset"))>
<#assign isEmailVerify = summaryLc?contains("email") && summaryLc?contains("verif")>

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
        <span class="cfi-tab active">
          <#if isPasswordReset>Password Updated
          <#elseif isEmailVerify>Email Verification
          <#else>Verification
          </#if>
        </span>
      </div>

      <#if actionLink?has_content>
        <div class="cfi-inline-message cfi-inline-info" role="status" aria-live="polite">
          ${kcSanitize(summary)?no_esc}
        </div>
        <div class="form-group" style="margin-top:14px;">
          <a class="btn btn-primary" href="${actionLink}" style="display:flex;align-items:center;justify-content:center;text-decoration:none;">
            Click here to proceed
          </a>
        </div>
      <#else>
        <div class="cfi-inline-message cfi-inline-success" role="status" aria-live="polite">
          <#if isPasswordReset>
            Your password has been updated successfully.
          <#elseif isEmailVerify>
            Your email has been verified.
          <#else>
            Action completed successfully.
          </#if>
        </div>

        <#if redirectLink?has_content>
          <div class="form-group" style="margin-top:14px;">
            <a class="btn btn-primary" href="${redirectLink}" style="display:flex;align-items:center;justify-content:center;text-decoration:none;">
              Continue
            </a>
          </div>
        </#if>
      </#if>
    </div>
  </#if>
</@layout.registrationLayout>