# Frontend Runtime Modes

## Private-network development

Do not configure an HMR host. Vite derives the WebSocket address from the URL used by each browser, so both localhost and private-network clients use the same development server.

For a stable phone or demo session where source hot reload is unnecessary, disable the Vite HMR client. This prevents a transient development WebSocket reconnect from reloading the page:

```bash
VITE_HMR_DISABLED=true npm run dev -- --port 25174 --strictPort
```

```bash
VITE_GATEWAY_TARGET=http://127.0.0.1:28001 npm run dev -- --host 0.0.0.0 --port 25174 --strictPort
```

Start the Agent before the gateway and frontend:

```bash
cd services/detection_agent_service
npm install
npm run build
npm start

cd ../../gateway
GATEWAY_PORT=28001 python app.py

cd ../frontend
VITE_GATEWAY_TARGET=http://127.0.0.1:28001 npm run dev -- --host 0.0.0.0 --port 25174 --strictPort
```

The image workspace is available at `/M3/detection-agent/image/`. Model credentials are optional for the upload/status/report framework and required only for the Pi-backed result Q&A tab.

## Public production deployment

Build the static application and serve `dist/` under `/M3/` with the public reverse proxy. Proxy `/api/` to the Flask gateway. Production static assets do not use Vite HMR.

```bash
npm run build
```

For temporary public development only, copy `.env.public.example` to `.env.public`, set the public hostname and WebSocket port, and start Vite with `--mode public`. The reverse proxy must forward WebSocket upgrades for `/M3/`.

```bash
npm run dev -- --mode public
```
