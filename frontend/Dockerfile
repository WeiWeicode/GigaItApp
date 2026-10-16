# IT 管理系統 SPA 映像檔(取代 Gateway 範例 IT 頁面):內含 dist,部署時以一次性容器發佈到 Nginx 的 gw_www volume
#   由 deploy/docker-compose.yml 的 spa-it 建置(@giganexus/web-kit 取自公司 GitLab npm Registry,需 BuildKit secret npm_token)
#   docker run --rm -v <gw_www>:/srv/www spa/it-admin:<commit> publish it-admin     # 原子切換 /srv/www/it-admin/current(Nginx /it/)
#   docker run --rm -v <gw_www>:/srv/www spa/it-admin:<commit> rollback it-admin    # 指回上一版
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=npm_token GITLAB_NPM_TOKEN="$(cat /run/secrets/npm_token)" npm ci --no-audit --no-fund
COPY . .
ARG RELEASE_SHA=dev
RUN npm run build && mkdir -p /out && mv dist /out/it-admin && echo "$RELEASE_SHA" > /out/RELEASE

FROM alpine:3.20
RUN apk add --no-cache coreutils
COPY --from=build /out /dist
COPY publish.sh /usr/local/bin/spa
RUN chmod +x /usr/local/bin/spa
ENTRYPOINT ["spa"]
CMD ["publish", "it-admin"]
