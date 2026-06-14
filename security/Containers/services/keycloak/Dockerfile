# FROM quay.io/keycloak/keycloak:latest AS builder

# Enable health and metrics support
# ENV KC_HEALTH_ENABLED=true
# ENV KC_METRICS_ENABLED=true

# Configure a database vendor
# ENV KC_DB=postgres

# WORKDIR /opt/keycloak
# for demonstration purposes only, please make sure to use proper certificates in production instead
# RUN keytool -genkeypair -storepass password -storetype PKCS12 -keyalg RSA -keysize 2048 -dname "CN=server" -alias server -ext "SAN:c=DNS:localhost,IP:127.0.0.1" -keystore conf/server.keystore
# RUN /opt/keycloak/bin/kc.sh build

# FROM quay.io/keycloak/keycloak:26.4.0


FROM maven:3.9.9-eclipse-temurin-17 AS spi-builder
WORKDIR /build

COPY ./fhir-listener/pom.xml ./fhir-listener/pom.xml
COPY ./fhir-listener/src ./fhir-listener/src

RUN mvn -q -f ./fhir-listener/pom.xml clean package -DskipTests


FROM quay.io/keycloak/keycloak@sha256:5f3fb534cde6bf006d79f5912473e5d2c828c707cdfc52e16972803aca9d43dd
# COPY ../../import/ /opt/keycloak/import/

# COPY ./fhir-listener/target/keycloak-fhir-listener-1.0.0.jar /opt/keycloak/providers/
COPY --from=spi-builder /build/fhir-listener/target/keycloak-fhir-listener-1.0.0.jar /opt/keycloak/providers/
RUN /opt/keycloak/bin/kc.sh build


ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]

