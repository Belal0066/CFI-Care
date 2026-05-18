<#import "template.ftl" as layout>
<#import "password-commons.ftl" as passwordCommons>

<@layout.registrationLayout displayRequiredFields=false displayMessage=false displayInfo=false; section>
  <#if section = "header">
  <#elseif section = "form">
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
            <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-shield"></i></div>
            <div class="cfi-feature-copy">
              <h3>Two-Factor Protection</h3>
              <p>Add an extra layer of protection to your account.</p>
            </div>
          </div>

          <div class="cfi-feature" role="listitem">
            <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-phone"></i></div>
            <div class="cfi-feature-copy">
              <h3>Authenticator App</h3>
              <p>Use the QR code or manual key to enroll your device.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="cfi-panel">
        <div class="cfi-card" role="region" aria-labelledby="cfi-card-title" style="max-width: 540px;">
          <div class="cfi-card-head">
            <div>
              <h2 id="cfi-card-title">Authenticator Setup</h2>
              <p>Configure your one-time code generator</p>
            </div>
          </div>

          <#if message?has_content && message.type?? && message.type == 'error'>
            <div class="cfi-inline-message cfi-inline-${(message.type!'info')?lower_case}" role="alert" aria-live="polite">
              ${kcSanitize(message.summary)?no_esc}
            </div>
          </#if>

          <ol id="kc-totp-settings" style="margin: 0 0 2rem 0; padding-left: 20px; color: #fff; line-height: 1.6; font-size: 15px;">
            <li style="margin-bottom: 1.5rem;">
              <p style="margin: 0 0 8px 0; font-weight: 600; font-size: 16px;">${msg("loginTotpStep1")}</p>
              <ul id="kc-totp-supported-apps" style="margin: 0; padding-left: 18px; color: rgba(255,255,255,0.75);">
                <#list totp.supportedApplications as app>
                  <li style="margin-bottom: 4px;">${msg(app)}</li>
                </#list>
              </ul>
            </li>

            <#if mode?? && mode = "manual">
              <li style="margin-bottom: 1.5rem;">
                <p style="margin: 0 0 8px 0; font-weight: 600; font-size: 16px;">${msg("loginTotpManualStep2")}</p>
                <div style="margin: 0 0 12px 0;">
                  <span id="kc-totp-secret-key" class="cfi-inline-message cfi-inline-info" style="display: inline-block; margin: 0; padding: 10px 14px; font-family: monospace; font-size: 14px; letter-spacing: 1px; word-break: break-all;">
                    ${totp.totpSecretEncoded}
                  </span>
                </div>
                <p style="margin: 0;">
                  <a href="${totp.qrUrl}" id="mode-barcode" style="color: #06b6d4; font-weight: 500; text-decoration: underline;">${msg("loginTotpScanBarcode")}</a>
                </p>
              </li>
              <li style="margin-bottom: 1.5rem;">
                <p style="margin: 0 0 8px 0; font-weight: 600; font-size: 16px;">${msg("loginTotpManualStep3")}</p>
                <ul style="margin: 0; padding-left: 18px; color: rgba(255,255,255,0.75);">
                  <li id="kc-totp-type" style="margin-bottom: 4px;">${msg("loginTotpType")}: ${msg("loginTotp." + totp.policy.type)}</li>
                  <li id="kc-totp-algorithm" style="margin-bottom: 4px;">${msg("loginTotpAlgorithm")}: ${totp.policy.getAlgorithmKey()}</li>
                  <li id="kc-totp-digits" style="margin-bottom: 4px;">${msg("loginTotpDigits")}: ${totp.policy.digits}</li>
                  <#if totp.policy.type = "totp">
                    <li id="kc-totp-period" style="margin-bottom: 4px;">${msg("loginTotpInterval")}: ${totp.policy.period}s</li>
                  <#elseif totp.policy.type = "hotp">
                    <li id="kc-totp-counter" style="margin-bottom: 4px;">${msg("loginTotpCounter")}: ${totp.policy.initialCounter}</li>
                  </#if>
                </ul>
              </li>
            <#else>
              <li style="margin-bottom: 1.5rem;">
                <p style="margin: 0 0 12px 0; font-weight: 600; font-size: 16px;">${msg("loginTotpStep2")}</p>
                <div style="background: #fff; padding: 12px; display: inline-block; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.15);">
                  <img id="kc-totp-secret-qr-code"
                       src="data:image/png;base64, ${totp.totpSecretQrCode}"
                       alt="Barcode"
                       style="display: block; max-width: 180px; width: 100%;" />
                </div>
                <p style="margin: 12px 0 0 0;">
                  <a href="${totp.manualUrl}" id="mode-manual" style="color: #06b6d4; font-weight: 500; text-decoration: underline;">${msg("loginTotpUnableToScan")}</a>
                </p>
              </li>
            </#if>

            <li>
              <p style="margin: 0 0 4px 0; font-weight: 600; font-size: 16px;">${msg("loginTotpStep3")}</p>
              <p style="margin: 0; color: rgba(255,255,255,0.75);">${msg("loginTotpStep3DeviceName")}</p>
            </li>
          </ol>

          <form action="${url.loginAction}" id="kc-totp-settings-form" method="post" class="cfi-form" novalidate>
            
            <div class="form-group cfi-floating-group">
              <input type="text"
                     id="totp"
                     name="totp"
                     class="form-control"
                     placeholder=" "
                     autocomplete="one-time-code"
                     inputmode="numeric"
                     aria-invalid="<#if messagesPerField.existsError('totp')>true</#if>"
                     dir="ltr" />
              <label for="totp" class="cfi-floating-label">${msg("authenticatorCode")}</label>
              <#if messagesPerField.existsError('totp')>
                <span id="input-error-otp-code" class="kc-feedback-text" aria-live="polite">
                  ${kcSanitize(messagesPerField.get('totp'))?no_esc}
                </span>
              </#if>

              <input type="hidden" id="totpSecret" name="totpSecret" value="${totp.totpSecret}" />
              <#if mode??>
                <input type="hidden" id="mode" name="mode" value="${mode}" />
              </#if>
            </div>

            <div class="form-group cfi-floating-group">
              <input type="text"
                     class="form-control"
                     id="userLabel"
                     name="userLabel"
                     placeholder=" "
                     autocomplete="off"
                     aria-invalid="<#if messagesPerField.existsError('userLabel')>true</#if>"
                     dir="ltr" />
              <label for="userLabel" class="cfi-floating-label">${msg("loginTotpDeviceName")}</label>
              <#if messagesPerField.existsError('userLabel')>
                <span id="input-error-otp-label" class="kc-feedback-text" aria-live="polite">
                  ${kcSanitize(messagesPerField.get('userLabel'))?no_esc}
                </span>
              </#if>
            </div>

            <div class="cfi-actions" style="margin: 1.5rem 0 2rem;">
              <div class="cfi-remember">
                <@passwordCommons.logoutOtherSessions/>
              </div>
            </div>

            <button type="submit" class="cfi-submit" id="saveTOTPBtn">${msg("doSubmit")}</button>

            <#if isAppInitiatedAction??>
              <button type="submit"
                      class="cfi-submit"
                      style="margin-top: 12px; background: linear-gradient(135deg, #52525b 0%, #3f3f46 100%) !important; box-shadow: none;"
                      id="cancelTOTPBtn"
                      name="cancel-aia"
                      value="true">
                ${msg("doCancel")}
              </button>
            </#if>
          </form>
        </div>
      </div>
    </div>
    <script>
      (function() {
        var sessionLabel = document.querySelector('.cfi-remember label');
        if (sessionLabel) {
          sessionLabel.style.display = 'inline-flex';
          sessionLabel.style.alignItems = 'center';
          sessionLabel.style.gap = '8px';
          sessionLabel.style.cursor = 'pointer';
        }
      })();
    </script>
  </#if>
</@layout.registrationLayout>