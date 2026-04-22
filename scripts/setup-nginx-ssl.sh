#!/usr/bin/env bash
set -euo pipefail

# Provisions Nginx reverse proxy + Let's Encrypt SSL for this backend on Ubuntu/Debian EC2.
#
# Usage:
#   sudo DOMAIN=api.example.com CERTBOT_EMAIL=ops@example.com APP_PORT=5000 APP_NAME=rnr-backend \
#     ./scripts/setup-nginx-ssl.sh
#
# Optional:
#   INCLUDE_WWW=true        # also request cert for www.DOMAIN
#   APP_HOST=127.0.0.1      # upstream host (default 127.0.0.1)

DOMAIN="${DOMAIN:-}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
APP_NAME="${APP_NAME:-rnr-backend}"
APP_PORT="${APP_PORT:-5000}"
APP_HOST="${APP_HOST:-127.0.0.1}"
INCLUDE_WWW="${INCLUDE_WWW:-false}"

if [[ -z "$DOMAIN" ]]; then
  echo "Error: DOMAIN is required. Example: DOMAIN=api.example.com"
  exit 1
fi

if [[ -z "$CERTBOT_EMAIL" ]]; then
  echo "Error: CERTBOT_EMAIL is required. Example: CERTBOT_EMAIL=ops@example.com"
  exit 1
fi

if [[ "$EUID" -ne 0 ]]; then
  echo "Error: run as root (use sudo)."
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "Error: this script currently supports Ubuntu/Debian (apt-get required)."
  exit 1
fi

echo "[1/8] Installing Nginx + Certbot dependencies..."
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx

echo "[2/8] Writing Nginx site configuration..."
NGINX_SITE_PATH="/etc/nginx/sites-available/${APP_NAME}.conf"
cat > "$NGINX_SITE_PATH" <<EOF
server {
  listen 80;
  listen [::]:80;
  server_name ${DOMAIN};

  client_max_body_size 25m;

  location / {
    proxy_pass http://${APP_HOST}:${APP_PORT};
    proxy_http_version 1.1;

    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;

    # WebSocket support
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
EOF

echo "[3/8] Enabling site and disabling default Nginx site..."
ln -sfn "$NGINX_SITE_PATH" "/etc/nginx/sites-enabled/${APP_NAME}.conf"
rm -f /etc/nginx/sites-enabled/default

echo "[4/8] Validating and reloading Nginx..."
nginx -t
systemctl enable nginx
systemctl reload nginx

echo "[5/8] Requesting Let's Encrypt certificate..."
CERTBOT_DOMAINS=("-d" "$DOMAIN")
if [[ "$INCLUDE_WWW" == "true" ]]; then
  CERTBOT_DOMAINS+=("-d" "www.${DOMAIN}")
fi

certbot --nginx \
  --non-interactive \
  --agree-tos \
  --email "$CERTBOT_EMAIL" \
  --redirect \
  "${CERTBOT_DOMAINS[@]}"

echo "[6/8] Verifying certificate auto-renew timer..."
systemctl enable certbot.timer >/dev/null 2>&1 || true
systemctl start certbot.timer >/dev/null 2>&1 || true

echo "[7/8] Final Nginx config test..."
nginx -t
systemctl reload nginx

echo "[8/8] Done. HTTPS is configured for ${DOMAIN}."
echo "Remember to allow inbound 80/443 in the EC2 security group."
