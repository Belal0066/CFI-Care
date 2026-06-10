<#import "template.ftl" as layout>
<#import "password-commons.ftl" as passwordCommons>
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
        <span class="cfi-tab active">Reset Password</span>
      </div>

      <#if message?has_content && message.type?? && message.type == 'error'>
        <div class="cfi-inline-message cfi-inline-${(message.type!'info')?lower_case}" role="alert" aria-live="polite">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <form id="kc-passwd-update-form" action="${url.loginAction}" method="post">
        <div class="form-group">
          <label for="password-new">${msg("passwordNew")}</label>
          <div class="cfi-password-wrap">
            <input type="password" id="password-new" class="form-control" name="password-new" autocomplete="new-password" aria-invalid="<#if messagesPerField.existsError('password','password-confirm')>true</#if>" autofocus />
            <button type="button" class="cfi-password-toggle" data-target="password-new" aria-label="Show password" aria-pressed="false">
              <span class="eye-open">Show</span>
              <span class="eye-closed">Hide</span>
            </button>
          </div>

          <#if messagesPerField.existsError('password')>
            <span id="input-error-password-new" class="kc-feedback-text" aria-live="polite">
              ${kcSanitize(messagesPerField.get('password'))?no_esc}
            </span>
          </#if>
        </div>

        <div class="form-group">
          <label for="password-confirm">${msg("passwordConfirm")}</label>
          <div class="cfi-password-wrap">
            <input type="password" id="password-confirm" class="form-control" name="password-confirm" autocomplete="new-password" aria-invalid="<#if messagesPerField.existsError('password-confirm')>true</#if>" />
            <button type="button" class="cfi-password-toggle" data-target="password-confirm" aria-label="Show password" aria-pressed="false">
              <span class="eye-open">Show</span>
              <span class="eye-closed">Hide</span>
            </button>
          </div>

          <#if messagesPerField.existsError('password-confirm')>
            <span id="input-error-password-confirm" class="kc-feedback-text" aria-live="polite">
              ${kcSanitize(messagesPerField.get('password-confirm'))?no_esc}
            </span>
          </#if>
        </div>

        <div class="form-group">
          <@passwordCommons.logoutOtherSessions/>
        </div>

        <div class="form-group" style="margin-top:14px;">
          <input class="btn btn-primary" type="submit" value="${msg("doSubmit")}"/>
          <#if isAppInitiatedAction??>
            <button type="submit" class="btn btn-primary" style="margin-top:10px;background:#9ca3af;" name="cancel-aia" value="true">${msg("doCancel")}</button>
          </#if>
        </div>
      </form>

      <script>
        (function () {
          var toggles = document.querySelectorAll('.cfi-password-toggle');
          for (var i = 0; i < toggles.length; i++) {
            toggles[i].addEventListener('click', function () {
              var targetId = this.getAttribute('data-target');
              var input = document.getElementById(targetId);
              if (!input) return;
              var isHidden = input.type === 'password';
              input.type = isHidden ? 'text' : 'password';
              this.classList.toggle('is-visible', isHidden);
              this.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
              this.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
            });
          }
        })();
      </script>
    </div>
  </#if>
</@layout.registrationLayout>
