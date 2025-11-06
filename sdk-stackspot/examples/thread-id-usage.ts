/**
 * Exemplo de uso de thread_id no StackSpot SDK
 * 
 * Demonstra como usar thread_id para manter contexto de conversa
 */

import StackSpot from '../src/index';

async function exemploThreadId() {
  const stackspot = new StackSpot({
    clientId: 'seu-client-id',
    clientSecret: 'seu-client-secret',
  });

  // 1. Criar uma thread (retorna thread_id)
  console.log('📝 Criando thread...');
  const thread = await stackspot.beta.threads.create();
  const threadId = thread.id; // thread_id único
  console.log(`✅ Thread criada com ID: ${threadId}\n`);

  // 2. Adicionar mensagens usando o thread_id
  console.log('💬 Adicionando mensagens à thread...');
  await stackspot.beta.threads.messages.create(threadId, {
    role: 'user',
    content: 'Olá! Meu nome é João.',
  });
  console.log(`✅ Mensagem adicionada à thread ${threadId}\n`);

  // 3. Criar run usando o thread_id
  console.log('🚀 Criando run na thread...');
  const run = await stackspot.beta.threads.runs.create(threadId, {
    assistant_id: '01K9CFTZRCA6CPPXSFZKNCA0KW',
  });
  console.log(`✅ Run criado na thread ${threadId}\n`);

  // 4. Continuar a conversa na mesma thread (mantém contexto)
  console.log('💬 Adicionando nova mensagem na mesma thread (mantém contexto)...');
  await stackspot.beta.threads.messages.create(threadId, {
    role: 'user',
    content: 'Qual é o meu nome?', // O agente deve lembrar que é "João"
  });

  const run2 = await stackspot.beta.threads.runs.create(threadId, {
    assistant_id: '01K9CFTZRCA6CPPXSFZKNCA0KW',
  });

  // 5. Recuperar thread existente usando thread_id
  console.log('\n📖 Recuperando thread existente...');
  const retrievedThread = await stackspot.beta.threads.retrieve(threadId);
  console.log(`✅ Thread recuperada: ${retrievedThread.id}\n`);

  // 6. Listar todas as mensagens da thread usando thread_id
  console.log('📋 Listando mensagens da thread...');
  const messages = await stackspot.beta.threads.messages.list(threadId);
  console.log(`✅ ${messages.data.length} mensagens encontradas na thread ${threadId}\n`);

  // 7. Listar todos os runs da thread usando thread_id
  console.log('📋 Listando runs da thread...');
  const runs = await stackspot.beta.threads.runs.list(threadId);
  console.log(`✅ ${runs.data.length} runs encontrados na thread ${threadId}\n`);

  // 8. Cada mensagem e run tem thread_id associado
  messages.data.forEach((msg) => {
    console.log(`Mensagem ${msg.id} pertence à thread: ${msg.thread_id}`);
  });

  runs.data.forEach((run) => {
    console.log(`Run ${run.id} pertence à thread: ${run.thread_id}`);
  });
}

// Exemplo de múltiplas threads (conversas separadas)
async function exemploMultiplasThreads() {
  const stackspot = new StackSpot({
    clientId: 'seu-client-id',
    clientSecret: 'seu-client-secret',
  });

  // Criar duas threads separadas
  const thread1 = await stackspot.beta.threads.create();
  const thread2 = await stackspot.beta.threads.create();

  console.log(`Thread 1 ID: ${thread1.id}`);
  console.log(`Thread 2 ID: ${thread2.id}`);

  // Cada thread mantém seu próprio histórico
  await stackspot.beta.threads.messages.create(thread1.id, {
    role: 'user',
    content: 'Esta é a conversa 1',
  });

  await stackspot.beta.threads.messages.create(thread2.id, {
    role: 'user',
    content: 'Esta é a conversa 2',
  });

  // As mensagens não se misturam entre threads
  const msgs1 = await stackspot.beta.threads.messages.list(thread1.id);
  const msgs2 = await stackspot.beta.threads.messages.list(thread2.id);

  console.log(`Thread 1 tem ${msgs1.data.length} mensagens`);
  console.log(`Thread 2 tem ${msgs2.data.length} mensagens`);
}

// Executa os exemplos
exemploThreadId().catch(console.error);
// exemploMultiplasThreads().catch(console.error);
