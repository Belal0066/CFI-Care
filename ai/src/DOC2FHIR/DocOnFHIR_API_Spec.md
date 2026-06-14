# Upload Document

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: 'DocOnFHIR API'
  version: 1.0.0
paths:
  /v1/documents/upload:
    post:
      summary: Upload Document
      deprecated: false
      description: ''
      operationId: upload_document_v1_documents_upload_post
      tags:
        - Documents
      parameters: []
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                file:
                  type: string
                  contentMediaType: application/octet-stream
                  title: File
                  example: ''
                patient_id:
                  anyOf:
                    - type: string
                    - type: 'null'
                  title: Patient Id
                  example: ''
                pdf_id:
                  anyOf:
                    - type: string
                    - type: 'null'
                  title: Pdf Id
                  example: ''
                upload_time:
                  anyOf:
                    - type: string
                    - type: 'null'
                  title: Upload Time
                  example: ''
                metadata:
                  anyOf:
                    - type: string
                    - type: 'null'
                  title: Metadata
                  example: ''
                correlation_id:
                  anyOf:
                    - type: string
                    - type: 'null'
                  title: Correlation Id
                  example: ''
              required:
                - file
        required: true
      responses:
        '200':
          description: Successful Response
          content:
            application/json:
              schema:
                type: object
                properties: {}
          headers: {}
          x-apidog-name: OK
          x-apidog-ordering: 0
        '400':
          description: Bad Request
          content:
            application/json:
              schema:
                type: object
                properties: {}
          headers: {}
          x-apidog-ordering: 1
        '413':
          description: Request Entity Too Large
          content:
            application/json:
              schema:
                type: object
                properties: {}
          headers: {}
          x-apidog-ordering: 2
        '415':
          description: Unsupported Media Type
          content:
            application/json:
              schema:
                type: object
                properties: {}
          headers: {}
          x-apidog-ordering: 3
        '422':
          description: Validation Error
          content:
            application/json:
              schema:
                type: object
                properties: {}
          headers: {}
          x-apidog-ordering: 4
      security: []
      x-apidog-folder: Documents
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1300210/apis/api-36732777-run
components:
  schemas: {}
  responses: {}
  securitySchemes: {}
servers:
  - url: http://100.117.76.20:8001
    description: DocOnFHIR
security: []

```



# Get Document Status

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: 'DocOnFHIR API'
  version: 1.0.0
paths:
  /v1/documents/{job_id}/status:
    get:
      summary: Get Document Status
      deprecated: false
      description: ''
      operationId: get_document_status_v1_documents__job_id__status_get
      tags:
        - Documents
      parameters:
        - name: job_id
          in: path
          description: ''
          required: true
          example: ''
          schema:
            type: string
            title: Job Id
      responses:
        '200':
          description: Successful Response
          content:
            application/json:
              schema:
                type: object
                properties: {}
          headers: {}
          x-apidog-name: Success
          x-apidog-ordering: 0
        '404':
          description: Not Found
          content:
            application/json:
              schema:
                type: object
                properties: {}
          headers: {}
          x-apidog-ordering: 1
        '422':
          description: Validation Error
          content:
            application/json:
              schema:
                type: object
                properties: {}
          headers: {}
          x-apidog-ordering: 2
      security: []
      x-apidog-folder: Documents
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1300210/apis/api-36732776-run
components:
  schemas: {}
  responses: {}
  securitySchemes: {}
servers:
  - url: http://100.117.76.20:8001
    description: DocOnFHIR
security: []

```


# Get Document Result

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: 'DocOnFHIR API'
  version: 1.0.0
paths:
  /v1/documents/{job_id}/result:
    get:
      summary: Get Document Result
      deprecated: false
      description: ''
      operationId: get_document_result_v1_documents__job_id__result_get
      tags:
        - Documents
      parameters:
        - name: job_id
          in: path
          description: ''
          required: true
          example: ''
          schema:
            type: string
            title: Job Id
      responses:
        '200':
          description: Successful Response
          content:
            application/json:
              schema: {}
          headers: {}
          x-apidog-name: Success
          x-apidog-ordering: 0
        '404':
          description: Not Found
          content:
            application/json:
              schema:
                type: object
                properties: {}
          headers: {}
          x-apidog-ordering: 1
        '422':
          description: Validation Error
          content:
            application/json:
              schema:
                type: object
                properties: {}
          headers: {}
          x-apidog-ordering: 2
      security: []
      x-apidog-folder: Documents
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1300210/apis/api-36793805-run
components:
  schemas: {}
  responses: {}
  securitySchemes: {}
servers:
  - url: http://100.117.76.20:8001
    description: DocOnFHIR
security: []

```
