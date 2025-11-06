/**
 * Exemplo: Acesso a Diretórios e Arquivos via Socket.IO
 * 
 * Demonstra como usar Socket.IO para conectar ao servidor principal
 * e permitir que o agente acesse diretórios e arquivos do projeto.
 * 
 * ⚠️ IMPORTANTE: O servidor principal precisa estar rodando!
 * Execute: cd .. && npm run dev
 * 
 * Uso: npm run example:file-access
 * ou: npx ts-node examples/file-access-example.ts
 */

import { io, Socket } from 'socket.io-client';
import path from 'path';

async function exemploAcessoArquivos() {
  console.log('🚀 Exemplo: Acesso a Diretórios e Arquivos via Socket.IO\n');
  console.log('⚠️  Certifique-se de que o servidor principal está rodando (npm run dev)\n');

  // Diretório do projeto (raiz do ServiceIA)
  const projectRoot = path.resolve(__dirname, '../..');
  console.log(`📁 Diretório do projeto: ${projectRoot}\n`);

  // Conecta ao servidor principal
  const socket = io('http://localhost:3000', {
    transports: ['websocket'],
    reconnection: false,
  });

  return new Promise<void>((resolve, reject) => {
    let resolved = false;
    let currentTest = 0;
    const tests = [
      {
        name: 'Listar arquivos do diretório raiz',
        message: `Liste os arquivos e diretórios que estão no diretório: ${projectRoot}`,
      },
      {
        name: 'Ler conteúdo de package.json',
        message: `Leia e me mostre o conteúdo do arquivo: ${path.join(projectRoot, 'package.json')}`,
      },
      {
        name: 'Analisar estrutura do diretório src',
        message: `Analise a estrutura do diretório ${path.join(projectRoot, 'src')} e me diga quais são os principais arquivos e subdiretórios.`,
      },
      {
        name: 'Buscar arquivo config.json',
        message: `Procure por arquivos chamados "config.json" no projeto e me diga onde eles estão localizados.`,
      },
    ];

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.error('❌ Timeout: Não recebeu resposta em 5 minutos');
        socket.disconnect();
        reject(new Error('Timeout'));
      }
    }, 300000); // 5 minutos

    socket.on('connect', () => {
      console.log('✅ Conectado ao servidor principal\n');
      executarProximoTeste();
    });

    function executarProximoTeste() {
      if (currentTest >= tests.length) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.log('\n✅ Todos os testes concluídos!');
          socket.disconnect();
          resolve();
        }
        return;
      }

      const test = tests[currentTest];
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📂 Teste ${currentTest + 1}/${tests.length}: ${test.name}`);
      console.log('='.repeat(80) + '\n');

      // Limpa listeners anteriores
      socket.off('response');
      socket.off('agent_message');
      socket.off('error');

      // Escuta resposta
      socket.once('response', (data: any) => {
        console.log('📄 Resposta do agente:');
        console.log('─'.repeat(80));
        const resposta = data.message || '';
        // Mostra apenas primeiros 500 caracteres para não poluir o output
        if (resposta.length > 500) {
          console.log(resposta.substring(0, 500) + '...\n[Resposta truncada - total: ' + resposta.length + ' caracteres]');
        } else {
          console.log(resposta);
        }
        console.log('─'.repeat(80));

        if (data.tokenUsage) {
          const tokens = data.tokenUsage.totalTokens || data.tokenUsage.total_tokens || 0;
          if (tokens > 0) {
            console.log(`📊 Tokens usados: ${tokens}\n`);
          }
        }

        // Aguarda um pouco antes do próximo teste
        setTimeout(() => {
          currentTest++;
          executarProximoTeste();
        }, 2000);
      });

      // Escuta notificações de arquivo lido
      socket.on('agent_message', (data: any) => {
        if (data.type === 'file_read_notification') {
          console.log(`📂 ${data.message}`);
        }
      });

      // Escuta erros
      socket.once('error', (error: any) => {
        console.error(`❌ Erro no teste ${currentTest + 1}:`, error.message || error);
        currentTest++;
        setTimeout(() => executarProximoTeste(), 1000);
      });

      // Envia mensagem
      setTimeout(() => {
        console.log(`📤 Enviando: "${test.message.substring(0, 60)}..."\n`);
        socket.emit('message', {
          message: test.message,
        });
      }, 1000);
    }

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

// Executa o exemplo
if (require.main === module) {
  exemploAcessoArquivos().catch((error) => {
    console.error('❌ Erro:', error.message || error);
    process.exit(1);
  });
}

export { exemploAcessoArquivos };
