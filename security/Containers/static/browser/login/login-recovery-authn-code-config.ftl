<#import "template.ftl" as layout>
<#import "password-commons.ftl" as passwordCommons>

<@layout.registrationLayout displayMessage=false displayInfo=false; section>
  <#if section = "header">
    ${msg("recovery-code-config-header")}
  <#elseif section = "form">
    <div class="cfi-shell">
      <div class="cfi-hero">
        <div class="cfi-brand">
          <div class="cfi-brand-mark" aria-hidden="true">
            <i class="bi bi-shield-lock"></i>
          </div>
          <div class="cfi-brand-copy">
            <h1>CFI-Care</h1>
            <p>AI-Powered Collaborative Health Records</p>
          </div>
        </div>

        <div class="cfi-feature-list" role="list">
          <div class="cfi-feature" role="listitem">
            <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-exclamation-triangle"></i></div>
            <div class="cfi-feature-copy">
              <h3>Backup Codes</h3>
              <p>Store these recovery codes somewhere safe before leaving this page.</p>
            </div>
          </div>

          <div class="cfi-feature" role="listitem">
            <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-lock"></i></div>
            <div class="cfi-feature-copy">
              <h3>One-Time View</h3>
              <p>These codes are only shown once and can be used if your authenticator is unavailable.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="cfi-panel">
        <div class="cfi-card" role="region" aria-labelledby="cfi-card-title">
          <div class="cfi-card-head">
            <div>
              <h2 id="cfi-card-title">Recovery Codes</h2>
              <p>${msg("recovery-code-config-warning-title")}</p>
            </div>
          </div>

          <#if message?has_content>
            <div class="cfi-inline-message cfi-inline-${(message.type!'info')?lower_case}" role="alert" aria-live="polite">
              ${kcSanitize(message.summary)?no_esc}
            </div>
          </#if>

          <div class="cfi-inline-message cfi-inline-warning" role="alert" aria-live="polite" style="margin-bottom: 1.5rem;">
            ${msg("recovery-code-config-warning-message")}
          </div>

          <ol id="kc-recovery-codes-list" style="margin: 0 0 1.5rem 0; padding-left: 1.25rem; color: #fff; font-family: monospace; line-height: 1.8;">
            <#list recoveryAuthnCodesConfigBean.generatedRecoveryAuthnCodesList as code>
              <li>${code[0..3]}-${code[4..7]}-${code[8..]}</li>
            </#list>
          </ol>

          <div class="cfi-actions" style="display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 1.25rem;">
            <button id="printRecoveryCodes" class="cfi-submit" type="button" style="margin: 0; width: auto; min-width: 120px; background: linear-gradient(135deg, #334155 0%, #0f172a 100%); box-shadow: none;">
              ${msg("recovery-codes-print")}
            </button>
            <button id="downloadRecoveryCodes" class="cfi-submit" type="button" style="margin: 0; width: auto; min-width: 120px; background: linear-gradient(135deg, #0f766e 0%, #115e59 100%); box-shadow: none;">
              ${msg("recovery-codes-download")}
            </button>
            <button id="copyRecoveryCodes" class="cfi-submit" type="button" style="margin: 0; width: auto; min-width: 120px; background: linear-gradient(135deg, #334155 0%, #1e293b 100%); box-shadow: none;">
              ${msg("recovery-codes-copy")}
            </button>
          </div>

          <div class="cfi-inline-message cfi-inline-info" role="note" style="margin-bottom: 1.25rem;">
            ${msg("recovery-codes-confirmation-message")}
          </div>

          <form action="${url.loginAction}" id="kc-recovery-codes-settings-form" method="post" class="cfi-form" novalidate>
            <input type="hidden" name="generatedRecoveryAuthnCodes" value="${recoveryAuthnCodesConfigBean.generatedRecoveryAuthnCodesAsString}" />
            <input type="hidden" name="generatedAt" value="${recoveryAuthnCodesConfigBean.generatedAt?c}" />
            <input type="hidden" id="userLabel" name="userLabel" value="${msg("recovery-codes-label-default")}" />

            <div class="cfi-actions" style="margin: 0 0 1.5rem 0;">
              <@passwordCommons.logoutOtherSessions/>
            </div>

            <div class="cfi-actions" style="margin-bottom: 1.5rem;">
              <label style="display: inline-flex; align-items: center; gap: 10px; color: rgba(255,255,255,0.9); cursor: pointer;">
                <input class="form-check-input" type="checkbox" id="kcRecoveryCodesConfirmationCheck" name="kcRecoveryCodesConfirmationCheck"
                  onchange="document.getElementById('saveRecoveryAuthnCodesBtn').disabled = !this.checked;" />
                <span>${msg("recovery-codes-confirmation-message")}</span>
              </label>
            </div>

            <#if isAppInitiatedAction??>
              <button type="submit"
                      class="cfi-submit"
                      id="saveRecoveryAuthnCodesBtn"
                      disabled
                      style="margin-top: 0; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%) !important;">
                ${msg("recovery-codes-action-complete")}
              </button>
              <button type="submit"
                      class="cfi-submit"
                      id="cancelRecoveryAuthnCodesBtn"
                      name="cancel-aia"
                      value="true"
                      style="margin-top: 12px; background: linear-gradient(135deg, #52525b 0%, #3f3f46 100%) !important; box-shadow: none;">
                ${msg("recovery-codes-action-cancel")}
              </button>
            <#else>
              <button type="submit"
                      class="cfi-submit"
                      id="saveRecoveryAuthnCodesBtn"
                      disabled
                      style="margin-top: 0; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%) !important;">
                ${msg("recovery-codes-action-complete")}
              </button>
            </#if>
          </form>
        </div>
      </div>
    </div>

    <script>
      <#outputformat "JavaScript">
      function parseRecoveryCodeList() {
        var recoveryCodes = document.querySelectorAll("#kc-recovery-codes-list li");
        var recoveryCodeList = "";

        for (var i = 0; i < recoveryCodes.length; i++) {
          recoveryCodeList += recoveryCodes[i].innerText + "\r\n";
        }

        return recoveryCodeList;
      }

      function copyRecoveryCodes() {
        var tmpTextarea = document.createElement("textarea");
        tmpTextarea.value = parseRecoveryCodeList();
        document.body.appendChild(tmpTextarea);
        tmpTextarea.select();
        document.execCommand("copy");
        document.body.removeChild(tmpTextarea);
      }

      function formatCurrentDateTime() {
        var dt = new Date();
        var options = {
          month: "long",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "numeric",
          timeZoneName: "short"
        };

        return dt.toLocaleString("en-US", options);
      }

      function buildDownloadContent() {
        var recoveryCodeList = parseRecoveryCodeList();
        return ${msg("recovery-codes-download-file-header")?c} + "\n\n" +
          recoveryCodeList + "\n" +
          ${msg("recovery-codes-download-file-description")?c} + "\n\n" +
          ${msg("recovery-codes-download-file-date")?c} + " " + formatCurrentDateTime();
      }

      function setUpDownloadLinkAndDownload(filename, text) {
        var el = document.createElement("a");
        el.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(text));
        el.setAttribute("download", filename);
        el.style.display = "none";
        document.body.appendChild(el);
        el.click();
        document.body.removeChild(el);
      }

      function downloadRecoveryCodes() {
        setUpDownloadLinkAndDownload("kc-download-recovery-codes.txt", buildDownloadContent());
      }

      function buildPrintContent() {
        var recoveryCodeListHTML = document.getElementById("kc-recovery-codes-list").parentNode.innerHTML;
        var styles =
          "@page { size: auto; margin-top: 0; }" +
          "body { width: 480px; }" +
          "div { font-family: monospace; }" +
          "p:first-of-type { margin-top: 48px; }";

        return "<html><style>" + styles + "</style><body>" +
          "<title>kc-download-recovery-codes</title>" +
          "<p>" + ${msg("recovery-codes-download-file-header")?c} + "</p>" +
          "<div>" + recoveryCodeListHTML + "</div>" +
          "<p>" + ${msg("recovery-codes-download-file-description")?c} + "</p>" +
          "<p>" + ${msg("recovery-codes-download-file-date")?c} + " " + formatCurrentDateTime() + "</p>" +
          "</body></html>";
      }

      function printRecoveryCodes() {
        var w = window.open();
        w.document.write(buildPrintContent());
        w.print();
        w.close();
      }

      var copyButton = document.getElementById("copyRecoveryCodes");
      copyButton && copyButton.addEventListener("click", copyRecoveryCodes);

      var downloadButton = document.getElementById("downloadRecoveryCodes");
      downloadButton && downloadButton.addEventListener("click", downloadRecoveryCodes);

      var printButton = document.getElementById("printRecoveryCodes");
      printButton && printButton.addEventListener("click", printRecoveryCodes);
      </#outputformat>
    </script>
  </#if>
</@layout.registrationLayout>