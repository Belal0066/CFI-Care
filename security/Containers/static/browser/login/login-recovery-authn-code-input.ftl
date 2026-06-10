<#import "template.ftl" as layout>


    <@layout.registrationLayout displayMessage=false displayInfo=false; section>
        <#if section="header">
            ${msg("auth-recovery-code-header")}
            <#elseif section="form">
                <div class="cfi-shell">
                    <div class="cfi-hero">
                        <div class="cfi-brand">
                            <div class="cfi-brand-mark" aria-hidden="true">
                                <i class="bi bi-key"></i>
                            </div>
                            <div class="cfi-brand-copy">
                                <h1>CFI-Care</h1>
                                <p>AI-Powered Collaborative Health Records</p>
                            </div>
                        </div>

                        <div class="cfi-feature-list" role="list">
                            <div class="cfi-feature" role="listitem">
                                <div class="cfi-feature-icon" aria-hidden="true"><i class="bi bi-shield-check"></i>
                                </div>
                                <div class="cfi-feature-copy">
                                    <h3>Recovery Sign-In</h3>
                                    <p>Use a backup code when your authenticator is unavailable.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="cfi-panel">
                        <div class="cfi-card" role="region" aria-labelledby="cfi-card-title">
                            <div class="cfi-card-head">
                                <div>
                                    <h2 id="cfi-card-title">Recovery Authentication Code</h2>
                                    <p>Enter one code from your saved list</p>
                                </div>
                            </div>

                            <#if message?has_content>
                                <div class="cfi-inline-message cfi-inline-${(message.type!'info')?lower_case}"
                                    role="alert" aria-live="polite">
                                    ${kcSanitize(message.summary)?no_esc}
                                </div>
                            </#if>

                            <form id="kc-recovery-code-login-form" class="cfi-form"
                                onsubmit="login.disabled = true; return true;" action="${url.loginAction}"
                                method="post">
                                <div class="form-group cfi-floating-group">
                                    <input tabindex="1" id="recoveryCodeInput" name="recoveryCodeInput"
                                        class="form-control" placeholder=" " autocomplete="one-time-code"
                                        inputmode="numeric" autofocus dir="ltr"
                                        aria-invalid="<#if messagesPerField.existsError('recoveryCodeInput')>true</#if>" />
                                    <label for="recoveryCodeInput"
                                        class="cfi-floating-label">${msg("auth-recovery-code-prompt",
                                        recoveryAuthnCodesInputBean.codeNumber?c)}</label>
                                    <#if messagesPerField.existsError('recoveryCodeInput')>
                                        <span id="input-error" class="kc-feedback-text" aria-live="polite">
                                            ${kcSanitize(messagesPerField.get('recoveryCodeInput'))?no_esc}
                                        </span>
                                    </#if>
                                </div>

                                <button tabindex="2" class="cfi-submit" name="login" id="kc-login"
                                    type="submit">${msg("doLogIn")}</button>
                            </form>

                            <div class="cfi-help"
                                style="margin-top: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                                <#assign hostUrl=url.resourcesCommonPath?keep_before("/keycloak")>

                                    <a href="${hostUrl}/login"> <i class="bi bi-arrow-left-short"></i> Back to Login</a>


                                    <form action="${url.loginAction}" method="post" id="kc-select-back-form"
                                        style="display: inline; margin: 0; padding: 0;">
                                        <#-- Satisfies the recovery authenticator's backend check to prevent
                                            NullPointerException -->
                                            <input type="hidden" name="recoveryCodeInput" value="" />

                                            <button type="submit" name="tryAnotherWay" value="on"
                                                class="cfi-link-button"
                                                style="background: none; border: none; padding: 0; margin: 0; font-weight: 600; color:rgba(255,255,255,0.7); font-size: 1rem; cursor: pointer;">
                                                Try Another Way <i class="bi bi-arrow-right-short"></i>
                                            </button>
                                    </form>
                            </div>
                        </div>
                    </div>
                </div>
        </#if>
    </@layout.registrationLayout>