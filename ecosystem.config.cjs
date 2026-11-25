// PM2 config — `npm run deploy:pm2` (installs, builds, starts/reloads).
// SQLite is single-writer, so run one instance (fork mode), not cluster.
module.exports = {
  apps: [
    {
      name: 'vellum',
      script: 'server/src/index.js',
      node_args: '--disable-warning=ExperimentalWarning',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '300M',
      env: { NODE_ENV: 'development', PORT: 3000 },
      env_production: { NODE_ENV: 'production', PORT: 3000, DATA_DIR: './data' },
    },
  ],
};
