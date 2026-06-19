# Tailscale Funnel Setup for MedGemma RAG

##  Expose Streamlit via Tailscale Funnel

Access your MedGemma RAG interface from anywhere at:  
**https://bws.taild935b3.ts.net/chat**

---

##  Quick Setup

### 1. Launch the Services
```bash
./scripts/launch_medgemma_rag.sh
```

### 2. Setup Tailscale Funnel
```bash
./scripts/setup_tailscale_funnel.sh
```

That's it! Your Streamlit app is now accessible at:  
**https://bws.taild935b3.ts.net/chat**

---

##  Manual Setup (Alternative)

If you prefer manual configuration:

### Step 1: Configure Streamlit
The `.streamlit/config.toml` is already configured with:
```toml
[server]
baseUrlPath = "/chat"
address = "0.0.0.0"
port = 8501
```

### Step 2: Enable Tailscale Funnel
```bash
# Serve Streamlit on HTTPS with /chat path
tailscale serve --bg --https=443 --set-path=/chat http://localhost:8501

# Or use funnel (legacy command)
tailscale funnel --bg --https=443 --set-path=/chat http://localhost:8501
```

### Step 3: Verify
```bash
# Check funnel status
tailscale serve status

# Test locally first
curl http://localhost:8501/chat

# Then test via Tailscale
curl https://bws.taild935b3.ts.net/chat
```

---

##  Configuration Details

### Streamlit Config
Location: `.streamlit/config.toml`

```toml
[server]
port = 8501
address = "0.0.0.0"
baseUrlPath = "/chat"
enableCORS = false
enableXsrfProtection = true
```

### Tailscale Serve Config
```bash
# View current configuration
tailscale serve status

# Example output:
# https://bws.taild935b3.ts.net (tailnet + internet)
# |-- /chat proxy http://127.0.0.1:8501
```

---

## ️ Management Commands

### Check Status
```bash
# Tailscale status
tailscale status

# Funnel status
tailscale serve status

# Test local Streamlit
curl http://localhost:8501/chat
```

### Stop Funnel
```bash
# Stop serving on HTTPS
tailscale serve --https=443 off

# Or stop all serving
tailscale serve reset
```

### Restart Funnel
```bash
# After making changes, restart:
tailscale serve --https=443 off
tailscale serve --bg --https=443 --set-path=/chat http://localhost:8501
```

---

##  Security Considerations

### 1. Add Authentication (Recommended)
Streamlit doesn't have built-in auth. Consider:

**Option A: Tailscale ACLs** (Best for tailnet-only)
```json
// In Tailscale admin console, restrict access
{
  "acls": [
    {"action": "accept", "src": ["group:admins"], "dst": ["bws:443"]}
  ]
}
```

**Option B: Add Password Protection**
Install streamlit-authenticator:
```bash
pip install streamlit-authenticator
```

Add to `streamlit_rag_app.py`:
```python
import streamlit_authenticator as stauth

# At top of app
names = ['Admin']
usernames = ['admin']
passwords = ['your-hashed-password']

authenticator = stauth.Authenticate(
    names, usernames, passwords,
    'medgemma_rag', 'secret_key', 30
)

name, authentication_status, username = authenticator.login('Login', 'main')

if not authentication_status:
    st.stop()
```

**Option C: Reverse Proxy with Auth**
Use nginx/caddy with basic auth in front of Streamlit.

### 2. Monitor Access
```bash
# View Tailscale logs
tailscale status
tailscale debug logs

# Check who's accessing
# Visit: https://login.tailscale.com/admin/machines
```

### 3. Restrict to Tailnet Only
```bash
# Serve only to tailnet (not internet)
tailscale serve --bg --https=443 --set-path=/chat --tailnet http://localhost:8501
```

---

##  Access Methods

### From Anywhere (Internet)
```
https://bws.taild935b3.ts.net/chat
```

### From Tailnet Devices
```
https://bws/chat
https://bws.taild935b3.ts.net/chat
```

### Local Development
```
http://localhost:8501/chat
http://localhost:8501  (also works without /chat)
```

---

##  Troubleshooting

### Issue: 404 Not Found
**Solution:** Ensure baseUrlPath is set correctly
```bash
# Check Streamlit config
cat .streamlit/config.toml | grep baseUrlPath

# Restart Streamlit with correct path
streamlit run src/ui/streamlit_rag_app.py --server.baseUrlPath /chat
```

### Issue: Connection Refused
**Solution:** Check if Streamlit is running
```bash
curl http://localhost:8501/chat

# If not running:
./scripts/launch_medgemma_rag.sh
```

### Issue: Tailscale Funnel Not Working
**Solution:** Check funnel status and permissions
```bash
# Verify funnel is enabled for your tailnet
tailscale serve status

# Check if you have funnel permissions
# Visit: https://login.tailscale.com/admin/acls
# Ensure funnel is enabled in ACLs
```

### Issue: CSS/Assets Not Loading
**Solution:** Streamlit handles this automatically with baseUrlPath

If assets still don't load, add to Streamlit config:
```toml
[server]
enableStaticServing = true
```

### Issue: WebSocket Connection Failed
**Solution:** Ensure Tailscale properly forwards WebSocket
```bash
# Tailscale serve supports WebSocket by default
# But verify with:
tailscale serve status
```

---

##  Mobile Access

Access from mobile devices on your Tailscale network:
1. Install Tailscale app on mobile
2. Connect to your tailnet
3. Open: **https://bws.taild935b3.ts.net/chat**

---

##  Update Workflow

When you update the app:
```bash
# 1. Stop services
Ctrl+C (in launcher terminal)

# 2. Make changes to code

# 3. Restart
./scripts/launch_medgemma_rag.sh

# Funnel continues running in background automatically
```

---

##  Performance Tips

### 1. Use Caching
Streamlit app already uses `@st.cache_resource` for model loading.

### 2. Limit Concurrent Users
Streamlit handles multiple users, but llama-server might be a bottleneck.

### 3. Monitor Resources
```bash
# Check resource usage
htop

# Check llama-server
tail -f logs/llama-server.log
```

---

##  Complete Setup Checklist

- [ ] Tailscale installed and running
- [ ] Services launched (`./scripts/launch_medgemma_rag.sh`)
- [ ] Data seeded (`python scripts/quick_seed_rag.py`)
- [ ] Funnel configured (`./scripts/setup_tailscale_funnel.sh`)
- [ ] Tested local access: http://localhost:8501/chat
- [ ] Tested remote access: https://bws.taild935b3.ts.net/chat
- [ ] (Optional) Authentication configured
- [ ] (Optional) ACLs configured in Tailscale admin

---

##  Resources

- [Tailscale Funnel Docs](https://tailscale.com/kb/1223/funnel/)
- [Tailscale Serve Docs](https://tailscale.com/kb/1242/tailscale-serve/)
- [Streamlit Deployment](https://docs.streamlit.io/deploy)
- [Streamlit baseUrlPath](https://docs.streamlit.io/develop/api-reference/configuration/config.toml)

---

##  You're Done!

Your MedGemma RAG interface is now accessible at:

**https://bws.taild935b3.ts.net/chat**

Share this URL with your team (on your Tailscale network) or make it public via Funnel settings.
