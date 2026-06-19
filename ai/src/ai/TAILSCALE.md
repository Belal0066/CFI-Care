# Quick Tailscale Funnel Setup

##  Two-Step Setup

### Step 1: Set operator permissions (one-time)
```bash
sudo tailscale set --operator=$USER
```

### Step 2: Run the setup script
```bash
./scripts/setup_tailscale_funnel.sh
```

---

##  Access Your App

After setup, access at:  
**https://bws.taild935b3.ts.net/chat**

---

##  Manual Commands

If you prefer manual setup:

```bash
# Set operator (one-time)
sudo tailscale set --operator=$USER

# Configure funnel
tailscale serve --bg --https=443 --set-path=/chat http://localhost:8501

# Check status
tailscale serve status

# Stop funnel
tailscale serve --https=443 off
```

---

##  Full Documentation

See [docs/tailscale-funnel-setup.md](docs/tailscale-funnel-setup.md) for complete guide including:
- Security considerations
- Authentication options
- Troubleshooting
- Mobile access
