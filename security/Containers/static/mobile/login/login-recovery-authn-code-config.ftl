<#import "template.ftl" as layout>
<#import "password-commons.ftl" as passwordCommons>

<@layout.registrationLayout displayMessage=false displayInfo=false; section>
  <#if section = "header">
    ${msg("recovery-code-config-header")}
  <#elseif section = "form">

    <div class="cfi-form">
      <#-- Mobile Brand Block -->
      <div class="cfi-brand">
        <div class="cfi-logo">
          <img class="cfi-logo-img" src="${url.resourcesPath}/img/cfi-logo.png" alt="CFI-CARE" />
        </div>
        <h2 class="cfi-title">CFI-CARE</h2>
        <p class="cfi-subtitle">Your Health, Our Priority</p>
      </div>

      <#-- Configuration Status Pill -->
      <div class="cfi-tabs cfi-tabs-single" data-role="verify-identity-pill">
        <span class="cfi-tab active">Backup Recovery Codes</span>
      </div>

      <#if message?has_content>
        <div class="cfi-inline-message cfi-inline-${(message.type!'info')?lower_case}" role="alert" aria-live="polite">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <div class="cfi-inline-message cfi-inline-warning" role="alert" aria-live="polite">
        ${msg("recovery-code-config-warning-message")}
      </div>

      <#-- Unified Card Block for Codes -->
      <div class="cfi-codes-card">
        <ol class="cfi-mobile-codes-grid" id="kc-recovery-codes-list">
          <#list recoveryAuthnCodesConfigBean.generatedRecoveryAuthnCodesList as code>
            <li>${code[0..3]}-${code[4..7]}-${code[8..]}</li>
          </#list>
        </ol>
      </div>

      <#-- Upgraded Utility Action Row -->
      <div class="cfi-utility-row">
        <button id="copyRecoveryCodes" type="button" class="btn">
          <i class="bi bi-clipboard"></i> Copy
        </button>
        <button id="downloadRecoveryCodes" type="button" class="btn">
          <i class="bi bi-download"></i> Save
        </button>
        <button id="printRecoveryCodes" type="button" class="btn">
          <i class="bi bi-printer"></i> Print
        </button>
      </div>

      <form action="${url.loginAction}" id="kc-recovery-codes-settings-form" method="post" novalidate>
        <input type="hidden" name="generatedRecoveryAuthnCodes" value="${recoveryAuthnCodesConfigBean.generatedRecoveryAuthnCodesAsString}" />
        <input type="hidden" name="generatedAt" value="${recoveryAuthnCodesConfigBean.generatedAt?c}" />
        <input type="hidden" id="userLabel" name="userLabel" value="${msg("recovery-codes-label-default")}" />

        <div style="display: none;">
          <@passwordCommons.logoutOtherSessions/>
        </div>

        <#-- Fixed Checkbox Layout Component -->
        <div class="checkbox">
          <label class="cfi-checkbox-container">
            <input type="checkbox" id="kcRecoveryCodesConfirmationCheck" name="kcRecoveryCodesConfirmationCheck"
                   onchange="document.getElementById('saveRecoveryAuthnCodesBtn').disabled = !this.checked;" />
            <span>I have stored these backup recovery codes safely.</span>
          </label>
        </div>

        <#-- Primary and Cancel Action Buttons Form Group -->
        <div class="form-group cfi-form-actions">
          <input type="submit" class="btn btn-primary" id="saveRecoveryAuthnCodesBtn" disabled value="${msg("recovery-codes-action-complete")}" />
          <button type="submit" class="btn btn-primary" id="cancelRecoveryAuthnCodesBtn" name="cancel-aia" value="true">
            ${msg("recovery-codes-action-cancel")}
          </button>
        </div>
      </form>
    </div>

    <script>
      <#outputformat "JavaScript">
      function parseRecoveryCodeList() {
        var recoveryCodes = document.querySelectorAll("#kc-recovery-codes-list li");
        var recoveryCodeList = "";
        for (var i = 0; i < recoveryCodes.length; i++) {
          var codeText = recoveryCodes[i].innerText.replace(/^\d+\.\s*/, '').trim();
          recoveryCodeList += codeText + "\r\n";
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
        
        var btn = document.getElementById("copyRecoveryCodes");
        var origText = btn.innerHTML;
        btn.innerHTML = '<i class="bi bi-check-circle"></i> Done';
        setTimeout(function() { btn.innerHTML = origText; }, 2000);
      }

      function formatCurrentDateTime() {
        var dt = new Date();
        return dt.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "numeric" });
      }

      function buildDownloadContent() {
        return ${msg("recovery-codes-download-file-header")?c} + "\n\n" +
          parseRecoveryCodeList() + "\n" +
          ${msg("recovery-codes-download-file-description")?c} + "\n\n" +
          ${msg("recovery-codes-download-file-date")?c} + " " + formatCurrentDateTime();
      }

      function downloadRecoveryCodes() {
        var el = document.createElement("a");
        el.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(buildDownloadContent()));
        el.setAttribute("download", "cfi-care-recovery-codes.txt");
        el.style.display = "none";
        document.body.appendChild(el);
        el.click();
        document.body.removeChild(el);
      }

      function buildPrintContent() {
        var recoveryCodeListHTML = document.getElementById("kc-recovery-codes-list").innerHTML;
        var styles =
          "@page { size: auto; margin: 20mm; }" +
          "body { font-family: sans-serif; color: var(--cfi-text); }" +
          "h2 { color: var(--cfi-text); border-bottom: 2px solid var(--cfi-border); padding-bottom: 8px; }" +
          ".cfi-mobile-codes-grid { display: block; list-style-type: none; padding: 0; }" +
          ".cfi-mobile-codes-grid li { background: #f9fafb; border: 2px solid var(--cfi-border); padding: 14px; font-family: monospace; font-size: 20px; font-weight: bold; text-align: center; margin-bottom: 8px; }";

        return "<html><head><style>" + styles + "</style></head><body>" +
          "<h2>CFI-Care Backup Recovery Codes</h2>" +
          "<p>" + ${msg("recovery-codes-download-file-header")?c} + "</p>" +
          "<ol class='cfi-mobile-codes-grid'>" + recoveryCodeListHTML + "</ol>" +
          "<p style='margin-top:20px; font-size:14px; color:var(--cfi-muted);'>" + ${msg("recovery-codes-download-file-description")?c} + "</p>" +
          "<p style='font-size:14px; color:var(--cfi-muted);'>" + ${msg("recovery-codes-download-file-date")?c} + " " + formatCurrentDateTime() + "</p>" +
          "</body></html>";
      }

      function printRecoveryCodes() {
        var w = window.open();
        w.document.write(buildPrintContent());
        w.document.close();
        w.focus();
        setTimeout(function() { w.print(); w.close(); }, 500);
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