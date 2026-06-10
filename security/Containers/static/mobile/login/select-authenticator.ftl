<#import "template.ftl" as layout>

    <#-- Fallback string check if loginChooseMfaTitle is missing from properties -->
        <#assign titleText=msg("loginChooseMfaTitle")>
            <#if titleText=="loginChooseMfaTitle">
                <#assign titleText="Select Verification Method">
            </#if>

            <@layout.registrationLayout displayMessage=false displayInfo=false; section>
                <#if section="header">
                    ${titleText}
                    <#elseif section="form">
                        <div class="cfi-form">

                            <#-- Mobile Brand Block -->
                                <div class="cfi-brand">
                                    <div class="cfi-logo">
                                        <img class="cfi-logo-img" src="${url.resourcesPath}/img/cfi-logo.png"
                                            alt="CFI-CARE" />
                                    </div>
                                    <h2 class="cfi-title">CFI-CARE</h2>
                                    <p class="cfi-subtitle">Your Health, Our Priority</p>
                                </div>

                                <#-- Blue Heading Bar -->
                                    <div class="cfi-tabs cfi-tabs-single">
                                        <span class="cfi-tab active">${titleText}</span>
                                    </div>

                                    <#if message?has_content>
                                        <div class="cfi-inline-message cfi-inline-${(message.type!'info')?lower_case}"
                                            role="alert">
                                            ${kcSanitize(message.summary)?no_esc}
                                        </div>
                                    </#if>

                                    <form id="kc-select-credential-form" action="${url.loginAction}" method="post">
                                        <div class="cfi-otp-list">

                                            <#assign selections=(auth.authenticationSelections)![]>

                                                <#if selections?has_content>
                                                    <#list selections as selection>
                                                        <button type="submit" name="authenticationExecution"
                                                            value="${selection.authExecId}" class="cfi-otp-item"
                                                            style="width: 100%; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box; min-height: 180px; padding: 32px 24px; text-align: center; margin-bottom: 20px;">

                                                            <#assign iconClass=(selection.iconCssClass!"")?lower_case>
                                                                <#assign execId=(selection.authExecId!"")?lower_case>
                                                                    <#assign
                                                                        displayNameLower=(selection.displayName!"")?lower_case>

                                                                        <#-- Inline Embedded SVG Logic to completely
                                                                            bypass missing webfonts -->
                                                                            <#if iconClass?contains("totp") ||
                                                                                iconClass?contains("phone") ||
                                                                                execId?contains("otp") ||
                                                                                displayNameLower?contains("otp") ||
                                                                                displayNameLower?contains("authenticator")>
                                                                                <#-- Phone Icon (OTP) -->
                                                                                    <span
                                                                                        style="display: block; width: 64px; height: 64px; margin-bottom: 16px; background-image: url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22%231e88e5%22 class=%22bi bi-phone%22 viewBox=%220 0 16 16%22><path d=%22M11 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zM5 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2z%22/><path d=%22M8 14a1 1 0 1 0 0-2 1 1 0 0 0 0 2%22/></svg>'); background-size: contain; background-repeat: no-repeat; background-position: center;"></span>
                                                                                    <#else>
                                                                                        <#-- Shield/Key Lock Icon
                                                                                            (Backup Codes) -->
                                                                                            <span
                                                                                                style="display: block; width: 64px; height: 64px; margin-bottom: 16px; background-image: url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22%231e88e5%22 class=%22bi bi-shield-lock-fill%22 viewBox=%220 0 16 16%22><path fill-rule=%22evenodd%22 d=%22M8 0c-.69 0-1.843.265-2.928.56-1.11.3-2.229.655-2.887.87a1.54 1.54 0 0 0-1.044 1.262c-.596 4.477.787 7.795 2.465 9.99a11.8 11.8 0 0 0 2.517 2.453c.386.273.744.482 1.048.625.28.132.581.24.829.24s.548-.108.829-.24a7 7 0 0 0 1.048-.625 11.8 11.8 0 0 0 2.517-2.453c1.678-2.195 3.061-5.513 2.465-9.99a1.54 1.54 0 0 0-1.044-1.263 63 63 0 0 0-2.887-.87C9.843.266 8.69 0 8 0m0 5a1.5 1.5 0 0 1 .5 2.915l.385 1.99a.5.5 0 0 1-.491.595h-.788a.5.5 0 0 1-.49-.595l.384-1.99A1.5 1.5 0 0 1 8 5%22/></svg>'); background-size: contain; background-repeat: no-repeat; background-position: center;"></span>
                                                                            </#if>

                                                                            <#-- Title Text Row -->
                                                                                <div
                                                                                    style="font-weight: 700; color: var(--cfi-text); font-size: 40px; margin-bottom: 12px; width: 100%;">
                                                                                    <span>${msg(selection.displayName!"")}</span>
                                                                                </div>

                                                                                <#-- Subtitle Description Block -->
                                                                                    <div
                                                                                        style="color: var(--cfi-muted); font-size: 40px; font-weight: 400; line-height: 1.45; text-align: center; width: 100%;">
                                                                                        <#if iconClass?contains("totp")
                                                                                            || execId?contains("otp") ||
                                                                                            displayNameLower?contains("otp")
                                                                                            ||
                                                                                            displayNameLower?contains("authenticator")>
                                                                                            Use your standard
                                                                                            authenticator application
                                                                                            token.
                                                                                            <#else>
                                                                                                Authenticate using a
                                                                                                pre-saved fallback
                                                                                                security code.
                                                                                        </#if>
                                                                                    </div>

                                                        </button>
                                                    </#list>
                                                    <#else>
                                                        <div class="cfi-inline-message cfi-inline-error" role="alert"
                                                            style="text-align: center;">
                                                            <span>No secondary credentials found in current flow
                                                                profile.</span>
                                                        </div>
                                                </#if>

                                        </div>
                                    </form>

                                    <div class="cfi-help">
                                        <a href="${url.loginRestartFlowUrl}">
                                            Back to Login
                                        </a>
                                    </div>
                        </div>
                </#if>
            </@layout.registrationLayout>