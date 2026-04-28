import urllib.request
import json
import time

def test_server():
    url = "http://127.0.0.1:8002/mcp/query"
    data = {"query": "Patient with hypertension"}
    params = json.dumps(data).encode('utf8')
    req = urllib.request.Request(url, data=params, headers={'content-type': 'application/json'})
    
    print(f"Testing {url}...")
    try:
        response = urllib.request.urlopen(req, timeout=5)
        print("Status Code:", response.getcode())
        print("Response:", response.read().decode('utf8'))
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # Wait a bit just in case (though server is already running)
    test_server()
