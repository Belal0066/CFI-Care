# Just-In-Time (JIT) Consent Grants API endpoints

## sequence !

1. Patient *requests* a 6-digit OTP, which is then displayed in app
2. Practitioner/Caregiver inputs the OTP to be *verified* for access request
3. Patient receives a notification and *responds to* (approves/denies) the request
4. Grant is issued if approved.

## Endpoints :D

### Handshakes file 
[handshakes.js](../../backend/src/Nodejs/auth/handshakes.js)

#### 1. **Request OTP**
- Method: `POST`
- Endpoint: `/api/handshakes/request-otp`
- User : Patient
- Description: Generates a unique 6-digit code, invalidates any active OTP for this user

    - Success response (200) :

    ```
    {
    message: "OTP generated successfully",
    otp: <otp generated>, 
    expiresIn: "10 min"
    }
    ```

#### 2. ****Verify OTP**
##### 2.a **Verify OTP - Practitioner**
- Method: `POST`
- Endpoint: `/api/handshakes/verify-practitioner-otp`
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
    handshakeId: <uuid>,
    targetPatientId: <patientId>,
    expiresIn: "2 min"
    }
    ```

##### 2.b **Verify OTP - Caregiver**
- Method: `POST`
- Endpoint: `/api/handshakes/verify-caregiver-otp`
- User : Caregiver
- Description: Caregiver inputs this otp in the browser, links Caregiver's ID to Patient's ID in a pending state.

   - Body: 

    ```
    { "otp": "$otp" }
    ```

    - Success Response (200):

    ```
    {
    message: "OTP verified. Waiting for patient approval.",
    handshakeId: <handshakeId>,
    targetPatientId: <patientId>,
    expiresIn: "2 min"
    }
    ```

#### 3. **Respond to Grant Request**
- Method: `POST`
- Endpoint: `/api/handshakes/create-grant`
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

#### 4. List pending handshakes

- Method: `GET`
- Endpoint: `/api/handshakes/pending`
- User : Patient
- Description: Returns pending handshake IDs (handshakes awaiting patient approval).

    - Success Response (200) :

    ```
    {
    "handshakeIds": ["<handshakeId>", "..."]
    }
    ```

#### 5. Handshake status

- Method: `GET`
- Endpoint: `/api/handshakes/status/:handshakeId`
- User : Practitioner/Caregiver
- Description: Returns the current status and details of the handshake (pending/approved/denied/expired), includes grant data when approved

    - Success Response (200) : 

    ```
    {
    "handshakeId": "<uuid>",
    "status": "pending|approved|denied|expired",
    "targetPatientId": "<patientId>",
    "requesterId": "<requesterId>",
    "expiresAt": "<ISO timestamp>",
    "grant": { /* present when approved */ }
    }
    ```
    

### Patient Grants file 
[Patient_grants.js](../../backend/src/Nodejs/grants/Patient_grants.js)

#### 6. **List current patient grants grouped by requester type**
- Method: `GET`
- Endpoint: `/api/patient-grants/grants`
- User : Patient
- Description: Returns active grants grouped into practitioners and caregivers.

   
    - Success Response (200) :

    ```
    {
    "practitioners": [],
    "caregivers": []
    }
    ```

#### 7. **Revoke a practitioner grant**
- Method: `DELETE`
- Endpoint: `/api/patient-grants/grants/:practitionerId`
- User : Patient
- Description: Revokes an active practitioner grant.

   
    - Success Response (200) :

    ```
    {
    "message": "Grant revoked"
    }
    ```

#### 8. **Revoke a caregiver grant**
- Method: `DELETE`
- Endpoint: `/api/patient-grants/caregivers/:caregiverId`
- User : Patient
- Description: Revokes an active caregiver grant and removes caregiver role from target user when no caregiver mappings are left.

   
    - Success Response (200) :

    ```
    {
    "message": "Caregiver access revoked"
    }
    ```

### Practitioner Grants file 
[Practitioner_grants.js](../../backend/src/Nodejs/grants/Practitioner_grants.js)

#### 9. **List patients granted to a practitioner**
- Method: `GET`
- Endpoint: `/api/practitioner-grants/my-patients`
- User : Practitioner
- Description: Returns the list of patients who have granted access to the practitioner.

   
    - Success Response (200) :

    ```
    {
    "patients": []
    }
    ```

### Caregiver Grants file 
[Caregiver_grants.js](../../backend/src/Nodejs/grants/Caregiver_grants.js)

#### 10. **List patients granted to a caregiver**
- Method: `GET`
- Endpoint: `/api/caregiver-grants/my-patients`
- User : Caregiver
- Description: Returns the list of patients who have granted access to the caregiver.

   
    - Success Response (200) :

    ```
    {
    "patients": []
    }
    ```


### FCM Token Issuance file 
[FCM_Token_Issuance.js](../../backend/src/Nodejs/services/FCM_Token_Issuance.js)

#### 11. **Store FCM token**
- Method: `POST`
- Endpoint: `/FCM/fcm-token`
- User : Patient
- Description: Stores the device FCM token in Redis after login.

    - Body: 

    ```
    {
    "fcmToken": "device-token"
    }
    ```
    - Success Response (201) :

    ```
    {
    "message": "FCM token stored"
    }
    ```