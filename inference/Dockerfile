FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN node models.mjs
ENV TF_NUM_INTRAOP_THREADS=2 TF_NUM_INTEROP_THREADS=1
USER node
HEALTHCHECK --interval=30s --start-period=300s CMD node -e "fetch('http://localhost:8090/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server.mjs"]
