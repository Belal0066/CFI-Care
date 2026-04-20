# Core DocParse Installation Script
# Run this after creating the virtual environment

echo "Installing Python packages for DocParse..."
echo "This may take 10-15 minutes due to large ML packages (PaddlePaddle ~760MB, PyTorch ~780MB)"
echo ""

source venv/bin/activate

# Install PyTorch with CUDA support first
echo "1/3: Installing PyTorch with CUDA 12.1..."
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# Install PaddlePaddle and PaddleOCR
echo "2/3: Installing PaddlePaddle GPU and PaddleOCR..."
pip install paddlepaddle-gpu paddleocr

# Install remaining dependencies
echo "3/3: Installing remaining dependencies..."
pip install -r requirements.txt

echo ""
echo "Installation complete!"
echo "To test: python test_pipeline.py <path_to_pdf_or_image>"
echo "To start API: cd app && python main.py"
