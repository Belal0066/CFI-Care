#!/usr/bin/env python3
"""
Streamlit web interface for Gemma 4 medical FHIR prompt testing.
Streams responses from llama-server using Server-Sent Events (SSE).
"""

import json
import sys
import time
import re
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Load the FHIR validation script
VALIDATION_SCRIPT = Path(__file__).parent.parent / "scripts" / "validate_fhir_output.py"


def load_runtime_defaults() -> dict:
    """Load runtime defaults from config/llama-server.env."""
    defaults = {
        "ctx_size": 6144,
        "max_tokens": 4096,
        "request_timeout_sec": 600,
    }
    env_file = Path(__file__).parent.parent / "config" / "llama-server.env"
    if not env_file.exists():
        return defaults

    try:
        for line in env_file.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            key = key.strip()
            value = value.strip()
            if key == "CTX_SIZE" and value.isdigit():
                defaults["ctx_size"] = int(value)
            elif key == "MAX_TOKENS" and value.isdigit():
                defaults["max_tokens"] = int(value)
    except Exception:
        return defaults

    return defaults


def get_session_state_defaults():
    """Initialize session state defaults."""
    if "server_url" not in st.session_state:
        st.session_state.server_url = "http://localhost:8080"
    if "system_prompt" not in st.session_state:
        st.session_state.system_prompt = load_sample_prompt()
    if "streaming_mode" not in st.session_state:
        st.session_state.streaming_mode = True
    if "response_text" not in st.session_state:
        st.session_state.response_text = ""
    if "parsed_json" not in st.session_state:
        st.session_state.parsed_json = None
    if "last_latency_ms" not in st.session_state:
        st.session_state.last_latency_ms = None
    if "last_input_tokens" not in st.session_state:
        st.session_state.last_input_tokens = None
    if "token_count_method" not in st.session_state:
        st.session_state.token_count_method = None
    if "finish_reason" not in st.session_state:
        st.session_state.finish_reason = None

    runtime_defaults = load_runtime_defaults()
    if "context_window" not in st.session_state:
        st.session_state.context_window = runtime_defaults["ctx_size"]
    if "output_tokens_requested" not in st.session_state:
        st.session_state.output_tokens_requested = runtime_defaults["max_tokens"]
    if "request_timeout_sec" not in st.session_state:
        st.session_state.request_timeout_sec = runtime_defaults["request_timeout_sec"]


def estimate_text_tokens(text: str) -> int:
    """Approximate token count when server-side tokenization is unavailable."""
    if not text:
        return 0
    # Rough approximation: split on words and punctuation-like symbols.
    return len(re.findall(r"\w+|[^\w\s]", text))


def get_server_token_count(base_url: str, text: str) -> int | None:
    """Get token count from llama.cpp tokenize endpoint if available."""
    if not text:
        return 0

    session = create_session_with_retries()
    try:
        response = session.post(
            f"{base_url}/tokenize",
            json={"content": text},
            timeout=10,
        )
        if response.status_code != 200:
            return None

        data = response.json()
        if isinstance(data, dict) and isinstance(data.get("tokens"), list):
            return len(data["tokens"])
    except Exception:
        return None

    return None


def count_input_tokens(base_url: str, prompt: str, markdown_input: str) -> tuple[int, str]:
    """Count request input size in tokens using server tokenizer when possible."""
    combined_text = f"{prompt}\n\n{markdown_input}"
    server_count = get_server_token_count(base_url, combined_text)
    if server_count is not None:
        return server_count, "server-tokenize"
    return estimate_text_tokens(combined_text), "approximation"


def compute_generation_budget(input_tokens: int, context_window: int, requested_output_tokens: int) -> tuple[int, bool]:
    """Compute a safe max_tokens value based on context window and input size."""
    # Reserve room for separators/system overhead to reduce truncation risk.
    safety_reserve = 256
    available = context_window - input_tokens - safety_reserve
    if available <= 0:
        return 256, True
    effective = min(requested_output_tokens, available)
    return max(256, effective), effective < requested_output_tokens


def create_session_with_retries(retries=3, backoff_factor=0.3, timeout=30):
    """Create a requests session with retry strategy."""
    session = requests.Session()
    retry = Retry(
        total=retries,
        read=retries,
        connect=retries,
        backoff_factor=backoff_factor,
        status_forcelist=(500, 502, 504),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


def check_server_health(base_url: str) -> bool:
    """Check if llama-server is running and responding."""
    try:
        session = create_session_with_retries()
        response = session.get(f"{base_url}/health", timeout=5)
        return response.status_code == 200
    except Exception as e:
        st.warning(f"Server health check failed: {e}")
        return False


def stream_fhir_response(
    prompt: str,
    markdown_input: str,
    base_url: str,
    context_window: int,
    requested_output_tokens: int,
    request_timeout_sec: int,
):
    """
    Stream response from llama-server using SSE (Server-Sent Events).
    Uses /v1/chat/completions endpoint for OpenAI-compatible streaming.
    """
    input_tokens, token_count_method = count_input_tokens(
        base_url=base_url,
        prompt=prompt,
        markdown_input=markdown_input,
    )
    effective_max_tokens, budget_limited = compute_generation_budget(
        input_tokens=input_tokens,
        context_window=context_window,
        requested_output_tokens=requested_output_tokens,
    )

    payload = {
        "model": "gemma-4",
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": markdown_input},
        ],
        "temperature": 0.7,
        "top_p": 0.95,
        "max_tokens": effective_max_tokens,
        "stream": True,  # Enable streaming
    }

    session = create_session_with_retries()
    start_time = time.perf_counter()
    
    try:
        response = session.post(
            f"{base_url}/v1/chat/completions",
            json=payload,
            timeout=request_timeout_sec,
            stream=True,
        )
        response.raise_for_status()
    except requests.exceptions.ConnectionError:
        st.error(f"Cannot connect to llama-server at {base_url}. Is it running?")
        return None
    except requests.exceptions.RequestException as e:
        st.error(f"Request error: {e}")
        return None

    # Stream and parse SSE response
    full_response = ""
    finish_reason = None
    placeholder = st.empty()
    
    for line in response.iter_lines():
        if line:
            line = line.decode("utf-8") if isinstance(line, bytes) else line
            
            # Parse SSE format: "data: {json}"
            if line.startswith("data: "):
                if line.strip() == "data: [DONE]":
                    continue
                try:
                    data = json.loads(line[6:])
                    
                    # Extract token from choice
                    if "choices" in data and len(data["choices"]) > 0:
                        choice = data["choices"][0]
                        if choice.get("finish_reason") is not None:
                            finish_reason = choice.get("finish_reason")
                        if "delta" in choice and "content" in choice["delta"]:
                            token = choice["delta"]["content"]
                            if token is None:
                                continue
                            full_response += token
                            
                            # Update display in real-time
                            with placeholder.container():
                                st.code(full_response, language="json")
                except json.JSONDecodeError:
                    pass  # Skip malformed JSON frames

    elapsed_ms = (time.perf_counter() - start_time) * 1000.0
    return {
        "text": full_response,
        "latency_ms": round(elapsed_ms, 2),
        "input_tokens": input_tokens,
        "token_count_method": token_count_method,
        "effective_max_tokens": effective_max_tokens,
        "budget_limited": budget_limited,
        "finish_reason": finish_reason,
    }


def load_sample_markdown() -> str:
    """Load sample medical markdown for testing."""
    ocr_file = Path(__file__).parent.parent / "data" / "OCR" / "cfi care scanner-1.md"
    if ocr_file.exists():
        with open(ocr_file, "r", encoding="utf-8") as f:
            return f.read()
    return "# Sample Medical Report\n\nNo OCR sample found. Enter your own medical markdown."


def load_sample_prompt() -> str:
    """Load the medical FHIR prompt from config."""
    prompt_file = (
        Path(__file__).parent.parent / "prompts" / "gemma4-fhir-medical.txt"
    )
    if prompt_file.exists():
        with open(prompt_file, "r", encoding="utf-8") as f:
            return f.read()
    return "# Medical FHIR Prompt\n\nNo prompt file found."


def extract_json_from_response(text: str) -> dict | None:
    """Try to extract valid JSON from the response."""
    # Try direct JSON parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    
    # Try to find JSON block in markdown code fence
    if "```json" in text:
        try:
            start = text.find("```json") + 7
            end = text.find("```", start)
            if end > start:
                json_str = text[start:end].strip()
                return json.loads(json_str)
        except (json.JSONDecodeError, ValueError):
            pass
    
    # Try to find any JSON object (starts with { and ends with })
    if "{" in text and "}" in text:
        try:
            start = text.find("{")
            # Find matching closing brace
            brace_count = 0
            for i in range(start, len(text)):
                if text[i] == "{":
                    brace_count += 1
                elif text[i] == "}":
                    brace_count -= 1
                    if brace_count == 0:
                        json_str = text[start : i + 1]
                        return json.loads(json_str)
        except (json.JSONDecodeError, ValueError):
            pass
    
    return None


def validate_fhir_json(fhir_json: dict) -> dict:
    """Validate FHIR JSON structure."""
    errors = []
    
    if fhir_json.get("resourceType") != "Bundle":
        errors.append("FAIL: Missing or incorrect resourceType: should be 'Bundle'")
    else:
        errors.append("PASS: resourceType is 'Bundle'")
    
    if "type" not in fhir_json:
        errors.append("FAIL: Missing Bundle type")
    elif fhir_json["type"] not in ["collection", "transaction", "batch", "history", "searchset"]:
        errors.append(f"FAIL: Invalid Bundle type: {fhir_json['type']}")
    else:
        errors.append(f"PASS: Bundle type is valid: {fhir_json['type']}")
    
    if "entry" not in fhir_json:
        errors.append("FAIL: Missing entry array")
        return {"valid": False, "errors": errors}
    
    if not isinstance(fhir_json["entry"], list):
        errors.append("FAIL: Entry must be an array")
        return {"valid": False, "errors": errors}
    
    errors.append(f"PASS: Entry array contains {len(fhir_json['entry'])} resources")
    
    # Check resources
    for i, entry in enumerate(fhir_json["entry"]):
        if "resource" not in entry:
            errors.append(f"FAIL: Entry {i} missing resource object")
            continue
        
        resource = entry["resource"]
        if "resourceType" not in resource:
            errors.append(f"FAIL: Entry {i}: resource missing resourceType")
        elif "id" not in resource:
            errors.append(f"FAIL: Entry {i} ({resource.get('resourceType')}): missing id")
        else:
            errors.append(
                f"PASS: Entry {i}: {resource.get('resourceType')} (id: {resource.get('id')})"
            )
    
    return {"valid": len([e for e in errors if e.startswith("FAIL:")]) == 0, "errors": errors}


def extract_html_tables(markdown_text: str) -> list[str]:
    """Extract raw HTML table blocks from mixed markdown content."""
    if not markdown_text:
        return []
    return re.findall(r"<table[\s\S]*?</table>", markdown_text, flags=re.IGNORECASE)


def main():
    st.set_page_config(
        page_title="Gemma 4 Medical FHIR Prompt Tester",
        layout="wide",
    )
    
    st.title("Gemma 4 Medical to FHIR Converter")
    st.markdown(
        "Test the Gemma 4 medical FHIR prompt by sending medical Markdown and streaming FHIR JSON responses."
    )
    
    get_session_state_defaults()
    
    # Sidebar configuration
    with st.sidebar:
        st.header("Configuration")
        
        server_url = st.text_input(
            "llama-server endpoint",
            value=st.session_state.server_url,
            help="e.g., http://localhost:8080",
        )
        st.session_state.server_url = server_url
        
        # Check server health
        if st.button("Check Server Health"):
            with st.spinner("Checking server..."):
                if check_server_health(server_url):
                    st.success("Server is running")
                else:
                    st.error("Server is not responding")
        
        st.markdown("---")
        st.header("System Prompt")

        st.markdown("---")
        st.header("Generation Limits")
        st.session_state.context_window = st.number_input(
            "Context window (tokens)",
            min_value=1024,
            max_value=262144,
            step=512,
            value=int(st.session_state.context_window),
        )
        st.session_state.output_tokens_requested = st.number_input(
            "Requested output tokens",
            min_value=256,
            max_value=262144,
            step=256,
            value=int(st.session_state.output_tokens_requested),
        )
        st.session_state.request_timeout_sec = st.number_input(
            "Request timeout (seconds)",
            min_value=60,
            max_value=3600,
            step=30,
            value=int(st.session_state.request_timeout_sec),
        )
        
        if st.button("Load Prompt from File"):
            prompt_content = load_sample_prompt()
            st.session_state.system_prompt = prompt_content
            st.success("Prompt loaded")

        with st.expander("API and Connection Documentation", expanded=False):
            st.markdown(
                """
                **Connection endpoints**

                - Health check: `GET /health`
                - Streaming chat completion: `POST /v1/chat/completions`
                - Optional tokenizer: `POST /tokenize`

                **Streaming protocol**

                - Uses Server-Sent Events (SSE)
                - Request body includes `stream: true`
                - Response frames use `data: {...}` and end with `data: [DONE]`

                **Runtime flow**

                1. Validate connectivity with `/health`
                2. Send system + user messages to `/v1/chat/completions`
                3. Read SSE chunks and append token deltas
                4. Parse final JSON and run FHIR validation
                """
            )
        
        system_prompt = st.text_area(
            "System Prompt (for FHIR mapping instructions)",
            height=200,
            key="system_prompt",
        )
    
    # Main content area
    col1, col2 = st.columns([1, 1])
    
    with col1:
        st.header("Medical Input")
        
        # Input mode tabs
        input_tab1, input_tab2 = st.tabs(["Upload Sample", "Paste Markdown"])
        
        with input_tab1:
            if st.button("Load Sample OCR Report"):
                st.session_state.medical_input = load_sample_markdown()
            
            st.info(
                "Click the button above to load the sample lab report (CBC - Complete Blood Count)."
            )
        
        with input_tab2:
            st.session_state.medical_input = st.text_area(
                "Paste medical Markdown (lab reports, clinical notes, etc.)",
                value=st.session_state.get("medical_input", ""),
                height=300,
                key="medical_input_area",
            )
        
        # Preview
        if st.session_state.get("medical_input"):
            st.markdown("### Preview")
            preview_tab1, preview_tab2, preview_tab3 = st.tabs(
                ["Rendered Markdown", "Rendered HTML Tables", "Raw Text"]
            )

            with preview_tab1:
                st.markdown(
                    st.session_state.medical_input,
                    unsafe_allow_html=True,
                )

            with preview_tab2:
                tables = extract_html_tables(st.session_state.medical_input)
                if not tables:
                    st.info("No HTML table blocks found in the current input.")
                for index, table_html in enumerate(tables, start=1):
                    st.markdown(f"Table {index}")
                    components.html(
                        f"""
                        <html>
                          <head>
                            <style>
                              body {{ margin: 0; padding: 6px; font-family: sans-serif; }}
                              table {{ border-collapse: collapse; width: 100%; }}
                              th, td {{ border: 1px solid #b8c2cc; padding: 6px; vertical-align: top; }}
                            </style>
                          </head>
                          <body>
                            {table_html}
                          </body>
                        </html>
                        """,
                        height=260,
                        scrolling=True,
                    )

            with preview_tab3:
                st.text_area(
                    "Full input markdown",
                    value=st.session_state.medical_input,
                    height=320,
                    disabled=True,
                )
    
    with col2:
        st.header("Run Inference")
        
        # Streaming options
        col_opt1, col_opt2 = st.columns([1, 1])
        with col_opt1:
            stream_enabled = st.checkbox("Stream response", value=True)
        with col_opt2:
            auto_validate = st.checkbox("Auto-validate output", value=True)
        
        # Send request button
        if st.button("Send to Gemma 4", type="primary"):
            if not st.session_state.get("medical_input"):
                st.error("Please enter medical markdown first")
            elif not st.session_state.get("system_prompt"):
                st.error("System prompt is missing")
            else:
                st.divider()
                st.header("Streaming Response")
                
                with st.spinner("Connecting to server and streaming response..."):
                    run_result = stream_fhir_response(
                        prompt=st.session_state["system_prompt"],
                        markdown_input=st.session_state["medical_input"],
                        base_url=st.session_state.server_url,
                        context_window=int(st.session_state.context_window),
                        requested_output_tokens=int(st.session_state.output_tokens_requested),
                        request_timeout_sec=int(st.session_state.request_timeout_sec),
                    )
                
                if run_result and run_result.get("text"):
                    st.session_state.response_text = run_result["text"]
                    st.session_state.last_latency_ms = run_result["latency_ms"]
                    st.session_state.last_input_tokens = run_result["input_tokens"]
                    st.session_state.token_count_method = run_result["token_count_method"]
                    st.session_state.finish_reason = run_result.get("finish_reason")
                    st.success("Response received")
                    if run_result.get("budget_limited"):
                        st.warning(
                            "Output token budget was reduced to fit the configured context window. "
                            f"Effective max_tokens={run_result.get('effective_max_tokens')}."
                        )
                    if run_result.get("finish_reason") == "length":
                        st.warning(
                            "Generation stopped due to token limit (finish_reason=length). "
                            "Increase context window or requested output tokens in the sidebar."
                        )
    
    # Response display and validation
    if st.session_state.get("response_text"):
        st.divider()
        st.header("Response Analysis")
        
        resp_tab1, resp_tab2, resp_tab3 = st.tabs(
            ["Raw JSON", "Validation", "Formatted"]
        )
        
        with resp_tab1:
            st.subheader("Raw Response Text")
            st.code(st.session_state.response_text, language="json")
        
        with resp_tab2:
            st.subheader("FHIR R4 Validation")
            
            parsed_json = extract_json_from_response(st.session_state.response_text)
            
            if parsed_json:
                st.session_state.parsed_json = parsed_json
                
                # Run validation
                validation_result = validate_fhir_json(parsed_json)
                
                # Display validation results
                for error_msg in validation_result["errors"]:
                    if error_msg.startswith("PASS:"):
                        st.success(error_msg)
                    else:
                        st.error(error_msg)
                
                # Overall verdict
                if validation_result["valid"]:
                    st.success("FHIR Bundle is structurally valid")
                else:
                    st.warning("Bundle has structural issues")
            else:
                st.error("Could not extract JSON from response")
        
        with resp_tab3:
            st.subheader("Formatted JSON")
            if st.session_state.get("parsed_json"):
                st.json(st.session_state.parsed_json)
            else:
                st.info("Parse the response in the Validation tab first")
        
        # Export option
        st.divider()
        col_exp1, col_exp2 = st.columns([1, 2])
        with col_exp1:
            if st.button("Export JSON"):
                if st.session_state.get("parsed_json"):
                    json_str = json.dumps(
                        st.session_state.parsed_json, indent=2
                    )
                    st.download_button(
                        label="Download FHIR Bundle",
                        data=json_str,
                        file_name="fhir_bundle.json",
                        mime="application/json",
                    )

        st.subheader("Run Metrics")
        metric_col1, metric_col2 = st.columns(2)
        with metric_col1:
            latency_value = st.session_state.get("last_latency_ms")
            st.metric(
                label="Latency",
                value=f"{latency_value:.2f} ms" if latency_value is not None else "N/A",
            )
        with metric_col2:
            token_value = st.session_state.get("last_input_tokens")
            method_value = st.session_state.get("token_count_method")
            label = "Input Size (Tokens)"
            if method_value:
                label = f"Input Size (Tokens, {method_value})"
            st.metric(
                label=label,
                value=str(token_value) if token_value is not None else "N/A",
            )

        finish_reason = st.session_state.get("finish_reason")
        if finish_reason:
            st.caption(f"Finish reason: {finish_reason}")


if __name__ == "__main__":
    main()
