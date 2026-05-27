<#import "template.ftl" as layout>

<#-- 
  LAYOUT ALIGNMENT FIX: 
  We mimic the exact structural properties of your login page template macro 
  to ensure the layout engine balances the card containers identically.
-->
<@layout.registrationLayout displayMessage=false displayInfo=false; section>
  <#if section = "header">
    ${msg("consentTitle")}
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
            <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-shield-lock"></i></div>
            <div class="cfi-feature-copy">
              <h3>Patient-First Access</h3>
              <p>Clinical data visibility is fully dynamic, transient, </br>and governed completely by explicit patient consent records.</p>
            </div>
          </div>

          <div class="cfi-feature" role="listitem">
            <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-clipboard-check"></i></div>
            <div class="cfi-feature-copy">
              <h3>Automated Audit Trails</h3>
              <p>Every clinical request establishes an immutable, cryptographically </br>signed entry tracking identity and scope usage.</p>
            </div>
          </div>

          <#-- STRUCTURAL INVISIBLE ANCHOR: Keeps flex alignment identical to the login screen with exactly 2 visible boxes -->
          <div class="cfi-feature" style="visibility: hidden; height: 0; margin: 0; padding: 0; overflow: hidden;" aria-hidden="true"></div>
        </div>
      </div>

      <div class="cfi-panel">
        <div class="cfi-card" role="region" aria-labelledby="cfi-card-title">
          <div class="cfi-card-head">
            <div>
              <h2 id="cfi-card-title">Terms & Condititions</h2>
              <p style="margin-top: 0.4rem; font-size: 0.9rem; opacity: 0.8;">
                Review access privileges required for this application context.
              </p>
            </div>
          </div>

          <#if message?has_content>
            <div class="cfi-inline-message cfi-inline-${(message.type!'info')?lower_case}" role="alert" aria-live="polite">
              ${kcSanitize(message.summary)?no_esc}
            </div>
          </#if>

          <form action="${url.oauthAction}" method="post" class="cfi-form" id="kc-consent-form">
            
            <#-- DESIGN OVERHAUL: Expanded max-height container with exact theme-matched dark backgrounds -->
            <div class="cfi-scopes-container" style="background: rgba(109, 114, 138, 0.226); border: 1px solid rgba(95, 154, 222, 0.095); border-radius: 12px; padding: 1.25rem; margin-bottom: 1.5rem; max-height: 340px; overflow-y: auto; box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);">
              <ul style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px;">
                
                <#assign termsRendered = false>

                <#if (consent.clientScopes)??>
                  <#list consent.clientScopes as clientScope>
                    <#assign textValue = clientScope.consentScreenText!"">
                    
                    <#if textValue?contains("practitioner network") || textValue?length gt 120>
                      <#assign termsRendered = true>
                      <li style="display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px; color: #abe5fe; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px; margin-bottom: 4px;">
                          <i class="bi bi-file-earmark-medical-fill" aria-hidden="true"></i>
                          <span style="font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em;">Professional Data Conduct Terms</span>
                        </div>
                        <div style="color: rgba(255, 255, 255, 0.9); font-size: 0.88rem; line-height: 1.6; padding-right: 4px;">
                          <p style="margin: 0 0 12px 0; color: rgba(255,255,255);">Welcome to the CFI-Care practitioner network. As a user of this platform, you agree to the following professional data conduct terms:</p>
                          <p style="margin: 0 0 10px 14px; text-indent: -14px;"><strong style="color: #abe5fe;">• Patient-First Access:</strong> Access to patient health information (PHI) is strictly granted by your patients for a period set by them.</p>
                          <p style="margin: 0 0 10px 14px; text-indent: -14px;"><strong style="color: #abe5fe;">• Data Integrity:</strong> You agree to use clinical data solely for the purpose of the patient's care and to maintain the confidentiality of any information accessed.</p>
                          <p style="margin: 0 0 4px 14px; text-indent: -14px;"><strong style="color: #abe5fe;">• Accountability:</strong> All data accesses are subject to automated auditing. Misuse of access privileges or unauthorized data export will result in immediate account suspension and potential disciplinary action.</p>
                        </div>
                      </li>
                    <#else>
                      <li style="display: flex; align-items: flex-start; gap: 12px;">
                        <div style="color: #abe5fe; margin-top: 2px;" aria-hidden="true">
                          <i class="bi bi-check-circle-fill"></i>
                        </div>
                        <div style="color: #fff; line-height: 1.4;">
                          <span style="font-weight: 500; font-size: 0.95rem; color: #f1f5f9;">${kcSanitize(textValue)?no_esc}</span>
                        </div>
                      </li>
                    </#if>
                  </#list>
                <#else>
                  <li style="display: flex; align-items: flex-start; gap: 12px;">
                    <div style="color: #abe5fe; margin-top: 2px;" aria-hidden="true">
                      <i class="bi bi-check-circle-fill"></i>
                    </div>
                    <div style="color:  rgba(255,255,255); line-height: 1.4;">
                      <span style="font-weight: 500; font-size: 0.95rem;">Standard Identity Profile Access</span>
                    </div>
                  </li>
                </#if>

                <#-- COHESIVE THEME FALLBACK INTERFACE BLOCK -->
                <#if !termsRendered>
                  <li style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px; color: #abe5fe; border-bottom: 1px solid  rgba(255,255,255); padding-bottom: 6px; margin-bottom: 4px;">
                      <i class="bi bi-file-earmark-medical-fill" aria-hidden="true"></i>
                      <span style="font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em;">Professional Data Conduct Terms</span>
                    </div>
                    <div style="color:  rgba(255,255,255); font-size: 0.88rem; line-height: 1.6; padding-right: 4px;">
                      <p style="margin: 0 0 12px 0; color: rgb(255, 255, 255);">Welcome to the CFI-Care practitioner network. As a user of this platform, you agree to the following professional data conduct terms:</p>
                      <p style="margin: 0 0 10px 14px; text-indent: -14px;"><strong style="color: #abe5fe;">• Patient-First Access:</strong> Access to patient health information (PHI) is strictly granted by your patients for a period set by them.</p>
                      <p style="margin: 0 0 10px 14px; text-indent: -14px;"><strong style="color: #abe5fe;">• Data Integrity:</strong> You agree to use clinical data solely for the purpose of the patient's care and to maintain the confidentiality of any information accessed.</p>
                      <p style="margin: 0 0 4px 14px; text-indent: -14px;"><strong style="color: #abe5fe;">• Accountability:</strong> All data accesses are subject to automated auditing. Misuse of access privileges or unauthorized data export will result in immediate account suspension and potential disciplinary action.</p>
                    </div>
                  </li>
                </#if>
              </ul>
            </div>

            <div class="cfi-actions" style="margin-top: 1.5rem; display: flex; flex-direction: column; gap: 12px;">
              <input
                type="submit"
                class="cfi-submit"
                name="accept"
                id="kc-login"
                value="Yes, Allow Access"
                />

              <input
                type="submit"
                class="cfi-submit"
                name="cancel"
                id="kc-cancel"
                value="No, Cancel"
                />
            </div>
          </form>
        </div>
      </div>
    </div>
  </#if> 
</@layout.registrationLayout>