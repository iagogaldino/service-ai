/**
 * Teste: Criar Teste Unitário Jest
 * 
 * Este exemplo testa se o agente consegue criar testes unitários Jest
 * para um arquivo específico.
 * 
 * ⚠️ IMPORTANTE: O servidor principal precisa estar rodando!
 * Execute: cd .. && npm run dev
 * 
 * Uso: npm run test:create-jest
 * ou: npx ts-node examples/create-jest-test.ts
 */

import { io, Socket } from 'socket.io-client';
import path from 'path';

async function testeCriarJestTest() {
  console.log('🚀 Teste: Criar Teste Unitário Jest\n');
  console.log('⚠️  Certifique-se de que o servidor principal está rodando (npm run dev)\n');

  // Arquivo alvo para criar testes
  const targetFile = 'C:\\Users\\iago_\\Desktop\\guinhogood\\testesdkstackspot\\server.ts';
  console.log(`📄 Arquivo alvo: ${targetFile}\n`);

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
        const message = `Crie um teste unitário Jest para o arquivo ${targetFile}.

INSTRUÇÕES OBRIGATÓRIAS:
1. PRIMEIRO: Use read_file path=${targetFile} para ler o arquivo e entender sua estrutura
2. DEPOIS: Crie um arquivo de teste Jest chamado server.test.ts no mesmo diretório (${path.dirname(targetFile)})
3. O teste deve cobrir:
   - A rota GET '/' retorna a mensagem correta
   - O servidor inicia na porta correta
   - Testes de integração básicos
4. Use write_file para criar o arquivo de teste
5. Atualize o package.json para incluir as dependências necessárias (jest, @types/jest, ts-jest, @types/supertest, supertest) se ainda não estiverem
6. Crie também um arquivo jest.config.js ou atualize o package.json com a configuração do Jest

FORMATO OBRIGATÓRIO para write_file:
write_file path=CAMINHO_COMPLETO
CONTEUDO_DO_ARQUIVO_AQUI

Execute TODAS as etapas e me informe quando terminar.`;
        
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
      console.log(`\n📂 Diretório alvo: ${path.dirname(targetFile)}`);
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
  testeCriarJestTest().catch((error) => {
    console.error('❌ Erro:', error.message || error);
    process.exit(1);
  });
}

export { testeCriarJestTest };

