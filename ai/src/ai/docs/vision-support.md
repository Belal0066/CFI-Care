# MedGemma 1.5 Vision Support

##  Image Analysis with MedGemma

MedGemma 1.5 supports multimodal input (text + images) for medical image analysis.

---

##  What's Supported

- **Medical Images**: X-rays, CT scans, MRI, pathology slides, dermatology images
- **Formats**: JPG, JPEG, PNG, BMP
- **Analysis**: Abnormality detection, diagnosis assistance, image description
- **RAG Integration**: Combines image analysis with retrieved patient context

---

## ️ Using in Streamlit UI

### 1. Start the System
```bash
./scripts/launch_medgemma_rag.sh
```

### 2. Open Browser
Navigate to: **http://localhost:8501/chat** or **https://bws.taild935b3.ts.net/chat**

### 3. Upload Image
1. Click "**Upload medical image**" in the Chat tab
2. Select image (X-ray, CT scan, etc.)
3. Image preview appears on the right
4. Ask your question in the chat input

### 4. Ask Questions
Example queries:
- "What abnormalities do you see in this image?"
- "Analyze this chest X-ray for signs of pneumonia"
- "Describe the findings in this CT scan"
- "Is there any pathology visible?"

---

##  Testing from Command Line

### Basic Image Analysis
```bash
python scripts/test_vision.py --image path/to/xray.jpg --test image
```

### With Patient Context
```bash
python scripts/test_vision.py --image path/to/xray.jpg --test context
```

### All Tests
```bash
python scripts/test_vision.py --image path/to/xray.jpg --test all
```

---

##  Using in Python Code

```python
from src.retrieval.medgemma_rag import medgemma_rag
import base64

# Encode image
with open("xray.jpg", "rb") as f:
    image_data = base64.b64encode(f.read()).decode('utf-8')

# Query with image
result = medgemma_rag.query(
    query="What abnormalities are visible in this X-ray?",
    image_data=image_data
)

print(result["content"])
```

### With Patient Context
```python
result = medgemma_rag.query(
    query="Based on this X-ray and patient history, what is your assessment?",
    patient_id="patient-001",
    image_data=image_data
)
```

---

##  Technical Details

### Image Encoding
Images are converted to base64 and sent to llama.cpp server as:
```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        {"type": "text", "text": "Analyze this X-ray..."},
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}
      ]
    }
  ]
}
```

### Model Configuration
llama.cpp server must be started with `--mmproj` flag:
```bash
./llama.cpp/build/bin/llama-server \
    -m models/medgemma-1.5-4b-it-Q6_K/medgemma-1.5-4b-it-Q6_K.gguf \
    --mmproj models/medgemma-1.5-4b-it-Q6_K/mmproj-F16.gguf \
    --host 0.0.0.0 --port 8000
```

The launcher script (`launch_medgemma_rag.sh`) already includes this.

---

##  Example Use Cases

### 1. Chest X-ray Analysis
```
Upload: chest_xray.jpg
Query: "Analyze this chest X-ray for signs of pneumonia, pleural effusion, or other abnormalities"
```

### 2. Dermatology
```
Upload: skin_lesion.jpg
Query: "Describe this skin lesion. What are the characteristics visible?"
```

### 3. CT Scan Review
```
Upload: brain_ct.jpg
Query: "Review this brain CT scan. Are there any concerning findings?"
```

### 4. Pathology
```
Upload: pathology_slide.jpg
Query: "Analyze this histopathology slide. What cellular features are visible?"
```

### 5. With Patient History
```
Upload: patient_xray.jpg
Patient ID: patient-001
Query: "Given this patient's history of diabetes, assess this foot X-ray"
```

---

##  Best Practices

### 1. Image Quality
- Use high-resolution images when possible
- Ensure good contrast and clarity
- DICOM images should be converted to JPG/PNG first

### 2. Query Formulation
- Be specific about what you want analyzed
- Mention the type of imaging modality if not obvious
- Include relevant clinical context in your query

### 3. Patient Context
- Use patient ID filter to include relevant medical history
- Combine image analysis with retrieved records for better context

### 4. Limitations
- MedGemma is an AI assistant, not a replacement for medical professionals
- Always verify findings with qualified healthcare providers
- Use for educational and research purposes

---

##  Privacy & Security

### Important Notes
- **Do not upload real patient images without proper authorization**
- **Remove all PHI (Protected Health Information) from images**
- **Use de-identified or synthetic images for testing**
- Images are sent to the local llama.cpp server (not cloud)
- Images are not stored permanently (processed in memory)

### For Production Use
1. Implement proper authentication
2. Add audit logging for image uploads
3. Ensure HIPAA compliance
4. Use encrypted connections (HTTPS via Tailscale Funnel)
5. Implement access controls

---

##  Troubleshooting

### Issue: "Model does not support images"
**Solution:** Ensure llama-server was started with `--mmproj` flag:
```bash
# Check if mmproj is loaded
curl http://localhost:8000/v1/models
```

### Issue: Image not rendering in chat
**Solution:** Check image format and size:
- Supported: JPG, JPEG, PNG, BMP
- Max size: ~10MB recommended
- Try converting to JPG if issues persist

### Issue: Slow response with images
**Solution:** 
- Image processing requires more compute
- Larger images take longer
- GPU acceleration helps significantly
- Consider resizing large images before upload

### Issue: Error "base64 decode failed"
**Solution:** Ensure image file is not corrupted:
```bash
# Test image file
file image.jpg
identify image.jpg  # requires ImageMagick
```

---

##  Related Documentation

- [MedGemma RAG Quickstart](medgemma-rag-quickstart.md)
- [Streamlit UI Guide](complete-system-guide.md)
- [API Documentation](medgemma-rag-quickstart.md#api-reference)

---

##  Quick Start Example

1. **Start system**: `./scripts/launch_medgemma_rag.sh`
2. **Open UI**: http://localhost:8501/chat
3. **Upload image**: Click "Upload medical image"
4. **Select file**: Choose X-ray/CT/MRI image
5. **Ask question**: "What abnormalities are visible?"
6. **View analysis**: MedGemma analyzes image + retrieves context
7. **Review findings**: Check response and retrieved contexts

**That's it!** Your medical images are now being analyzed by MedGemma 1.5 with RAG support.
