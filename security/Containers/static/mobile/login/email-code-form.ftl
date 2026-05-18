<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false displayInfo=false; section>
  <#if section = "header">
    <#-- Keep this empty to suppress Keycloak's default unstyled header -->
  <#elseif section = "form">
    
    <#-- Hide Keycloak's default text and unstyled navigation links -->
    <style>
      #kc-username, .instruction, #kc-page-title, a[href*="restartAuth"] { 
        display: none !important; 
      }
    </style>

    <div class="cfi-form cfi-form-otp">
      <#-- Re-integrating the CFI-CARE Brand Identity -->
      <div class="cfi-brand">
        <div class="cfi-logo">
          <img class="cfi-logo-img" src="${url.resourcesPath}/img/cfi-logo.png" alt="CFI-CARE" />
        </div>
        <h2 class="cfi-title">CFI-CARE</h2>
        <p class="cfi-subtitle" style="margin-bottom: 1.5rem;">Your Health, Our Priority</p>
        
        <#-- Verification specific headers -->
        <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin-bottom: 1.5rem;">
        <h3 style="color: #fff; font-size: 1.25rem; margin-bottom: 0.5rem;">Verify Your Email</h3>
        <p class="cfi-subtitle">We've sent a 6-digit verification code to your inbox.</p>
      </div>

      <#-- Error Handling -->
      <#if message?has_content && message.type??>
        <div class="cfi-inline-message cfi-inline-${(message.type!'info')?lower_case}" role="alert" aria-live="polite" style="margin-bottom: 20px; color: #fff; background-color: rgba(220, 53, 69, 0.2); border: 1px solid #dc3545; padding: 10px; border-radius: 6px; font-size: 0.9rem;">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <form id="kc-otp-login-form" action="${url.loginAction}" method="post">
        <div class="form-group">
          <label for="email_code">Verification Code</label>
          <input type="text" id="email_code" name="email_code" class="form-control" 
                 placeholder="000000" inputmode="numeric" pattern="[0-9]*" maxlength="6" 
                 autocomplete="one-time-code" autofocus />
        </div>

        <button type="submit" class="btn btn-primary">
          Confirm & Create Account
        </button>
      </form>
      
      <div class="cfi-help" style="margin-top: 20px;">
        <a href="${url.loginRestartFlowUrl}" class="cfi-back-link">
          <i class="bi bi-arrow-left"></i> Cancel & Return to Login
        </a>
      </div>
    </div>
  </#if>
</@layout.registrationLayout>