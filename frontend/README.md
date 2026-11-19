# DelQuro Connect web frontend

Use Node.js 24 and install the locked dependencies with npm.

```sh
npm ci
npm start
```

Open [http://localhost:3000](http://localhost:3000). The Vite dev server proxies API and live Chat requests to the backend at 127.0.0.1:8000. See [.env.example](.env.example) to change the backend or explicitly allow a development proxy hostname.

- Run the test runner with `npm test`.
- Produce deployable files in `build/` with `npm run build`. The root Dockerfile serves these files alongside the API. For separate web and API containers, see the [deployment guide](../docs/DEPLOYMENT.md).
- Check the build and test dependencies with `npm audit --audit-level=high`.
