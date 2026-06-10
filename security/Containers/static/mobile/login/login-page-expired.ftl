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
        <span class="cfi-tab active">Session Expired</span>
      </div>

      <div class="cfi-inline-message cfi-inline-warning" role="alert" aria-live="polite">
        <p>
          To restart the login process,
          <#if url.loginRestartFlowUrl??>
            <a href="${url.loginRestartFlowUrl}">click here</a>.
          <#elseif url.loginUrl??>
            <a href="${url.loginUrl}">go to login</a>.
          <#else>
            please go back to login.
          </#if>
        </p>
        <p>
          To continue the current login process,
          <#if url.loginAction??>
            <a href="${url.loginAction}">click here</a>.
          <#elseif url.loginUrl??>
            <a href="${url.loginUrl}">go to login</a>.
          <#else>
            please go back to login.
          </#if>
        </p>
      </div>
    </div>
  </#if>
</@layout.registrationLayout>