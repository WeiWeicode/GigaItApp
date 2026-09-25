#!/bin/sh
# 經 Gateway Nginx 的端到端檢查(docs/Gherkin/gateway/nginx-entry.feature、bff/*.feature 的 @e2e 場景)
# 需先部署 itapp-api 與前端(README「部署到本機 Gateway」)。預設 https://localhost,開發用自簽憑證以 -k 略過驗證。
#   sh deploy/e2e-smoke.sh                 # 一般檢查
#   STOP_API=1 sh deploy/e2e-smoke.sh      # 另外檢查 itapp-api 停止時回 502(會暫停容器數秒)
set -u
GW="${GW_URL:-https://localhost}"
USER_ID="${ITAPP_E2E_USER:-S100031}"
PASSWORD="${ITAPP_E2E_PASSWORD:-Passw0rd!}"
TMP="$(mktemp -d)"
JAR="$TMP/jar"
FAIL=0
ok() { printf '  ✔ %s\n' "$1"; }
ng() { printf '  ✖ %s(%s)\n' "$1" "$2"; FAIL=1; }
check() { [ "$2" = "$3" ] && ok "$1" || ng "$1" "預期 $3,實際 $2"; }
code() { curl -sk -o /dev/null -w '%{http_code}' "$@"; }

echo "Gateway:$GW"
check "SPA 子路徑 History 模式 /it/gateway/rbac/graph" "$(code "$GW/it/gateway/rbac/graph")" 200
check "/it/api/healthz 轉給 itapp-api" "$(code "$GW/it/api/healthz")" 200
curl -sk "$GW/it/api/healthz" | grep -q '"bffMode":"live"' && ok "itapp-api 為 BFF live 模式" || ng "itapp-api 為 BFF live 模式" "bffMode 不是 live"

H="$(curl -sk -D - -o /dev/null "$GW/it/api/auth/me")"
echo "$H" | grep -qi '^content-security-policy:' && ok "安全標頭 CSP" || ng "安全標頭 CSP" "缺少"
check "X-Request-Id 只有一個" "$(echo "$H" | grep -ci '^x-request-id:')" 1

BODY=$(printf '{"username":"%s","password":"%s"}' "$USER_ID" "$PASSWORD")
LOGIN=$(code -c "$JAR" -H 'Content-Type: application/json' -d "$BODY" "$GW/it/api/auth/login")
check "登入(經 Nginx)" "$LOGIN" 200
check "登入後 /it/api/auth/me" "$(code -b "$JAR" "$GW/it/api/auth/me")" 200
check "IT Session 不影響 BFF /api/auth/me" "$(code -b "$JAR" "$GW/api/auth/me")" 401
check "讀取 BFF 路由(live)" "$(code -b "$JAR" "$GW/it/api/bff/routes")" 200
CSRF="$(awk '$6=="it_csrf"{print $7}' "$JAR")"
R="$(curl -sk -b "$JAR" -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' -d '{"note":"e2e"}' "$GW/it/api/bff/releases")"
echo "$R" | grep -q 'ITAPP_BFF_NOT_SUPPORTED' && ok "live 發佈回 ITAPP_BFF_NOT_SUPPORTED" || ng "live 發佈回 ITAPP_BFF_NOT_SUPPORTED" "$R"

# 登入限流:同時送出大量登入請求,超過 gw_auth burst 後應有 429(dev 的 GW_AUTH_RATE 為 3000r/m,仍會被 burst 4 擋下)
for i in $(seq 1 30); do code -H 'Content-Type: application/json' -d '{"username":"nobody","password":"x"}' "$GW/it/api/auth/login" > "$TMP/rl.$i" & done
wait
grep -l 429 "$TMP"/rl.* >/dev/null 2>&1 && ok "登入限流回 429" || ng "登入限流回 429" "30 個並行請求都沒有 429"

if [ "${STOP_API:-0}" = 1 ]; then
  docker stop giganexus-itapp-itapp-api-1 >/dev/null
  R="$(curl -sk "$GW/it/api/healthz")"
  echo "$R" | grep -q 'UPSTREAM_ERROR' && ok "itapp-api 停止時回 502 UPSTREAM_ERROR" || ng "itapp-api 停止時回 502" "$R"
  docker start giganexus-itapp-itapp-api-1 >/dev/null
fi

rm -rf "$TMP"
[ "$FAIL" = 0 ] && echo "全部通過" || { echo "有失敗項目"; exit 1; }
