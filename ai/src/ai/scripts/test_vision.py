#!/usr/bin/env python3
"""
Test MedGemma 1.5 Vision Capabilities
"""
import sys
from pathlib import Path
import base64

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.retrieval.medgemma_rag import medgemma_rag


def encode_image(image_path: str) -> str:
    """Encode image to base64."""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')


def test_text_only():
    """Test text-only query."""
    print("=" * 60)
    print("TEST 1: Text-Only Query")
    print("=" * 60)
    
    result = medgemma_rag.query(
        query="What are the symptoms of pneumonia?"
    )
    
    print(f"\nQuery: What are the symptoms of pneumonia?")
    print(f"\nResponse:\n{result['content']}")
    print(f"\nContexts used: {result['contexts_used']}")


def test_with_image(image_path: str):
    """Test query with medical image."""
    print("\n" + "=" * 60)
    print("TEST 2: Query with Medical Image")
    print("=" * 60)
    
    # Encode image
    print(f"\nLoading image: {image_path}")
    try:
        image_data = encode_image(image_path)
        print(f"✓ Image encoded ({len(image_data)} bytes)")
    except Exception as e:
        print(f"✗ Failed to load image: {e}")
        return
    
    # Query with image
    result = medgemma_rag.query(
        query="What abnormalities do you see in this medical image? Provide a detailed analysis.",
        image_data=image_data
    )
    
    print(f"\nQuery: Analyze this medical image")
    print(f"\nResponse:\n{result['content']}")
    print(f"\nContexts used: {result['contexts_used']}")


def test_image_with_context(image_path: str):
    """Test image analysis with patient context."""
    print("\n" + "=" * 60)
    print("TEST 3: Image + Patient Context")
    print("=" * 60)
    
    try:
        image_data = encode_image(image_path)
        print(f"✓ Image loaded: {image_path}")
    except Exception as e:
        print(f"✗ Failed to load image: {e}")
        return
    
    # Query with image and patient filter
    result = medgemma_rag.query(
        query="Based on this X-ray and the patient's medical history, what is your assessment?",
        patient_id="patient-001",
        image_data=image_data
    )
    
    print(f"\nQuery: Analyze X-ray with patient-001's history")
    print(f"\nResponse:\n{result['content']}")
    print(f"\nContexts used: {result['contexts_used']}")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Test MedGemma Vision")
    parser.add_argument(
        "--image",
        help="Path to medical image file",
        default=None
    )
    parser.add_argument(
        "--test",
        choices=["text", "image", "context", "all"],
        default="all"
    )
    
    args = parser.parse_args()
    
    print(" MedGemma 1.5 Vision Testing")
    print("=" * 60)
    
    if args.test in ["text", "all"]:
        test_text_only()
    
    if args.test in ["image", "context", "all"]:
        if not args.image:
            print("\n️  No image provided. Use --image <path> to test vision capabilities")
            print("   Example: python test_vision.py --image xray.jpg")
        else:
            if args.test in ["image", "all"]:
                test_with_image(args.image)
            if args.test in ["context", "all"]:
                test_image_with_context(args.image)
    
    print("\n" + "=" * 60)
    print("✓ Testing complete")


if __name__ == "__main__":
    main()
