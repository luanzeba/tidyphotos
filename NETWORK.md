# TidyPhotos Network Access Guide

## ✅ Local Network Access (Current Setup)

TidyPhotos is now configured to be accessible from other devices on your local network.

### Starting the Server
```bash
npm run dev
```

The server will show:
```
TidyPhotos server listening on:
  Local:   http://127.0.0.1:8080
  Network: http://192.168.1.201:8080 (accessible from other devices)
```

### Access URLs

**From this computer:**
- http://127.0.0.1:8080
- http://localhost:8080

**From other devices on your network:**
- **iPhone/iPad:** http://192.168.1.201:8080
- **Other computers:** http://192.168.1.201:8080
- **Android phones:** http://192.168.1.201:8080

### Testing Network Access

1. **Start TidyPhotos** on your main computer: `npm run dev`
2. **Find your phone's browser** and navigate to: `http://192.168.1.201:8080`
3. **Test functionality:**
   - Photo viewing should work
   - Favorite toggle ('f' key or heart icon)
   - Timeline filtering
   - Search functionality

### Troubleshooting

**Can't connect from other devices?**
- Check that both devices are on the same WiFi network
- Try disabling firewall temporarily to test
- Verify the IP address: `ifconfig | grep "inet " | grep -v 127.0.0.1`

**IP address changed?**
- Your router may assign different IPs. Update the code in `src/main.zig` line 42

---

## 🌐 Remote Access Options (For Later)

### Option 1: Dynamic DNS + Port Forwarding
**Pros:** Free, reliable
**Cons:** Requires router configuration, security considerations

**Setup:**
1. Configure port forwarding on router (8080 → your computer)
2. Set up dynamic DNS (DuckDNS, No-IP)
3. Access via: `https://yourname.duckdns.org:8080`

### Option 2: Tailscale (Recommended)
**Pros:** Easy setup, secure, works anywhere
**Cons:** Requires Tailscale on all devices

**Setup:**
1. Install Tailscale on server and devices
2. Access via Tailscale IP: `http://100.x.x.x:8080`

### Option 3: Cloudflare Tunnel
**Pros:** No port forwarding needed, free
**Cons:** More complex setup

**Setup:**
1. Install `cloudflared`
2. Create tunnel: `cloudflared tunnel --url http://localhost:8080`
3. Access via: `https://random-words.trycloudflare.com`

### Option 4: VPN to Home Network
**Pros:** Secure, full network access
**Cons:** Requires VPN server setup

---

## Security Considerations

⚠️ **Important:** TidyPhotos currently has no authentication. For remote access:

1. **Add authentication** before exposing to internet
2. **Use HTTPS** for secure connections
3. **Consider VPN** for safest remote access
4. **Firewall rules** to restrict access

## Next Steps

1. ✅ Test local network access from your phone
2. Choose remote access method based on your needs
3. Implement authentication if going remote
4. Set up chosen remote access solution