# Connecting Remote Llama.cpp to Local MedMCP

Since your Llama.cpp is running on a remote server and `MedMCP` is on your local machine, you need to bridge them using **SSH Port Forwarding**.

## 1. Start `MedMCP` Locally
Open a terminal in VS Code and run:
```bash
# Make sure you are in the MedMCP root
python main.py
```
This starts the server on port **8001**.

## 2. Create SSH Tunnel
You need to forward the remote port `8001` to your local port `8001`.

**Option A: If you are already SSH'd in a terminal**
Actually, you can't easily add a port forward to an active shell session unless you configured it beforehand (SSH `~C` escape sequence might work). 
It is easier to open a **new** terminal locally and run:
```bash
ssh -R 8001:localhost:8001 user@your-remote-server-ip
```

**Option B: If using VS Code Remote - SSH**
1. Go to the **Ports** view (Panel near Terminal).
2. Click **Forward a Port**.
3. Enter `8001`. 
   * *Note: This usually forwards Local -> Remote. For Remote -> Local (Reverse), you typically need to use the SSH command line `-R` method described above.*

## 3. Configure the Remote Client
On your remote server, you need a script that talks to:
1. **Llama.cpp** (Localhost:8080 on remote)
2. **MedMCP** (Localhost:8001 on remote, tunneled from your machine)

I have created a sample script at `docs/remote_client.py`. 
Copy this file to your remote server and run it:

```bash
# On Remote Server
pip install mcp openai
python remote_client.py
```
