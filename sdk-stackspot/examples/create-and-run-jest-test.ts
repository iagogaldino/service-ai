/**
 * Teste: Criar e Executar Teste Unitário Jest
 * 
 * Este exemplo testa se o agente consegue criar testes unitários Jest
 * e executá-los para verificar se passam.
 * 
 * ⚠️ IMPORTANTE: O servidor principal precisa estar rodando!
 * Execute: cd .. && npm run dev
 * 
 * Uso: npm run test:create-and-run-jest
 * ou: npx ts-node examples/create-and-run-jest-test.ts
 */

import { io, Socket } from 'socket.io-client';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function testeCriarEExecutarJest() {
  console.log('🚀 Teste: Criar e Executar Teste Unitário Jest\n');
  console.log('⚠️  Certifique-se de que o servidor principal está rodando (npm run dev)\n');

  // Arquivo alvo para criar testes
  const targetFile = 'C:\\Users\\iago_\\Desktop\\guinhogood\\testesdkstackspot\\server.ts';
  const targetDir = path.dirname(targetFile);
  console.log(`📄 Arquivo alvo: ${targetFile}`);
  console.log(`📁 Diretório: ${targetDir}\n`);

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
        console.error('❌ Timeout: Não recebeu resposta em 3 minutos');
        socket.disconnect();
        reject(new Error('Timeout'));
      }
    }, 180000); // 3 minutos

    socket.on('connect', () => {
      console.log('✅ Conectado ao servidor principal\n');

      // Aguarda um pouco para garantir que a thread foi criada
      setTimeout(() => {
        console.log('📤 Enviando mensagem ao agente...');
        const message = `Crie um teste unitário Jest para o arquivo ${targetFile} e execute os testes para verificar se passam.

INSTRUÇÕES OBRIGATÓRIAS:
1. PRIMEIRO: Use read_file path=${targetFile} para ler o arquivo e entender sua estrutura
2. CRIE o arquivo de teste Jest chamado server.test.ts no diretório ${targetDir}
3. O teste deve cobrir:
   - A rota GET '/' retorna a mensagem correta
   - O servidor inicia na porta correta
   - Testes de integração básicos
4. Use write_file para criar o arquivo de teste
5. Atualize o package.json para incluir as dependências necessárias (jest, @types/jest, ts-jest, @types/supertest, supertest) se ainda não estiverem
6. Crie também um arquivo jest.config.js ou atualize o package.json com a configuração do Jest
7. INSTALE as dependências usando: execute_command command=cd "${targetDir}" && npm install
8. DEPOIS DE INSTALAR: Use execute_command para executar os testes com o comando "npm test" ou "npx jest" no diretório ${targetDir}
9. Me informe o resultado da execução dos testes

FORMATO OBRIGATÓRIO para write_file:
write_file path=CAMINHO_COMPLETO
CONTEUDO_DO_ARQUIVO_AQUI

FORMATO OBRIGATÓRIO para execute_command:
execute_command command=cd "${targetDir}" && npm test

Execute TODAS as etapas e me informe quando terminar, incluindo o resultado dos testes.`;
        
        console.log(`   Mensagem: "${message.substring(0, 150)}..."\n`);

        socket.emit('message', {
          message: message,
        });

        console.log('⏳ Aguardando resposta do agente...\n');
      }, 2000);
    });

    // Escuta a resposta do agente
    socket.on('response', async (data: any) => {
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

      // Verifica se os arquivos foram criados
      console.log('\n🔍 Verificando arquivos criados...');
      try {
        const testFile = path.join(targetDir, 'server.test.ts');
        const jestConfig = path.join(targetDir, 'jest.config.js');
        
        const fs = require('fs');
        if (fs.existsSync(testFile)) {
          console.log('✅ server.test.ts encontrado');
        } else {
          console.log('❌ server.test.ts não encontrado');
        }
        
        if (fs.existsSync(jestConfig)) {
          console.log('✅ jest.config.js encontrado');
        } else {
          console.log('⚠️  jest.config.js não encontrado (pode estar no package.json)');
        }
      } catch (error) {
        console.log('⚠️  Erro ao verificar arquivos:', error);
      }

      // Tenta executar os testes localmente para verificar
      console.log('\n🧪 Executando testes localmente para verificar...');
      try {
        const { stdout, stderr } = await execAsync(`cd "${targetDir}" && npm test`, {
          timeout: 30000, // 30 segundos
        });
        
        console.log('📋 Resultado da execução dos testes:');
        console.log('─'.repeat(80));
        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);
        console.log('─'.repeat(80));
        
        // Verifica se os testes passaram
        if (stdout.includes('PASS') || stdout.includes('✓') || stdout.includes('passed')) {
          console.log('\n✅ Testes passaram com sucesso!');
        } else if (stdout.includes('FAIL') || stdout.includes('✕') || stdout.includes('failed')) {
          console.log('\n❌ Alguns testes falharam');
        } else {
          console.log('\n⚠️  Não foi possível determinar o resultado dos testes');
        }
      } catch (error: any) {
        console.log('⚠️  Erro ao executar testes localmente:', error.message);
        if (error.message.includes('npm test')) {
          console.log('💡 Tente executar manualmente: cd "' + targetDir + '" && npm test');
        }
      }

      console.log('\n✅ Teste concluído!');
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
  testeCriarEExecutarJest().catch((error) => {
    console.error('❌ Erro:', error.message || error);
    process.exit(1);
  });
}

export { testeCriarEExecutarJest };

