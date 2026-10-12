import { defineConfig, loadEnv } from 'vite';

function apiDev() {
  return {
    name: 'api-dev',
    configureServer(server) {
      // muat .env.local ke process.env
      Object.assign(process.env, loadEnv('development', process.cwd(), ''));

      server.middlewares.use('/api/chat', async (req, res) => {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        req.body = raw ? JSON.parse(raw) : {};

        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (data) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
        };

        const { default: handler } = await server.ssrLoadModule('/api/chat.js');
        await handler(req, res);
      });
    }
  };
}

export default defineConfig({
  plugins: [apiDev()]
});