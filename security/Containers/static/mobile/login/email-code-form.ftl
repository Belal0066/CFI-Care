<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=true displayInfo=false; section>
  <#if section = "header">
    Verify Your Email
  <#elseif section = "form">
    <div class="cfi-form cfi-form-otp">
      <div class="cfi-brand">
        <h2 class="cfi-title">Verify Your Email</h2>
        <p class="cfi-subtitle">We've sent a 6-digit verification code to your inbox.</p>
      </div>

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
        <a href="${url.loginUrl}" class="cfi-back-link">
          <i class="bi bi-arrow-left"></i> Cancel & Return to Login
        </a>
      </div>
    </div>
  </#if>
</@layout.registrationLayout>