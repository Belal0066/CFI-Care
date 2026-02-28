<#import "template.ftl" as layout>
<#import "password-commons.ftl" as passwordCommons>
<@layout.registrationLayout displayRequiredFields=false displayMessage=false displayInfo=false; section>
  <#if section = "header">

  <#elseif section = "form">
    <div class="cfi-form">
      <div class="cfi-brand">
        <div class="cfi-logo">
          <img class="cfi-logo-img" src="${url.resourcesPath}/img/cfi-logo.png" alt="CFI-CARE" />
        </div>
        <h2 class="cfi-title">CFI-CARE</h2>
        <p class="cfi-subtitle">Setup OTP</p>
      </div>

      <div class="cfi-tabs cfi-tabs-single">
        <span class="cfi-tab active">Authenticator Setup</span>
      </div>

      <#if message?has_content && message.type?? && message.type == 'error'>
        <div class="cfi-inline-message cfi-inline-${(message.type!'info')?lower_case}" role="alert" aria-live="polite">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <ol id="kc-totp-settings" class="cfi-totp-steps">
        <li>
          <p>${msg("loginTotpStep1")}</p>
          <ul id="kc-totp-supported-apps" class="cfi-totp-apps">
            <#list totp.supportedApplications as app>
              <li>${msg(app)}</li>
            </#list>
          </ul>
        </li>

        <#if mode?? && mode = "manual">
          <li>
            <p>${msg("loginTotpManualStep2")}</p>
            <p><span id="kc-totp-secret-key" class="cfi-totp-secret">${totp.totpSecretEncoded}</span></p>
            <p><a href="${totp.qrUrl}" id="mode-barcode">${msg("loginTotpScanBarcode")}</a></p>
          </li>
          <li>
            <p>${msg("loginTotpManualStep3")}</p>
            <ul class="cfi-totp-meta">
              <li id="kc-totp-type">${msg("loginTotpType")}: ${msg("loginTotp." + totp.policy.type)}</li>
              <li id="kc-totp-algorithm">${msg("loginTotpAlgorithm")}: ${totp.policy.getAlgorithmKey()}</li>
              <li id="kc-totp-digits">${msg("loginTotpDigits")}: ${totp.policy.digits}</li>
              <#if totp.policy.type = "totp">
                <li id="kc-totp-period">${msg("loginTotpInterval")}: ${totp.policy.period}</li>
              <#elseif totp.policy.type = "hotp">
                <li id="kc-totp-counter">${msg("loginTotpCounter")}: ${totp.policy.initialCounter}</li>
              </#if>
            </ul>
          </li>
        <#else>
          <li>
            <p>${msg("loginTotpStep2")}</p>
            <img id="kc-totp-secret-qr-code" src="data:image/png;base64, ${totp.totpSecretQrCode}" alt="Barcode">
            <p><a href="${totp.manualUrl}" id="mode-manual">${msg("loginTotpUnableToScan")}</a></p>
          </li>
        </#if>

        <li>
          <p>${msg("loginTotpStep3")}</p>
          <p>${msg("loginTotpStep3DeviceName")}</p>
        </li>
      </ol>

      <form action="${url.loginAction}" id="kc-totp-settings-form" method="post">
        <div class="form-group">
          <label for="totp">${msg("authenticatorCode")}</label>
          <input type="text" id="totp" name="totp" class="form-control" autocomplete="one-time-code" inputmode="numeric" aria-invalid="<#if messagesPerField.existsError('totp')>true</#if>" dir="ltr"/>
          <#if messagesPerField.existsError('totp')>
            <span id="input-error-otp-code" class="kc-feedback-text" aria-live="polite">
              ${kcSanitize(messagesPerField.get('totp'))?no_esc}
            </span>
          </#if>

          <input type="hidden" id="totpSecret" name="totpSecret" value="${totp.totpSecret}" />
          <#if mode??><input type="hidden" id="mode" name="mode" value="${mode}"/></#if>
        </div>

        <div class="form-group">
          <label for="userLabel">${msg("loginTotpDeviceName")}</label>
          <input type="text" class="form-control" id="userLabel" name="userLabel" autocomplete="off" aria-invalid="<#if messagesPerField.existsError('userLabel')>true</#if>" dir="ltr"/>
          <#if messagesPerField.existsError('userLabel')>
            <span id="input-error-otp-label" class="kc-feedback-text" aria-live="polite">
              ${kcSanitize(messagesPerField.get('userLabel'))?no_esc}
            </span>
          </#if>
        </div>

        <div class="form-group">
          <@passwordCommons.logoutOtherSessions/>
        </div>

        <div class="form-group" style="margin-top:14px;">
          <#if isAppInitiatedAction??>
            <input type="submit" class="btn btn-primary" id="saveTOTPBtn" value="${msg("doSubmit")}"/>
            <button type="submit" class="btn btn-primary" style="margin-top:10px;background:#9ca3af;" id="cancelTOTPBtn" name="cancel-aia" value="true">${msg("doCancel")}</button>
          <#else>
            <input type="submit" class="btn btn-primary" id="saveTOTPBtn" value="${msg("doSubmit")}"/>
          </#if>
        </div>
      </form>
    </div>
  </#if>
</@layout.registrationLayout>
