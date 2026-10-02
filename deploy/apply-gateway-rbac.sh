#!/bin/sh
# 將 deploy/gateway-rbac.yaml(權限、角色)或 gateway-routes.yaml(上游、路由)套用到測試區 / 正式區 Gateway
# (以 Gateway compose 的 migrate 服務映像執行 CLI apply;與 giga-Portal/deploy/apply-gateway-rbac.sh 相同作法)。
# 需要:Gateway 已依其 docs/TEST-DEPLOY-RUNBOOK.md 部署;兄弟目錄 ../giga-api-gateway-bff(或以 GATEWAY_DIR 指定)。
# 用法:
#   sh deploy/apply-gateway-rbac.sh test <Gateway 區域 env 檔>                       # 權限與角色(CI rbac-test 自動執行)
#   sh deploy/apply-gateway-rbac.sh test <Gateway 區域 env 檔> gateway-routes.yaml   # 上游與路由(套用後為草稿,需發佈)
set -eu
ZONE="${1:?用法:sh deploy/apply-gateway-rbac.sh <test|prod> <Gateway 區域 env 檔> [gateway-rbac.yaml|gateway-routes.yaml]}"
ENV_FILE="${2:?用法:sh deploy/apply-gateway-rbac.sh <test|prod> <Gateway 區域 env 檔> [gateway-rbac.yaml|gateway-routes.yaml]}"
FILE="${3:-gateway-rbac.yaml}"
case "$ZONE" in test | prod) ;; *) echo "區域只能是 test 或 prod" >&2; exit 1 ;; esac
case "$FILE" in gateway-rbac.yaml | gateway-routes.yaml) ;; *) echo "只能套用 gateway-rbac.yaml 或 gateway-routes.yaml" >&2; exit 1 ;; esac
[ -f "$ENV_FILE" ] || { echo "找不到 $ENV_FILE" >&2; exit 1; }
# Git Bash:以 Windows 路徑(D:/...)交給 Docker Desktop,並關閉 MSYS 的路徑轉換
export MSYS_NO_PATHCONV=1
HERE="$(cd "$(dirname "$0")" && (pwd -W 2>/dev/null || pwd))"
ENV_ABS="$(cd "$(dirname "$ENV_FILE")" && (pwd -W 2>/dev/null || pwd))/$(basename "$ENV_FILE")"
GW="${GATEWAY_DIR:-$HERE/../../giga-api-gateway-bff}/deploy"
cd "$GW"
docker compose --env-file "$ENV_ABS" -f docker-compose.yml -f "docker-compose.$ZONE.yml" --profile tools run --rm --no-deps \
  -v "$HERE/$FILE:/itapp/$FILE:ro" \
  migrate node dist/bff/src/cli/index.js apply --file "/itapp/$FILE" --actor GigaItApp
