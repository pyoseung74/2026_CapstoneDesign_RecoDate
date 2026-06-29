# RecoDate VPS Deployment Guide

This guide deploys RecoDate as:

- Nginx serves `frontend/` at `https://your-domain.com`
- Nginx proxies `/api/*` to FastAPI on `127.0.0.1:8010`
- Uvicorn runs as a `systemd` service
- Certbot issues HTTPS certificates
- The mobile APK uses `https://your-domain.com` as its API base URL

## Recommended Purchase Path

Use one small Ubuntu VPS first.

Recommended server:

- Ubuntu 24.04 LTS
- 1 vCPU
- 1 GB RAM minimum, 2 GB preferred
- 20 GB+ disk
- Region: Seoul, Tokyo, or Singapore

Recommended domain/DNS:

- Cloudflare Registrar if the domain is available there
- Porkbun if you want simple domain search and clear first-year pricing
- Use Cloudflare DNS either way

## Server Setup

Run these on the fresh Ubuntu server:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y python3 python3-venv python3-pip nginx certbot python3-certbot-nginx git unzip
```

Create the app directory:

```bash
sudo mkdir -p /opt/recodate
sudo chown -R $USER:$USER /opt/recodate
```

Upload this project to `/opt/recodate`. The folder should contain:

```text
/opt/recodate/backend
/opt/recodate/frontend
/opt/recodate/.env
```

Install Python dependencies:

```bash
cd /opt/recodate
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
```

## Environment

Create `/opt/recodate/.env` with the real API keys.

Important production values:

```env
CORS_ALLOWED_ORIGINS=https://your-domain.com,capacitor://localhost,https://localhost
CORS_ALLOWED_ORIGIN_REGEX=
ODSAY_REFERER=https://your-domain.com
```

Keep `backend/data/*.db` on the server. They contain the local SQLite data used by the MVP.

## FastAPI Service

Copy the service template:

```bash
sudo cp /opt/recodate/deploy/recodate.service /etc/systemd/system/recodate.service
sudo systemctl daemon-reload
sudo systemctl enable recodate
sudo systemctl start recodate
sudo systemctl status recodate
```

Test locally on the server:

```bash
curl http://127.0.0.1:8010/
```

## Nginx

Copy the Nginx template and replace `your-domain.com`.

```bash
sudo cp /opt/recodate/deploy/nginx-recodate.conf /etc/nginx/sites-available/recodate
sudo nano /etc/nginx/sites-available/recodate
sudo ln -s /etc/nginx/sites-available/recodate /etc/nginx/sites-enabled/recodate
sudo nginx -t
sudo systemctl reload nginx
```

Point the domain DNS `A` record to the VPS public IP before issuing HTTPS.

Then issue HTTPS:

```bash
sudo certbot --nginx -d your-domain.com
```

## Mobile APK

After the domain works in a browser, rebuild the APK with the production URL:

```powershell
node mobile\scripts\prepare-web.mjs https://your-domain.com
npx.cmd cap sync android
cd android
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
.\gradlew.bat assembleDebug
```

The APK will be:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Quick Checks

Browser:

```text
https://your-domain.com
https://your-domain.com/docs
```

API:

```bash
curl https://your-domain.com/
curl -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login_id":"test","password":"test"}'
```

Service logs:

```bash
sudo journalctl -u recodate -f
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
```

