from fastapi import FastAPI, Request
import requests
import uvicorn

app = FastAPI()

LLAMA_CPP_URL = "http://localhost:8080/v1/chat/completions"

# ✅ Required by Copilot
@app.get("/api/version")
def version():
    return {"version": "0.6.4"}

# ✅ Optional but sometimes used
@app.get("/api/tags")
def tags():
    return {
        "models": [
            {
                "name": "gemma",
                "model": "gemma",
                "modified_at": "2025-01-01T00:00:00Z",
                "size": 0
            }
        ]
    }

# ✅ Core endpoint
@app.post("/api/chat")
async def chat(req: Request):
    body = await req.json()

    messages = body.get("messages", [])

    payload = {
        "model": "gemma",
        "messages": messages,
        "temperature": body.get("temperature", 0.7),
        "stream": False
    }

    r = requests.post(LLAMA_CPP_URL, json=payload)

    if r.status_code != 200:
        return {"error": r.text}

    data = r.json()

    content = data["choices"][0]["message"]["content"]

    # Ollama format
    return {
        "model": "gemma",
        "message": {
            "role": "assistant",
            "content": content
        },
        "done": True
    }

@app.post("/api/show")
async def show(req: Request):
    body = await req.json()
    model = body.get("name", "gemma")

    return {
        "name": model,
        "model": model,
        "modified_at": "2025-01-01T00:00:00Z",
        "size": 0,
        "digest": "fake-digest",
        "details": {
            "parent_model": "",
            "format": "gguf",
            "family": "gemma",
            "families": ["gemma"],
            "parameter_size": "unknown",
            "quantization_level": "unknown"
        }
    }



if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=11436)
