/**
 * Exemplo: Acesso a Arquivos via Servidor Principal
 * 
 * Este exemplo demonstra como testar acesso a arquivos através do servidor principal.
 * 
 * IMPORTANTE: O servidor principal (src/server.ts) precisa estar rodando!
 * 
 * Como usar:
 * 1. Em um terminal, execute: cd .. && npm run dev
 * 2. Em outro terminal, execute este exemplo: npm run test:file-access-server
 */

import { io, Socket } from 'socket.io-client';

async function testeAcessoArquivoViaServidor() {
  console.log('🚀 Teste: Acesso a Arquivo via Servidor Principal\n');
  console.log('⚠️  Certifique-se de que o servidor principal está rodando (npm run dev)\n');

  // Conecta ao servidor principal
  const socket = io('http://localhost:3000', {
    transports: ['websocket'],
  });

  return new Promise<void>((resolve, reject) => {
    socket.on('connect', () => {
      console.log('✅ Conectado ao servidor principal\n');

      // Aguarda um pouco para garantir que a thread foi criada
      setTimeout(() => {
        // Envia mensagem pedindo para ler um arquivo
        const arquivoParaLer = 'C:\\Users\\iago_\\Desktop\\Projects\\ServiceIA\\package.json';
        
        console.log(`📤 Enviando mensagem: "Leia o arquivo ${arquivoParaLer}"\n`);
        
        socket.emit('message', {
          message: `Leia o arquivo: ${arquivoParaLer} e me mostre o conteúdo.`,
        });

        // Escuta a resposta
        socket.on('response', (data: any) => {
          console.log('📄 Resposta do agente:');
          console.log('─'.repeat(80));
          console.log(data.message);
          console.log('─'.repeat(80));
          
          if (data.tokenUsage) {
            console.log(`\n📊 Tokens: ${data.tokenUsage.totalTokens} (prompt: ${data.tokenUsage.promptTokens}, completion: ${data.tokenUsage.completionTokens})`);
          }
          
          console.log('\n✅ Teste concluído!');
          socket.disconnect();
          resolve();
        });

        // Escuta erros
        socket.on('error', (error: any) => {
          console.error('❌ Erro:', error.message || error);
          socket.disconnect();
          reject(error);
        });

        // Timeout de segurança
        setTimeout(() => {
          console.error('❌ Timeout: Não recebeu resposta em 60 segundos');
          socket.disconnect();
          reject(new Error('Timeout'));
        }, 60000);
      }, 2000);
    });

    socket.on('connect_error', (error: any) => {
      console.error('❌ Erro ao conectar ao servidor:', error.message);
      console.error('\n💡 Certifique-se de que o servidor principal está rodando:');
      console.error('   cd ..');
      console.error('   npm run dev\n');
      reject(error);
    });
  });
}

// Executa o teste
if (require.main === module) {
  testeAcessoArquivoViaServidor().catch((error) => {
    console.error('❌ Erro:', error);
    process.exit(1);
  });
}

export { testeAcessoArquivoViaServidor };

