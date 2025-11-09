# DelsucIA

Node.js + TypeScript project that combines Socket.IO with the OpenAI **Assistants API** to enable real-time conversations with intelligent agents.

## 🚀 Tech Stack

- **Node.js** – JavaScript runtime
- **TypeScript** – Static typing on top of JavaScript
- **Socket.IO** – Real-time WebSocket communication
- **OpenAI Assistants API** – Persistent-thread agent SDK
- **Express** – Web framework for Node.js

## 📋 Prerequisites

- Node.js (version 16 or later)
- npm or yarn

## 🛠️ Installation

1. Clone this repository or navigate to the project folder.
2. Install dependencies:
   `ash
   npm install
   `
3. Configure your API key:
   - Start the server: 
pm run dev
   - Open http://localhost:3000
   - Click the "⚙️ Config" button and provide your OpenAI API key
   - The key is stored automatically in config.json

## 🎯 Usage

### Development Mode
`ash
npm run dev
`

### Production Mode
`ash
npm run build
npm start
`

The server listens on http://localhost:3000.

## 📡 How It Works

1. The client connects to the server via Socket.IO.
2. A dedicated **thread** is created for every connection (conversation context is preserved).
3. The client sends messages through the socket (e.g., "Hello").
4. The server adds the message to that thread and creates a **run** to process it.
5. The **assistant** (agent) handles the message through the Assistants API.
6. The agent response is sent back to the client through the same socket channel.
7. The thread keeps the full conversation history for that connection.

### ✨ Assistants API Highlights

- **Persistent Threads**: every connection owns a context thread.
- **Smart Agents**: powered by GPT-4 Turbo for higher-quality answers.
- **Context Preservation**: the assistant remembers prior conversation context.
- **Automatic Provisioning**: the assistant is created during the first execution.
- **File Navigation Tools**: the agent can inspect files within the project.

### 🗂️ File Navigation Tools

Agents have three primary tools for file operations:

1. **list_directory** – Lists files and folders in a specific path.
   - Example: "List the files inside src"
2. **
ead_file** – Reads the full contents of a file.
   - Example: "Read src/server.ts"
3. **ind_file** – Searches for files by name.
   - Example: "Find files named main.ts"

**Sample prompts:**
- "Explain what main.ts does"
- "What is the project structure?"
- "Analyze server.ts and tell me what it does"

## 🤖 Agent System

DelsucIA uses a hierarchical agent system organized into groups, each managed by an orchestrator.

### 📊 Hierarchy Overview

`
Main Selector
  ├── Group A Orchestrator (FileSystem & Terminal)
  │   ├── Code Analyzer
  │   └── Terminal Executor
  └── Group B Orchestrator (Database)
      ├── Database Reader
      └── Database Writer
`

### 🎯 Core Components

#### 1. Main Selector
- **Role**: routes incoming messages to the appropriate group
- **Priority**: -1 (highest)
- **When it triggers**: smart router that analyzes the request before delegating

#### 2. Groups
Each group stores:
- **id** – unique identifier
- **name** – descriptive label
- **description** – group purpose
- **orchestrator** – orchestrator configuration
- **agents** – specialized agents inside the group

#### 3. Orchestrator
- **Role**: coordinates agents inside the group
- **Responsibilities**:
  - Understands the task within the group context
  - Selects which agent(s) should run
  - Coordinates multi-step, multi-agent tasks

#### 4. Specialized Agents
- **Role**: execute focused tasks
- **Belong to**: a specific group
- **Managed by**: that group orchestrator

#### 5. Fallback Agent
- **Role**: default agent when no other agent matches
- **Priority**: 999 (lowest)

### 📝 JSON Configuration

Agents are defined in src/agents/agents.json. The system supports hierarchical (recommended) and legacy structures.

#### Hierarchical Example

`json
{
  "mainSelector": {
    "name": "Main Message Router",
    "description": "Routes messages to the appropriate groups",
    "model": "gpt-4-turbo-preview",
    "priority": -1,
    "tools": [],
    "instructions": "...",
    "shouldUse": { "type": "default" }
  },
  "groups": [
    {
      "id": "filesystem-terminal",
      "name": "Group A - FileSystem & Terminal",
      "description": "Specialized in file system and terminal actions",
      "orchestrator": {
        "name": "FileSystem Group Orchestrator",
        "description": "Coordinates the group agents",
        "model": "gpt-4-turbo-preview",
        "priority": 0,
        "tools": ["fileSystem", "terminal"],
        "instructions": "...",
        "shouldUse": { "type": "keywords", "keywords": ["..."] }
      },
      "agents": [
        {
          "name": "Code Analyzer",
          "description": "...",
          "model": "gpt-4-turbo-preview",
          "priority": 1,
          "tools": ["fileSystem"],
          "instructions": "...",
          "shouldUse": { "type": "keywords", "keywords": ["..."] }
        }
      ]
    }
  ],
  "fallbackAgent": {
    "name": "General Assistant",
    "description": "...",
    "model": "gpt-4-turbo-preview",
    "priority": 999,
    "tools": [],
    "instructions": "...",
    "shouldUse": { "type": "default" }
  },
  "toolSets": {
    "fileSystem": ["..."],
    "terminal": ["..."]
  }
}
`

### 🔄 Selection Rules (shouldUse)

Multiple rule types determine when an agent should run:

#### 1. Keywords
`json
{
  "type": "keywords",
  "keywords": ["create", "code", "generate"]
}
`
Matches when the incoming prompt includes one of the keywords.

#### 2. Regex
`json
{
  "type": "regex",
  "pattern": "(npm|node|yarn)\\s+[^\\s]"
}
`
Executes when the prompt matches the regular expression.

#### 3. Complex Rules
`json
{
  "type": "complex",
  "operator": "OR",
  "rules": [
    { "type": "keywords", "keywords": ["execute", "run"] },
    { "type": "regex", "pattern": "npm\\s+\\w+" }
  ]
}
`
Combines multiple rules with logical AND/OR operations.

#### 4. Default
`json
{
  "type": "default",
  "exclude": {
    "type": "regex",
    "pattern": "(npm|node)\\s+"
  }
}
`
Acts as a fallback rule and can exclude specific patterns.

### 🚀 Adding a New Agent

#### Step 1: Edit gents.json
Add a new entry inside the group gents array or create a brand-new group:

`json
{
  "name": "Translation Agent",
  "description": "Specialized in text translation",
  "model": "gpt-4-turbo-preview",
  "priority": 5,
  "tools": [],
  "instructions": "You are a professional translator...",
  "shouldUse": {
    "type": "keywords",
    "keywords": ["translate", "translation", "traduz"]
  }
}
`

#### Step 2: Restart the Server
The server reloads the JSON file on startup and picks up the new configuration automatically.

### 🔧 Tool Sets

	oolSets allow you to reference pre-defined tool collections:

`json
{
  "toolSets": {
    "fileSystem": [
      "list_directory",
      "read_file",
      "find_file",
      "write_file"
    ],
    "terminal": [
      "execute_command",
      "check_service_status"
    ]
  }
}
`

Inside the agent 	ools property you can use:
- A tool set name: "tools": ["fileSystem"]
- Individual tools: "tools": ["execute_command"]
- A mix of both: "tools": ["fileSystem", "execute_command"]

### 📊 Priorities

Priority defines evaluation order:
- **Priority -1**: main selector (evaluated first)
- **Priority 0**: group orchestrators
- **Priority 1+**: specialized agents
- **Priority 999**: fallback agent (last resort)

## 💰 Token Tracking

Token usage is tracked automatically during every run and returned to the frontend alongside agent responses.

### 📊 Data Structure

`	ypescript
interface TokenUsage {
  promptTokens: number;      // Tokens for the prompt/input
  completionTokens: number;  // Tokens for the response/output
  totalTokens: number;       // Sum of prompt + completion
}
`

### 🎯 Server Events

The system emits three token-related events:

#### 1. 	oken_usage
Emitted in real time whenever tokens are consumed.

`javascript
socket.on("token_usage", (data) => {
  // data.tokens – tokens used in this specific run
  // data.accumulated – total tokens in the thread
  console.log("Tokens (current run):", data.tokens.totalTokens);
  console.log("Tokens (accumulated):", data.accumulated.totalTokens);
});
`

#### 2. gent_message
Each agent message can include accumulated token usage.

`javascript
socket.on("agent_message", (data) => {
  if (data.tokenUsage) {
    console.log("Message:", data.message);
    console.log("Accumulated tokens:", data.tokenUsage.totalTokens);
  }
});
`

#### 3. 
esponse
Includes current-run tokens and the thread total.

`javascript
socket.on("response", (data) => {
  console.log("Tokens (current run):", data.tokenUsage.totalTokens);
  console.log("Tokens (thread total):", data.accumulatedTokenUsage.totalTokens);
});
`

### 💵 Cost Calculation

Costs are calculated automatically using the OpenAI price list:

- **GPT-4 Turbo**: .01 / 1K prompt tokens + .03 / 1K completion tokens
- **GPT-4**: .03 / 1K prompt tokens + .06 / 1K completion tokens
- **GPT-3.5 Turbo**: .0015 / 1K prompt tokens + .002 / 1K completion tokens

Totals are stored in 	okens.json and displayed on the frontend via the "💰 Tokens" button.

### 📈 Persistence

	okens.json stores:
- Total tokens and costs per thread
- Interaction history
- Agent-level statistics
- Accumulated total cost

## 📝 Logging System

All application activity is recorded to logs.json for traceability and monitoring.

### 📊 Log Types

- **connection** – new socket connections
- **disconnection** – socket disconnections
- **agent_selection** – which agent was chosen
- **message_sent** – outgoing messages
- **run_status** – Assistants API run status updates
- **tool_execution** – tool execution details
- **tool_result** – tool results
- **response** – final responses
- **token_usage** – token consumption
- **error** – errors and exceptions

### 📈 Metrics

Automatically tracked statistics include:
- Total connections
- Total processed messages
- Total tokens consumed
- Accumulated costs
- Logged errors

### 🔍 Visualization

The frontend "📝 Logs" view shows:
- Overview metrics
- Detailed event history
- Log-type filters
- Token and cost information

## 🌐 Web Client

Open http://localhost:3000 to explore the built-in web UI:

- **Chat** – interact with the assistants via Socket.IO
- **Agents** – browse the configured agents and their tools
- **Tokens** – inspect real-time and historical token usage
- **Logs** – view live system logs
- **Config** – configure API key and server port

### Frontend Features

- Connect to the server via Socket.IO
- Send messages to the assistant
- Receive responses in real time
- Track connection status
- Monitor token usage in real time
- Review historical tokens and costs
- Inspect logs with filters
- Configure API key and port directly in the UI

## 📝 Usage Examples

### Included HTML Client
The repository ships with an HTML client that connects automatically.

### Programmatic Example (JavaScript)
`javascript
const io = require("socket.io-client");
const socket = io("http://localhost:3000");

socket.on("connect", () => {
  console.log("Connected!");
  socket.emit("message", { message: "Hello" });
});

socket.on("response", (data) => {
  console.log("Response:", data.message);
  console.log("Tokens:", data.tokenUsage.totalTokens);
  console.log("Cost:", data.cost);
});
`

### Programmatic Example (Python)
`python
import socketio

sio = socketio.Client()

@sio.event
def connect():
    print("connected")
    sio.emit("message", {"message": "Hello from Python!"})

@sio.on("response")
def handle_response(data):
    print("response:", data["message"])

sio.connect("http://localhost:3000", transports=["websocket"])
sio.wait()
`

## 🔌 Integrating from Other Services

You can consume DelsucIA headlessly as an **agent provider**. Recommended steps for server-to-server integrations:

### 1. Enable and Configure the Service
- Run 
pm run dev (or 
pm start in production).
- Configure the active provider via POST /api/config (OpenAI or StackSpot) or through the web UI.
- Ensure the consumer service can reach the host/port where DelsucIA is running.

### 2. Connect Using Socket.IO
Use WebSockets to exchange messages with the agents. Example backend connection in TypeScript:

`	ypescript
import { io, Socket } from "socket.io-client";

const socket: Socket = io("http://delsucia.internal:3000", {
  transports: ["websocket"],
  reconnectionAttempts: 3,
});

socket.on("connect", () => {
  console.log("[delsucia] connected", socket.id);

  const savedThreadId = loadThreadIdForUser("user-123");
  if (savedThreadId) {
    socket.emit("restore_thread", { threadId: savedThreadId });
  }

  socket.emit("message", { message: "We need to generate the monthly report." });
});

socket.on("thread_created", ({ threadId }) => {
  console.log("[delsucia] new thread", threadId);
  persistThreadIdForUser("user-123", threadId);
});

socket.on("agent_selected", (data) => {
  console.log("[delsucia] agent selected", data.agentName, data.llmProvider);
});

socket.on("agent_message", (data) => {
  console.log("[delsucia] agent_message", data.type, data.message);
});

socket.on("agent_action", (data) => {
  console.log("[delsucia] action in progress", data.action);
});

socket.on("agent_action_complete", (data) => {
  console.log("[delsucia] action complete", data.action, data.success);
});

socket.on("response", (data) => {
  console.log("[delsucia] final response", data.message);
  console.log("[delsucia] tokens (run)", data.tokenUsage.totalTokens);
  console.log("[delsucia] tokens (thread)", data.accumulatedTokenUsage.totalTokens);
});

socket.on("error", (err) => {
  console.error("[delsucia] error", err);
});
`

> **Tip:** Persist the 	hreadId returned via 	hread_created or 	hread_restored. Sending 
estore_thread on reconnect keeps the conversation context.

### 3. Learn the Emitted Events
- 	hread_created – new persistent thread created for the connection
- 	hread_restored – confirmation that an existing thread was restored
- gent_selected – selected agent and provider for the message
- gent_message – traffic between agents (user messages, responses, tool calls, results)
- gent_action – action currently in progress (tool execution)
- gent_action_complete – completion status of the previous action
- 
esponse – final response for the current run (includes per-run and accumulated tokens)
- 	oken_usage – incremental token events (if enabled)
- error / config_required / pi_key_invalid – error and configuration handlers

### 4. REST Helper APIs

| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/agents | Lists all agents, groups, and available tools |
| GET | /api/agents/config | Returns the hierarchical gents.json content |
| POST | /api/agents/groups/:groupId/agents | Creates a new agent in the specified group |
| PUT | /api/agents/groups/:groupId/agents/:agentName | Updates an existing agent within the group |
| DELETE | /api/agents/groups/:groupId/agents/:agentName | Removes an agent from the group |
| GET | /api/connections | Shows active Socket.IO connections |
| GET | /api/connections/:socketId | Provides details about a specific connection |
| GET | /api/tokens?llmProvider=openai | Aggregated token and cost history (filterable by provider) |
| GET | /api/logs | Returns the latest logs |
| POST | /api/config | Configures the provider and credentials (OpenAI or StackSpot) |
| GET | /api/config | Retrieves the current configuration state |

All endpoints return JSON. If exposing the service outside an internal network, protect these routes with authentication (e.g., API Gateway).

### Example Payloads

**Create an agent**
`http
POST /api/agents/groups/filesystem-terminal/agents HTTP/1.1
Content-Type: application/json

{
  "name": "Docs Generator",
  "description": "Generates documentation from code comments.",
  "model": "gpt-4-turbo-preview",
  "priority": 10,
  "tools": ["fileSystem"],
  "instructions": "Create documentation based on the provided files.",
  "shouldUse": {
    "type": "keywords",
    "keywords": ["documentation", "docs", "readme"]
  }
}
`

**Update an agent**
`http
PUT /api/agents/groups/filesystem-terminal/agents/Docs%20Generator HTTP/1.1
Content-Type: application/json

{
  "priority": 5,
  "instructions": "Update documentation by analyzing modified files.",
  "tools": ["fileSystem", "terminal"]
}
`

**Delete an agent**
`http
DELETE /api/agents/groups/filesystem-terminal/agents/Docs%20Generator HTTP/1.1
`

Response:
`json
{
  "success": true
}
`

### 🔐 Best Practices

- Always handle socket.on("error") to detect missing or invalid credentials.
- Map 	hreadId to your domain entities (user, session, ticket, etc.).
- Reuse the same Socket.IO connection for sequential requests from the same actor to preserve context.
- Emit clear_conversation when you need to reset the assistant context and wait for the new 	hread_created event.
- Periodically audit /api/logs and /api/tokens for monitoring and billing.
- Mobile/desktop apps can embed the same flow using Socket.IO client libraries.

Following these steps allows any external application to orchestrate agents, observe tool calls in real time, and adopt DelsucIA as a complete conversational AI service.

## 📁 Project Structure

`
DelsucIA/
├── src/
│   ├── agents/
│   │   ├── agents.json       # Agent configuration
│   │   ├── agentLoader.ts    # Agent loader
│   │   ├── agentManager.ts   # OpenAI agent manager
│   │   └── config.ts         # Configuration and agent selection
│   ├── config/
│   │   └── env.ts            # Environment configuration management
│   ├── tools/
│   │   ├── fileSystemTools.ts  # File system tools
│   │   └── terminalTools.ts    # Terminal tools
│   ├── utils/
│   │   ├── functionDescriptions.ts
│   │   └── serverHelpers.ts
│   ├── server.ts             # Socket.IO server + OpenAI integration
│   └── main.ts               # Sample TypeScript script
├── client/
│   └── index.html            # Web client
├── dist/                     # Compiled TypeScript output
├── package.json
├── tsconfig.json
├── config.json               # App configuration (created via frontend)
├── tokens.json               # Token history (generated automatically)
├── logs.json                 # Application logs (generated automatically)
└── README.md
`

## ⚙️ Configuration

### Via Frontend
config.json stores runtime configuration and is managed through the web UI:
- openaiApiKey: your OpenAI API key (required for the Assistants API)
- port: server port (default: 3000)

### Default Assistant
The assistant is created automatically on first run with:
- **Name**: DelsucIA Assistant
- **Model**: GPT-4 Turbo Preview
- **Instructions**: AI assistant specialized in browsing code projects
- **Tools**: file tooling to list, read, and search files

Customize agents by editing src/agents/agents.json.

### File Safety
- ✅ Access restricted to the project root directory
- ✅ Protection against path traversal outside the project
- ✅ Maximum file size of 1 MB
- ✅ Automatically ignores 
ode_modules, .git, and dist

## ⚡ Performance

The dynamic agent system is optimized to maintain the same performance as the hardcoded version.

### Implemented Optimizations

1. **Configuration Cache** – Keeps agent configuration in memory after first load
2. **Pre-sorted Agents** – Agents are pre-ordered by priority
3. **Agent Shortcuts** – Direct references for frequently used agents
4. **Compiled Regex** – Regex rules are compiled during creation
5. **Synchronous Selector** – selectAgentSync() avoids Promise overhead
6. **Startup Initialization** – Agents load during server startup

### Benchmarks

| Operation            | Previous System | Optimized System |
|---------------------|-----------------|------------------|
| Agent selection      | ~0.1–0.5ms      | **~0.1–0.5ms**   |
| Initial loading      | 0ms (hardcoded) | ~5–10ms (start only) |
| Subsequent calls     | ~0.1–0.5ms      | **~0.1–0.5ms**   |

**Conclusion**: The new implementation preserves the same runtime performance with only a small startup overhead.

## 🔒 Security

⚠️ **Important**: Never commit the following files (ignored via .gitignore):
- config.json – contains API keys
- 	okens.json – token usage history
- logs.json – application logs

## 🐛 Troubleshooting

### Error: "No agents configured"
**Cause**: Missing or invalid JSON configuration
**Solution**: Ensure gents.json exists and has valid syntax

### Error: "Tool not found"
**Cause**: Tool reference is missing from registered tool sets
**Solution**: Confirm the tool exists in 	oolSets or register it

### Agent not being selected
**Cause**: shouldUse rules too restrictive or priority conflicts
**Solution**:
1. Review keyword/regex rules
2. Adjust priority levels
3. Test the rule manually

### Error: "API key not configured"
**Cause**: API key not set via frontend or environment
**Solution**: Configure the API key using the "⚙️ Config" UI or environment variable

### Error: "AuthenticationError: Incorrect API key"
**Cause**: Invalid or expired API key
**Solution**: Update the API key with a valid credential

## 🔄 CI/CD Automation

The workflow defined at `.github/workflows/npm-publish.yml` automates npm publishing.

- **Trigger**: fires automatically whenever a GitHub release is created, or manually via *Run workflow*.
- **Environment**: uses Node.js 20 via `actions/setup-node@v4`.
- **Steps**: checkout, `npm ci`, `npm run build`, tag/version validation, then `npm publish`.
- **Secret required**: configure `NPM_TOKEN` in repository secrets with publish access to `delsuc-ia`.
- **Tag format**: release tags must match `v<semver>` (e.g., `v1.2.3`) and align with `package.json`'s `version`.

To trigger manually, open the workflow in GitHub Actions and optionally provide `release_tag`; if omitted, the release tag associated with the run is used.

## 📚 References

- [OpenAI Assistants API](https://platform.openai.com/docs/assistants)
- [Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Socket.IO Documentation](https://socket.io/docs/)

## 📄 License

ISC

