/**
 * Teste Rápido: Acesso a Arquivo via Socket.IO
 * 
 * Este exemplo usa Socket.IO para conectar ao servidor principal,
 * permitindo que o agente acesse arquivos do sistema através das
 * ferramentas de filesystem implementadas no servidor.
 * 
 * ⚠️ IMPORTANTE: O servidor principal precisa estar rodando!
 * Execute: cd .. && npm run dev
 * 
 * Uso: npm run test:file-access
 * ou: npx ts-node examples/quick-file-test.ts
 */

import { io, Socket } from 'socket.io-client';
import path from 'path';

async function testeRapido() {
  console.log('🚀 Teste Rápido: Acesso a Arquivo via Socket.IO\n');
  console.log('⚠️  Certifique-se de que o servidor principal está rodando (npm run dev)\n');

  // Caminho do arquivo a ser lido
  const arquivoParaLer = path.resolve(__dirname, '../../package.json');
  console.log(`📁 Arquivo a ser lido: ${arquivoParaLer}\n`);

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
        console.error('❌ Timeout: Não recebeu resposta em 60 segundos');
        socket.disconnect();
        reject(new Error('Timeout'));
      }
    }, 60000);

    socket.on('connect', () => {
      console.log('✅ Conectado ao servidor principal\n');

      // Aguarda um pouco para garantir que a thread foi criada
      setTimeout(() => {
        console.log('📤 Enviando mensagem ao agente...');
        console.log(`   Mensagem: "Leia ${arquivoParaLer}"\n`);

        // Usa formato que o servidor detecta automaticamente
        socket.emit('message', {
          message: `Leia ${arquivoParaLer}`,
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

      console.log('\n✅ Teste concluído com sucesso!');
      socket.disconnect();
      resolve();
    });

    // Escuta mensagens do agente (streaming)
    socket.on('agent_message', (data: any) => {
      if (data.type === 'file_read_notification') {
        console.log(`📂 ${data.message}`);
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
  testeRapido().catch((error) => {
    console.error('❌ Erro:', error.message || error);
    process.exit(1);
  });
}

export { testeRapido };
