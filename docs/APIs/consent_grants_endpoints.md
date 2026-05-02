# Just-In-Time (JIT) Consent Grants API endpoints

## sequence !

1. Patient *requests* a 6-digit OTP, which is then displayed in app
2. Practitioner inputs the OTP to be *verified* for access request
3. Patient receives a notification and *responds to* (approves/denies) the request
4. Grant is issued if approved.

## Endpoints :D

### 1. **Request OTP**
- Endpoint: `POST /request-otp`
- User : Patient
- Description: Generates a unique 6-digit code, invalidates any active OTP for this user

    - Success response (200) :

    ```
    {
    message: "OTP generated successfully",
    otp: otp,
    expiresIn: "10 min"
    }
    ```
### 2. **Verify OTP**

- Endpoint: `POST /verify-otp`
- User : Practitioner
- Description: Practitioner inputs this otp in the browser, links Practitioner's ID to Patient's ID in a pending state.

    - Body: 

    ```
    { "otp": "$otp" }
    ```

    - Success Response (200):

    ```
    {
    message: "OTP verified. Waiting for patient approval.",
    handshakeId,
    targetPatientId: patientId,
    expiresIn: "2 min"
    }
    ```

### 3. **Respond to Grant Request**

- Endpoint: `POST /grants`
- User : Patient
- Description: Patient approves or denies the pending handshake.

    - Body: 

    ```
    {
    "handshakeId": "$handshakeId",
    "approved": $response,
    "durationMinutes": $duration-picked,
    "scopes": ["all.read"] (example)
    }
    ```
    - Success Response (201) :

    ```
    {
    message: "Consent granted",
    grant 
    }
    ```

### 4. **Revoke Access**

- Endpoint: `DELETE /grants/:PractitionerId` 
- User: Patient
- Description: Immediately terminates an active grant
    - Success Response (200):

    ```
     { "message": "Grant revoked" }
    ```