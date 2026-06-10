# Mapper: llama.cpp + Unsloth Gemma 4 E4B GGUF

This workspace is prepared to run:
- Engine: `llama.cpp` from `AI_System/llama.cpp`
- Model repo: `unsloth/gemma-4-E4B-it-GGUF`
- Target: production-oriented baseline on RTX 2070 8GB
- Medical Prompt: Gemma 4 medical reasoning for Markdown-to-FHIR JSON transformation

Gemma 4 requires a `llama.cpp` build that includes `gemma4` architecture support. The launcher now checks for that before starting the server.

## 1) Download model

```bash
cd /home/belal/CFI-Care/ai/src/DOC2FHIR/Mapper
bash scripts/download_unsloth_gemma4.sh
```

If the repository requires auth, set token:

```bash
export HF_TOKEN=...
bash scripts/download_unsloth_gemma4.sh
```

## 2) Configure runtime

```bash
cd /home/belal/CFI-Care/ai/src/DOC2FHIR/Mapper
cp config/llama-server.env.example config/llama-server.env
# edit values as needed
```

The configuration includes:
- `LLAMA_SERVER_BIN`: Path to llama-server binary
- `MODEL_DIR` / `MODEL_FILE`: Model location
- `SYSTEM_PROMPT_FILE`: Path to the medical FHIR prompt template (`prompts/gemma4-fhir-medical.txt`)
- `TEMP`, `TOP_P`, `MAX_TOKENS`: Inference parameters tuned for medical reasoning

## 3) Verify prompt configuration

```bash
cd /home/belal/CFI-Care/ai/src/DOC2FHIR/Mapper
cat config/llama-server.env | grep SYSTEM_PROMPT_FILE
cat prompts/gemma4-fhir-medical.txt
- Outputs JSON-only, no conversational text

## 4) Start server

```bash
cd /home/belal/CFI-Care/ai/src/DOC2FHIR/Mapper
bash scripts/run_llama_server.sh
```

The launcher will:
- Validate the model file and Gemma 4 architecture support
- Verify the system prompt file exists and is readable
- Report the prompt location in the startup message
- Start the server with runtime parameters from config


Use the sample OCR markdown to test the Markdown-to-FHIR workflow:

```bash
INPUT=/home/belal/CFI-Care/ai/src/DOC2FHIR/Mapper/data/OCR/cfi\ care\ scanner-1.md
PROMPT=$(cat /home/belal/CFI-Care/ai/src/DOC2FHIR/Mapper/prompts/gemma4-fhir-medical.txt)

# The request structure for llama-server (OpenAI-compatible chat):
# POST /v1/chat/completions
# {
#   "model": "gpt-3.5-turbo",
#   "messages": [
#     {"role": "system", "content": "$PROMPT"},
#     {"role": "user", "content": "$(cat $INPUT)"}
#   ],
#   "temperature": 0.7,
#   "max_tokens": 4096

After the model generates a FHIR Bundle JSON, validate it:

```bash
cd /home/belal/CFI-Care/ai/src/DOC2FHIR/Mapper
python3 scripts/validate_fhir_output.py <path-to-generated-bundle.json>
```

This checks:
- JSON structure is valid (`resourceType: "Bundle"`, correct `type`, `entry` array)
- All resources have required fields (`id`, `resourceType`, `status`)
- All references are logically consistent
- Bundle passes FHIR R4 validator

Example with the reference bundle:

```bash
python3 scripts/validate_fhir_output.py data/FHIR/cfi\ care\ scanner-1.json
```

## 7) Run readiness check

Create or edit `release/checklist-input.json` from the example, then:

```bash
cd /home/belal/CFI-Care/ai/src/DOC2FHIR/Mapper
python3 scripts/release_readiness.py --input release/checklist-input.example.json
```

The readiness score now includes:
- Medical prompt file versioned and loads without error
- FHIR validation tool tested against sample data
- Sample eval bundle validates successfully
- Prompt safety checks in place

## Notes for medical data residency
- Keep inference fully self-hosted.
- Disable external telemetry for request payloads.
- Ensure logs are sanitized before persistence.
