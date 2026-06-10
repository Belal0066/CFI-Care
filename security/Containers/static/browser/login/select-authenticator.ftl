<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false displayInfo=false; section>
  <#if section = "header">
  </#if>
  <#if section = "form">
    <div class="cfi-shell">
      <div class="cfi-hero">
        <div class="cfi-brand">
          <div class="cfi-brand-mark" aria-hidden="true">
            <i class="bi bi-activity"></i>
          </div>
          <div class="cfi-brand-copy">
            <h1>CFI-Care</h1>
            <p>AI-Powered Collaborative Health Records</p>
          </div>
        </div>

        <div class="cfi-feature-list" role="list">
          <div class="cfi-feature" role="listitem">
            <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-shield-lock"></i></div>
            <div class="cfi-feature-copy">
              <h3>Alternative Verification</h3>
              <p>Choose an alternate authentication factor to securely verify your identity context.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="cfi-panel">
        <div class="cfi-card" role="region" aria-labelledby="cfi-card-title">
          <div class="cfi-card-head">
            <div>
              <h2 id="cfi-card-title">Select Verification Method</h2>
              <p>Choose your preferred method to complete sign-in</p>
            </div>
          </div>

          <form id="kc-select-credential-form" action="${url.loginAction}" method="post" class="cfi-form">
  <div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 2rem;">
    

    <#assign selections = (auth.authenticationSelections)![]>

    <#if selections?has_content>
      <#list selections as selection>
        <button type="submit" name="authenticationExecution" value="${selection.authExecId}" 
                style="display: flex; align-items: center; text-align: left; width: 100%; gap: 16px; padding: 18px; border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; background: rgba(255,255,255,0.06); color: #fff; font-size: 15px; font-weight: 500; cursor: pointer; transition: background 0.2s ease, border-color 0.2s ease; font-family: inherit;"
                onmouseover="this.style.background='rgba(255,255,255,0.1)'; this.style.borderColor='rgba(255,255,255,0.25)';"
                onmouseout="this.style.background='rgba(255,255,255,0.06)'; this.style.borderColor='rgba(255,255,255,0.15)';">
          
          <div style="color: #38bdf8; font-size: 1.5rem; display: flex; align-items: center;">
            <#assign iconClass = (selection.iconCssClass!"")?lower_case>
            <#assign execId = (selection.authExecId!"")?lower_case>
            
            <#if iconClass?contains("totp") || iconClass?contains("phone") || execId?contains("otp")>
              <i class="bi bi-phone"></i>
            <#else>
              <i class="bi bi-shield-key-fill"></i>
            </#if>
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="color: #fff; font-weight: 600;">${msg(selection.displayName!"")}</span>
            <span style="color: rgba(255,255,255,0.6); font-size: 0.85rem; font-weight: 400;">
              <#if iconClass?contains("totp") || execId?contains("otp")>
                Use your standard authenticator application token.
              <#else>
                Authenticate using a pre-saved fallback security code.
              </#if>
            </span>
          </div>
        </button>
      </#list>
    <#else>
      <p style="color: rgba(255,255,255,0.6); font-size: 0.9rem; text-align: center; margin-bottom: 1rem;">
        No secondary credentials found in current flow profile.
      </p>
    </#if>
    
  </div>
</form>

          <div class="cfi-help" style="margin-top: 1.5rem; text-align: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1.25rem;">
            <#assign hostUrl=url.resourcesCommonPath?keep_before("/keycloak")>

                                    <a href="${hostUrl}/login"> <i class="bi bi-arrow-left-short"></i> Back to Login</a>

          </div>
        </div>
      </div>
    </div>
  </#if>
</@layout.registrationLayout>