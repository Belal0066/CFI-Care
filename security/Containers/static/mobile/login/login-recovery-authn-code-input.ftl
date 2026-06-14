<#import "template.ftl" as layout>

    <@layout.registrationLayout displayMessage=true displayInfo=false; section>
        <#if section="header">
            ${msg("auth-recovery-code-header")}
            <#elseif section="form">
                <div class="cfi-form">
                    <#-- Mobile Brand Block -->
                        <div class="cfi-brand">
                            <div class="cfi-logo">
                                <img class="cfi-logo-img" src="${url.resourcesPath}/img/cfi-logo.png" alt="CFI-CARE" />
                            </div>
                            <h2 class="cfi-title">CFI-CARE</h2>
                            <p class="cfi-subtitle">Your Health, Our Priority</p>
                        </div>

                        <div class="cfi-tabs cfi-tabs-single">
                            <span class="cfi-tab active">Backup Recovery</span>
                        </div>

                        <#if message?has_content>
                            <div class="cfi-inline-message cfi-inline-${(message.type!'info')?lower_case}" role="alert">
                                ${kcSanitize(message.summary)?no_esc}
                            </div>
                        </#if>

                        <#-- Strictly Input and Form Actions -->
                            <form id="kc-recovery-code-login-form" action="${url.loginAction}" method="post">
                                <div class="form-group">
                                    <label for="recoveryCodeInput">
                                        ${msg("auth-recovery-code-prompt", recoveryAuthnCodesInputBean.codeNumber?c)}
                                    </label>
                                    <input tabindex="1" id="recoveryCodeInput" name="recoveryCodeInput"
                                        class="form-control" type="text" autocomplete="one-time-code" autofocus
                                        dir="ltr" />
                                </div>

                                <div class="cfi-form-actions">
                                    <input tabindex="2" class="btn btn-primary" name="login" id="kc-login" type="submit"
                                        value="${msg(" doLogIn")}" />
                                </div>
                            </form>

                            <div class="cfi-help">
                                <a href="${url.loginRestartFlowUrl}">
                                    Back to Login
                                </a>
                                <form action="${url.loginAction}" method="post"
                                    style="display: inline; margin: 0; padding: 0;">
                                    <input type="hidden" name="recoveryCodeInput" value="" />
                                    <button type="submit" name="tryAnotherWay" value="on" class="cfi-help"
                                        style="background: none !important; border: none !important; padding: 0 !important; cursor: pointer; font-family: inherit;">
                                        <a>Try Another Way </a>
                                    </button>
                                </form>
                            </div>
                </div>
        </#if>
    </@layout.registrationLayout>