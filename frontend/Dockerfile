# IT 管理系統 SPA 映像檔(取代 Gateway 範例 IT 頁面):內含 dist,部署時以一次性容器發佈到 Nginx 的 gw_www volume
#   由 deploy/docker-compose.yml 的 spa-it 建置(需 additional_contexts webkit = Gateway web-kit 原始碼)
#   docker run --rm -v <gw_www>:/srv/www spa/it-admin:<commit> publish it-admin     # 原子切換 /srv/www/it-admin/current(Nginx /it/)
#   docker run --rm -v <gw_www>:/srv/www spa/it-admin:<commit> rollback it-admin    # 指回上一版
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Gateway web-kit 尚未發佈到 Registry:由 build context「webkit」帶入,vite.config.ts 以 WEB_KIT_DIR 指向
COPY --from=webkit . /web-kit/src
ENV WEB_KIT_DIR=/web-kit/src
ARG RELEASE_SHA=dev
RUN npm run build && mkdir -p /out && mv dist /out/it-admin && echo "$RELEASE_SHA" > /out/RELEASE

FROM alpine:3.20
RUN apk add --no-cache coreutils
COPY --from=build /out /dist
COPY publish.sh /usr/local/bin/spa
RUN chmod +x /usr/local/bin/spa
ENTRYPOINT ["spa"]
CMD ["publish", "it-admin"]
