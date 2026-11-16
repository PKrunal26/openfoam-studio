# OpenFOAM Studio Classroom: web server image.
# Build from the repository root:  docker build -f classroom/Dockerfile -t ofs-classroom .
#
# The server does not contain OpenFOAM. It starts solver containers through
# the host's Docker socket, so it needs /var/run/docker.sock mounted and its
# data directory mounted at the SAME path inside and outside the container
# (see classroom/docker-compose.yml).

FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
# --ignore-scripts skips Electron's binary download; the classroom does not use it.
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run classroom:build

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
# The bundled server keeps node_modules external; dockerode is the only runtime dependency.
RUN printf '{"name":"ofs-classroom","private":true,"type":"module","dependencies":{"dockerode":"^4.0.10"}}\n' > package.json \
 && npm install --omit=dev --no-audit --no-fund \
 && npm cache clean --force
COPY --from=build /src/classroom/dist ./classroom/dist
COPY --from=build /src/classroom/web/dist ./classroom/web/dist
COPY classroom/tutorials ./classroom/tutorials
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.OFS_CLASSROOM_PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "classroom/dist/server.js"]
