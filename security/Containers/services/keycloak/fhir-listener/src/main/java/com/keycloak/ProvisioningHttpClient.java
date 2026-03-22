package com.keycloak;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

public class ProvisioningHttpClient {
    private final HttpClient http;
    private final ObjectMapper om = new ObjectMapper();

    private final String endpointUrl;
    private final String tokenUrl;
    private final String clientId;
    private final String clientSecret;

    public ProvisioningHttpClient(
            String endpointUrl,
            String tokenUrl,
            String clientId,
            String clientSecret,
            int connectTimeoutMs) {
        this.endpointUrl = endpointUrl;
        this.tokenUrl = tokenUrl;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(connectTimeoutMs))
                .build();
    }

    public void sendRegisterEvent(String userId, String email, String firstName, String lastName, String fullName, String registrationClientId) {
        try {
            String accessToken = getServiceToken();

            Map<String, Object> body = new HashMap<>();
            body.put("eventType", "REGISTER");
            body.put("userId", userId);
            body.put("email", email);
            body.put("firstName", firstName);
            body.put("lastName", lastName);
            body.put("fullName", fullName);
            body.put("registrationClientId", registrationClientId);

            String json = om.writeValueAsString(body);

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(endpointUrl))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + accessToken)
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .build();

            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() < 200 || resp.statusCode() >= 300) {
                System.err.println("[FHIR-LISTENER] provisioning call failed: " + resp.statusCode() + " body=" + resp.body());
            }
        } catch (Exception e) {
            System.err.println("[FHIR-LISTENER] sendRegisterEvent error: " + e.getMessage());
        }
    }

    private String getServiceToken() throws Exception {
        String form = "grant_type=client_credentials"
                + "&client_id=" + enc(clientId)
                + "&client_secret=" + enc(clientSecret);

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(tokenUrl))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form))
                .build();

        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() < 200 || resp.statusCode() >= 300) {
            throw new RuntimeException("Token request failed: " + resp.statusCode() + " " + resp.body());
        }

        JsonNode node = om.readTree(resp.body());
        return node.get("access_token").asText();
    }

    private static String enc(String v) {
        return URLEncoder.encode(v == null ? "" : v, StandardCharsets.UTF_8);
    }
}