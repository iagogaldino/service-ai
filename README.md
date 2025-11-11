# DelsucIA

DelsucIA is a TypeScript service that embeds the OpenAI Assistants API inside a real-time Socket.IO server. It ships with a web interface, a hierarchical multi-agent router, and utilities for tracking runs, messages, logs, and token usage. You can consume it as an npm package or run it from source to customize the agents and UI.

---

## Highlights
- Real-time chat UI served at `http://localhost:3000`
- Hierarchical agent orchestration (selector → orchestrators → specialized agents → fallback)
- Configuration stored in `config.json` with hot updates through the UI or REST API
- Socket.IO events + REST endpoints for integrating external clients
- Tooling for filesystem, terminal, and database style workflows
- Token and cost tracking with persistent history

---

## 1. Requirements
- Node.js 18+
- npm (or any compatible package manager)
- OpenAI API key (or StackSpot credentials) for production use

---

## 2. Installing the npm Package

```bash
npm install delsuc-ia
```

Create an entry point (TypeScript or JavaScript) and import the service:

```ts
// src/index.ts
const start = async () => {
  console.log('Starting DelsucIA...');
  const { serviceInitialization } = await import('delsuc-ia');
  const info = await serviceInitialization;

  console.log('Service ready at:', info.serverUrl);
  console.log('Config file:', info.configPath);
};

start().catch((err) => {
  console.error('Failed to start DelsucIA', err);
  process.exit(1);
});
```

Using TypeScript? add the script:

```json
{
  "scripts": {
    "dev": "ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

The service exposes the initialization metadata through the `serviceInitialization` promise:

```ts
type ServiceInitializationInfo = {
  port: number;
  serverUrl: string;
  configPath: string;
  agentsPath: string;
  llmProvider: 'openai' | 'stackspot';
  openaiApiKeyConfigured: boolean;
  stackspotCredentialsConfigured: boolean;
  workingDirectory: string;
  configLastUpdated?: string;
};
```

---

## 3. Running From Source

```bash
git clone https://github.com/iagogaldino/service-ai.git
cd service-ai
npm install
npm run dev
```

The development server uses `nodemon` and reloads on changes. For a production build:

```bash
npm run build
npm start
```

---

## 4. Configuration (`config.json`)

When the service starts for the first time it will create (or reuse) a `config.json` file in the working directory. The structure is:

```json
{
  "llmProvider": "openai",
  "openaiApiKey": "sk-...",
  "stackspotClientId": "",
  "stackspotClientSecret": "",
  "stackspotRealm": "stackspot-freemium",
  "stackspotProxy": {
    "https": {
      "host": "proxy.corp.local",
      "port": 8080,
      "tunnel": true
    },
    "noProxy": ["*.intranet.local"]
  },
  "port": 3000,
  "lastUpdated": "2024-01-01T12:00:00.000Z"
}
```

- `llmProvider`: `"openai"` or `"stackspot"`
- `openaiApiKey`: optional unless provider is `openai`
- `stackspot*`: optional unless provider is `stackspot`
- `stackspotProxy`: optional proxy map forwarded to `stackspotdelsuc-sdk@^1.0.10`
- `port`: HTTP port exposed by the server (default 3000)
- `lastUpdated`: automatically populated

You can configure everything through the UI: start the service, visit `http://localhost:3000`, click `⚙️ Config`, and submit the form. The API is also available at `POST /api/config`.

- **Proxy support (StackSpot)**: starting with `1.1.0` you can optionally route StackSpot traffic through a corporate proxy. Supply the structure above via UI or `POST /api/config` and the adapter will pass it directly to `stackspotdelsuc-sdk`, supporting HTTPS tunneling, authentication, `NO_PROXY`, and custom strategies.

---

## 5. Web Experience
- **Chat**: conversational interface backed by Socket.IO
- **Logs**: inspect `logs.json` live (connections, runs, tool calls, errors)
- **Tokens**: review token/cost consumption aggregated per thread
- **Monitor**: shadow active sessions (observer sockets)
- **Config**: form convenience for editing `config.json`

The static client lives in `client/index.html`; you can extend it or embed the WebSocket layer inside your own UI.

---

## 6. Multi-Agent Architecture

```
Main Selector
  ├── Group A - FileSystem & Terminal
  │    ├── Code Analyzer
  │    └── Terminal Executor
  └── Group B - Database
       ├── Database Reader
       └── Database Writer
Fallback Agent
```

- **Main Selector**: routes every incoming message
- **Group Orchestrators**: domain-specific coordinators
- **Agents**: specialized executors containing tool access and prompts
- **Fallback**: default assistant for unmatched requests

All agents live in `src/agents/agents.json`. Copy that file, customize prompts, priorities, `shouldUse` rules, or add new groups. On build, the file is copied to `dist/agents/agents.json` and distributed with the npm package.

`shouldUse` rule types:
- `keywords`: array of keywords to match against the incoming message
- `regex`: regular expression (string) that must match
- `complex`: boolean expressions combining nested rules
- `default`: fallback rule with optional exclusions

When you change `agents.json` in production, rebuild the package or copy the file to the same relative location as `dist/agents/agents.json`.

---

## 7. Socket.IO Events

| Event                | Direction | Description                                                     |
|----------------------|-----------|-----------------------------------------------------------------|
| `agent_message`      | server → client | Emits chat transcripts (type `user` or `assistant`)     |
| `agent_selected`     | server → client | Discloses the agent chosen for the last prompt          |
| `thread_created`     | server → client | New thread id (persist it client-side)                  |
| `load_conversation`  | server → client | Sends historical messages for restored threads         |
| `token_usage`        | server → client | Token usage per run plus accumulated totals            |
| `config_required`    | server → client | Triggered when credentials are missing                 |
| `message`            | client → server | User message payload `{ message: string }`             |
| `restore_thread`     | client → server | Provide previous thread id `{ threadId }`              |
| `clear_conversation` | client → server | Ask for a fresh thread                                  |

Integrating with Node:

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', { transports: ['websocket'] });

socket.on('connect', () => {
  console.log('connected', socket.id);
  socket.emit('message', { message: 'Olá, DelsucIA!' });
});

socket.on('agent_message', (event) => console.log(event));
```

---

## 8. Persistence

| File               | Purpose                                                  |
|--------------------|----------------------------------------------------------|
| `config.json`      | Credentials, provider and port                           |
| `logs.json`        | Timeline with connections, runs, tools, and errors       |
| `tokens.json`      | Token and cost history per thread                        |
| `conversations.json` | Persisted chat history for thread recovery            |

These files are created in the working directory where you launch the service. Back them up if you want continuity across restarts.

---

## 9. REST Endpoints (excerpt)

| Method | Path             | Description                         |
|--------|------------------|-------------------------------------|
| `GET`  | `/api/config`    | Returns the current configuration   |
| `POST` | `/api/config`    | Updates `config.json`               |
| `GET`  | `/monitor`       | Monitoring dashboard                |
| `GET`  | `/`              | Web client                          |

Refer to `src/routes/apiRoutes.ts` for the full set of endpoints, including log retrieval, token summaries, and conversation exports.

---

## 10. Scripts

| Script     | Purpose                                              |
|------------|------------------------------------------------------|
| `npm run dev`   | Start development server with auto-reload          |
| `npm run build` | Compile TypeScript and copy assets                 |
| `npm start`     | Run compiled server (`dist/server.js`)             |
| `npm run watch` | TypeScript compiler in watch mode                  |

On publish (`npm publish`), the `prepublishOnly` script runs `npm run build` to ensure `dist` is up to date.

---

## 11. Troubleshooting

| Symptom                                  | Fix                                                                                   |
|------------------------------------------|----------------------------------------------------------------------------------------|
| `PORT already in use`                    | Stop the other process (`Stop-Process`, `lsof`, etc.) or set `PORT=3001` before start |
| Missing API key warning                  | Configure via UI or edit `config.json` manually                                       |
| No agents after install                  | Ensure `dist/agents/agents.json` exists; rebuild if you customized the file           |
| Stale threads after config changes       | Use the UI “Clear conversation” button or emit `clear_conversation` via Socket.IO     |

---

## 12. Contributing

1. Fork and clone the repository.
2. Create a branch for your feature or fix.
3. Run `npm run dev` and validate changes locally.
4. Submit a pull request describing the update.

Bug reports and feature requests are welcome through the issue tracker.

---

## 13. License

This project is licensed under the ISC License. See the `LICENSE` file for details.

---

Need help or found a bug? Open an issue or reach out through the repository discussions. Happy building! 🚀



