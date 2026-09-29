#!/bin/sh
set -e

: "${CONVEX_URL:=http://localhost:3210}"

echo "Injecting CONVEX_URL: $CONVEX_URL"

find /usr/share/nginx/html/assets -name "*.js" -exec \
  sed -i "s|__CONVEX_URL_PLACEHOLDER__|${CONVEX_URL}|g" {} +

if [ -f /usr/share/nginx/html/index.html ]; then
  sed -i "s|__CONVEX_URL_PLACEHOLDER__|${CONVEX_URL}|g" \
    /usr/share/nginx/html/index.html
fi

exec nginx -g 'daemon off;'
