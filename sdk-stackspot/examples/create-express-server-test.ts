/**
 * Teste: Criar Servidor Express Simples
 * 
 * Este exemplo testa se o agente consegue gerar o código para criar um servidor Express simples.
 * 
 * ⚠️ LIMITAÇÃO: StackSpot não suporta function calling nativo, então o agente não pode
 * executar as ferramentas (write_file) automaticamente. O agente irá gerar o código
 * dos arquivos, mas você precisará criá-los manualmente ou usar uma solução alternativa.
 * 
 * ⚠️ IMPORTANTE: O servidor principal precisa estar rodando!
 * Execute: cd .. && npm run dev
 * 
 * Uso: npm run test:create-server
 * ou: npx ts-node examples/create-express-server-test.ts
 */

import { io, Socket } from 'socket.io-client';
import path from 'path';

async function testeCriarServidorExpress() {
  console.log('🚀 Teste: Criar Servidor Express Simples\n');
  console.log('⚠️  Certifique-se de que o servidor principal está rodando (npm run dev)\n');

  // Diretório onde o servidor será criado
  const targetDir = 'C:\\Users\\iago_\\Desktop\\guinhogood\\testesdkstackspot';
  console.log(`📁 Diretório alvo: ${targetDir}\n`);

  // Conecta ao servidor principal
  const socket = io('http://localhost:3000', {
    transports: ['websocket'],
    reconnection: false,
  });

  return new Promise<void>((resolve, reject) => {
    let resolved = false;

    // Timeout de segurança
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.error('❌ Timeout: Não recebeu resposta em 2 minutos');
        socket.disconnect();
        reject(new Error('Timeout'));
      }
    }, 120000); // 2 minutos

    socket.on('connect', () => {
      console.log('✅ Conectado ao servidor principal\n');

      // Aguarda um pouco para garantir que a thread foi criada
      setTimeout(() => {
        console.log('📤 Enviando mensagem ao agente...');
        const message = `Crie um servidor Express simples no diretório ${targetDir}. 

IMPORTANTE: Use a ferramenta write_file para criar os arquivos. Crie:
1. package.json - com dependências express, typescript, @types/express, @types/node, ts-node-dev
2. server.ts - servidor Express básico rodando na porta 3001
3. tsconfig.json - configuração TypeScript
4. README.md - instruções de como executar

Crie todos os arquivos usando write_file e me informe quando terminar.`;
        
        console.log(`   Mensagem: "${message.substring(0, 100)}..."\n`);

        socket.emit('message', {
          message: message,
        });

        console.log('⏳ Aguardando resposta do agente...\n');
      }, 2000);
    });

    // Escuta a resposta do agente
    socket.on('response', (data: any) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);

      console.log('📄 Resposta do agente:');
      console.log('─'.repeat(80));
      console.log(data.message);
      console.log('─'.repeat(80));

      if (data.tokenUsage) {
        console.log(`\n📊 Tokens: ${data.tokenUsage.totalTokens || data.tokenUsage.total_tokens || 0}`);
        if (data.tokenUsage.promptTokens || data.tokenUsage.prompt_tokens) {
          console.log(`   Prompt: ${data.tokenUsage.promptTokens || data.tokenUsage.prompt_tokens}`);
        }
        if (data.tokenUsage.completionTokens || data.tokenUsage.completion_tokens) {
          console.log(`   Completion: ${data.tokenUsage.completionTokens || data.tokenUsage.completion_tokens}`);
        }
      }

      console.log('\n✅ Teste concluído!');
      console.log(`\n📝 Nota: O agente gerou o código, mas os arquivos não foram criados automaticamente`);
      console.log(`   porque o StackSpot não suporta function calling nativo.`);
      console.log(`   Você pode copiar o código da resposta acima e criar os arquivos manualmente.`);
      console.log(`\n📂 Diretório alvo: ${targetDir}`);
      socket.disconnect();
      resolve();
    });

    // Escuta mensagens do agente (streaming e notificações)
    socket.on('agent_message', (data: any) => {
      if (data.type === 'file_read_notification') {
        console.log(`📂 ${data.message}`);
      } else if (data.type === 'action' || data.type === 'tool_execution') {
        console.log(`🔧 ${data.message || JSON.stringify(data)}`);
      }
    });

    // Escuta erros
    socket.on('error', (error: any) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      console.error('❌ Erro:', error.message || error);
      socket.disconnect();
      reject(error);
    });

    socket.on('connect_error', (error: any) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      console.error('❌ Erro ao conectar ao servidor:', error.message);
      console.error('\n💡 Certifique-se de que o servidor principal está rodando:');
      console.error('   cd C:\\Users\\iago_\\Desktop\\Projects\\ServiceIA');
      console.error('   npm run dev\n');
      socket.disconnect();
      reject(error);
    });
  });
}

// Executa o teste
if (require.main === module) {
  testeCriarServidorExpress().catch((error) => {
    console.error('❌ Erro:', error.message || error);
    process.exit(1);
  });
}

export { testeCriarServidorExpress };

