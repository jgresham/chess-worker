# BasedChess worker
Cloudflare worker

# Deploy
## staging
```shell
npm run deploy -- -e staging
npm run deploy -- -e production
```

# Debuggining
## Wrangler CLI commands
```shell
# list user's gameIds
npx wrangler kv key get -e production --namespace-id=ebe20f1ab11c48bea8c63c20c017dc09 --text 0x101a25d0FDC4E9ACa9fA65584A28781046f1BeEe --remote
```