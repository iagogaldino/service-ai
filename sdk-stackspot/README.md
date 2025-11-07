# StackSpot SDK (beta)

**Contato**: [LinkedIn](https://www.linkedin.com/in/iago-delsuc-1b53241b0) • [Instagram](https://www.instagram.com/iagogalldino)

SDK em TypeScript inspirado na API da OpenAI para integrar com a StackSpot GenAI API. Inclui helpers para criar threads, mensagens, executar agentes e orquestrar exemplos multiagentes.

## Requisitos

- Node.js **18** ou superior (utilizado para `AbortSignal.timeout`).
- Conta StackSpot criada no [portal StackSpot](https://ai.stackspot.com/) para obter credenciais e agentes disponíveis.

## Instalação

```bash
npm install @stackspot/sdk
```

## Configuração de ambiente

Antes de usar os exemplos ou consumir o SDK, informe suas credenciais através de variáveis de ambiente:

| Variável | Descrição |
| --- | --- |
| `STACKSPOT_CLIENT_ID` | Client ID gerado no portal StackSpot |
| `STACKSPOT_CLIENT_SECRET` | Client Secret correspondente |
| `STACKSPOT_AGENT_ID` | ID do agente (assistente) que será executado |
| `STACKSPOT_REALM` *(opcional)* | Realm/tenant do seu workspace. Padrão: `stackspot-freemium` |

Exemplo no Linux/macOS:

```bash
export STACKSPOT_CLIENT_ID="seu-client-id"
export STACKSPOT_CLIENT_SECRET="seu-client-secret"
export STACKSPOT_AGENT_ID="01KXXXXXXXXXXXXXXX"
```

No Windows PowerShell:

```powershell
$env:STACKSPOT_CLIENT_ID="seu-client-id"
$env:STACKSPOT_CLIENT_SECRET="seu-client-secret"
$env:STACKSPOT_AGENT_ID="01KXXXXXXXXXXXXXXX"
```

## Uso básico

```ts
import StackSpot from '@stackspot/sdk';

const stackspot = new StackSpot({
  clientId: process.env.STACKSPOT_CLIENT_ID!,
  clientSecret: process.env.STACKSPOT_CLIENT_SECRET!,
  realm: process.env.STACKSPOT_REALM || 'stackspot-freemium',
});

async function executar() {
  const thread = await stackspot.beta.threads.create();

  await stackspot.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Olá! Pode me ajudar?',
  });

  const run = await stackspot.beta.threads.runs.create(thread.id, {
    assistant_id: process.env.STACKSPOT_AGENT_ID!,
  });

  // Consulte o status até finalizar
  let status = run.status;
  while (status === 'queued' || status === 'in_progress') {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    status = (await stackspot.beta.threads.runs.retrieve(thread.id, run.id)).status;
  }

  const messages = await stackspot.beta.threads.messages.list(thread.id, { order: 'asc' });
  const resposta = messages.data[messages.data.length - 1];
  console.log(resposta.content[0].text.value);
}

executar().catch(console.error);
```

## Exemplos incluídos

- `examples/basic-usage.ts` – fluxo de conversa básico com polling.
- `examples/create-simple-page.ts` – orquestra múltiplos agentes para gerar e abrir um `index.html` com efeito de estrelas.
- `examples/open-chrome-command.ts` – demonstra o uso de ferramentas (`execute_command`) para abrir o Chrome em uma URL específica.

Execute qualquer exemplo após configurar as variáveis de ambiente:

```bash
npm run example:basic
npm run example:create-page
npm run example:open-chrome
```

## Desenvolvimento

- `npm run build` – compila os arquivos TypeScript para `dist/`.
- `npm run prepublishOnly` – script executado automaticamente antes do `npm publish`.
- `npm pack --dry-run` – visualize os arquivos que serão publicados.
- `npm run test` – executa a suíte de testes unitários com Vitest.

Os artefatos publicados são limitados aos diretórios `dist/`, `README.md` e `LICENSE` (veja a propriedade `files` em `package.json`).

## Licença

Distribuído sob a licença ISC. Consulte o arquivo `LICENSE` para detalhes.


