package com.keycloak;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.ws.rs.core.MultivaluedHashMap;
import jakarta.ws.rs.core.MultivaluedMap;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.keycloak.authentication.FormContext;
import org.keycloak.authentication.ValidationContext;
import org.keycloak.http.HttpRequest;
import org.keycloak.models.UserModel;
import org.keycloak.sessions.AuthenticationSessionModel;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class EmailCodeFormActionTest {

 private final EmailCodeFormAction action = new EmailCodeFormAction();

 @Mock
 private ValidationContext validationContext;

 @Mock
 private HttpRequest httpRequest;

 @Mock
 private AuthenticationSessionModel authSession;

 @Mock
 private FormContext formContext;

 @Mock
 private UserModel user;

 @Test
 void secKcEmail006_rejectsWrongCode() {
     MultivaluedMap<String, String> formData = new MultivaluedHashMap<>();
     formData.add("email_code", "111111");

     when(validationContext.getHttpRequest()).thenReturn(httpRequest);
     when(httpRequest.getDecodedFormParameters()).thenReturn(formData);
     when(validationContext.getAuthenticationSession()).thenReturn(authSession);
     when(authSession.getAuthNote("email-code")).thenReturn("222222");

     action.validate(validationContext);

     verify(validationContext).validationError(eq(formData), anyList());
     verify(validationContext, never()).success();
 }

 @Test
 void secKcEmail007_acceptsMatchingCode() {
     MultivaluedMap<String, String> formData = new MultivaluedHashMap<>();
     formData.add("email_code", "111111");

     when(validationContext.getHttpRequest()).thenReturn(httpRequest);
     when(httpRequest.getDecodedFormParameters()).thenReturn(formData);
     when(validationContext.getAuthenticationSession()).thenReturn(authSession);
     when(authSession.getAuthNote("email-code")).thenReturn("111111");

     action.validate(validationContext);

     verify(validationContext).success();
     verify(validationContext, never()).validationError(eq(formData), anyList());
 }

 @Test
 void secKcEmail007b_allowsNullExpectedCode() {
     MultivaluedMap<String, String> formData = new MultivaluedHashMap<>();
     formData.add("email_code", "111111");

     when(validationContext.getHttpRequest()).thenReturn(httpRequest);
     when(httpRequest.getDecodedFormParameters()).thenReturn(formData);
     when(validationContext.getAuthenticationSession()).thenReturn(authSession);
     when(authSession.getAuthNote("email-code")).thenReturn(null);

     action.validate(validationContext);

     verify(validationContext).success();
 }

 @Test
 void secKcEmail008_marksEmailVerifiedOnSuccess() {
     when(formContext.getUser()).thenReturn(user);

     action.success(formContext);

     verify(user).setEmailVerified(true);
 }

 @Test
 void secKcEmail008b_successDoesNotThrowWithoutUser() {
     when(formContext.getUser()).thenReturn(null);

     assertDoesNotThrow(() -> action.success(formContext));
 }

}