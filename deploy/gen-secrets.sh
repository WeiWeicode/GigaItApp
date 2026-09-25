#!/bin/sh
# 產生本機部署用機密(secrets/,不入版控)。已存在的檔案不覆寫。
#   ITAPP_SEED_PASSWORD:第一次啟動建立種子帳號的密碼(預設 Passw0rd!,僅限本機測試)
#   BFF_SERVICE_PASSWORD:BFF 服務帳號密碼(本機 Gateway 的虛構帳號 S100001 為 Passw0rd!)
set -eu
cd "$(dirname "$0")/.."
mkdir -p secrets
[ -f secrets/itapp_jwt_secret ] || head -c 48 /dev/urandom | base64 | tr -d '\n=/+' > secrets/itapp_jwt_secret
[ -f secrets/itapp_seed_password ] || printf '%s' "${ITAPP_SEED_PASSWORD:-Passw0rd!}" > secrets/itapp_seed_password
[ -f secrets/bff_service_password ] || printf '%s' "${BFF_SERVICE_PASSWORD:-Passw0rd!}" > secrets/bff_service_password
chmod 600 secrets/*
ls -l secrets
