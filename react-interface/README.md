# ServiceIA - Agent Builder Interface

Interface React com React Flow para criação e gerenciamento de agentes de IA, similar ao OpenAI Agents.

## Características

- 🎨 Interface moderna com tema escuro
- 🖱️ Drag and drop de componentes
- 🔗 Conexão de nós em workflow
- ⚙️ Painel de configuração de agentes
- 📦 Componentes categorizados (Core, Tools, Logic, Data)

## Instalação

```bash
cd react-interface
npm install
```

## Desenvolvimento

```bash
npm run dev
```

A aplicação estará disponível em `http://localhost:3000`

## Build

```bash
npm run build
```

## Estrutura do Projeto

```
react-interface/
├── src/
│   ├── components/
│   │   ├── Sidebar.tsx          # Barra lateral com componentes arrastáveis
│   │   ├── TopBar.tsx            # Barra superior com controles
│   │   ├── BottomBar.tsx         # Barra inferior com ferramentas
│   │   ├── FlowCanvas.tsx        # Canvas principal com React Flow
│   │   ├── CustomNode.tsx        # Componente de nó customizado
│   │   └── AgentConfigPanel.tsx  # Painel de configuração do agente
│   ├── types/
│   │   └── index.ts              # Definições de tipos TypeScript
│   ├── App.tsx                   # Componente principal
│   ├── main.tsx                  # Ponto de entrada
│   └── index.css                 # Estilos globais
├── package.json
└── tsconfig.json
```

## Componentes Disponíveis

### Core
- **Agent**: Agente de IA configurável
- **Classify**: Classificação de dados
- **End**: Nó de término
- **Note**: Nota/anotação

### Tools
- **File search**: Busca de arquivos
- **Guardrails**: Controles de segurança
- **MCP**: Model Context Protocol

### Logic
- **If / else**: Condicional
- **While**: Loop
- **User approval**: Aprovação do usuário

### Data
- **Transform**: Transformação de dados
- **Set state**: Definir estado

## Tecnologias

- React 18
- TypeScript
- React Flow 11
- Vite
- Lucide React (ícones)

