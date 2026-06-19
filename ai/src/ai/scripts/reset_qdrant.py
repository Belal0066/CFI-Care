import requests
from qdrant_client import QdrantClient

# Configuration
QDRANT_HOST = "localhost"
QDRANT_PORT = 6333
COLLECTION_NAME = "clinical_embeddings"

def reset_qdrant():
    print(f"Connecting to Qdrant at {QDRANT_HOST}:{QDRANT_PORT}...")
    try:
        client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
        
        # Check if collection exists
        collections = client.get_collections().collections
        exists = any(c.name == COLLECTION_NAME for c in collections)
        
        if exists:
            print(f"Deleting existing collection '{COLLECTION_NAME}'...")
            client.delete_collection(COLLECTION_NAME)
            print("Collection deleted.")
        else:
            print(f"Collection '{COLLECTION_NAME}' does not exist.")
            
        print("Reset complete. The backend will recreate it with the new schema on next request.")
        return True
    except Exception as e:
        print(f"Error resetting Qdrant: {e}")
        return False

if __name__ == "__main__":
    reset_qdrant()
