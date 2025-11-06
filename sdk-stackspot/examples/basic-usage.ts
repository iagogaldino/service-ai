/**
 * Exemplo básico de uso do StackSpot SDK
 * 
 * Demonstra como usar o SDK de forma similar ao OpenAI SDK
 */

import StackSpot from '../src/index';

async function exemploBasico() {
  // Inicializa o cliente StackSpot
  const stackspot = new StackSpot({
    clientId: '7022296d-5677-40f6-9b71-618a5f259f8b',
    clientSecret: 'f1kYnMmF3KilMTqU6rLGIb189383N6JD818XGf7NRsXt8GPM8JYT42NtUIzJw0X9',
    realm: 'stackspot-freemium',
  });

  console.log('✅ Cliente StackSpot inicializado\n');

  // 1. Criar uma thread (conversa)
  console.log('📝 Criando thread...');
  const thread = await stackspot.beta.threads.create();
  console.log(`✅ Thread criada: ${thread.id}\n`);

  // 2. Adicionar mensagem do usuário
  console.log('💬 Adicionando mensagem do usuário...');
  const userMessage = await stackspot.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Olá! Como você está?',
  });
  console.log(`✅ Mensagem adicionada: ${userMessage.id}\n`);

  // 3. Criar e executar um run (usando o ID do agente do StackSpot)
  const agentId = '01K9CGV7PDN62MPDG8RF0YDZMA'; // Substitua pelo ID do seu agente
  console.log(`🚀 Criando run com agente ${agentId}...`);
  const run = await stackspot.beta.threads.runs.create(thread.id, {
    assistant_id: agentId,
    stream: false,
  });
  console.log(`✅ Run criado: ${run.id} (Status: ${run.status})\n`);

  // 4. Aguardar conclusão do run
  console.log('⏳ Aguardando conclusão do run...');
  let currentRun = run;
  let attempts = 0;
  const maxAttempts = 30; // Máximo de 30 tentativas (30 segundos)

  while (
    (currentRun.status === 'queued' || currentRun.status === 'in_progress') &&
    attempts < maxAttempts
  ) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    currentRun = await stackspot.beta.threads.runs.retrieve(thread.id, run.id);
    attempts++;
    console.log(`   Status: ${currentRun.status} (tentativa ${attempts}/${maxAttempts})`);
  }

  if (currentRun.status === 'completed') {
    console.log('✅ Run concluído com sucesso!\n');
  } else if (currentRun.status === 'failed') {
    console.error(`❌ Run falhou: ${currentRun.last_error?.message}\n`);
    return;
  } else {
    console.warn(`⚠️ Run ainda em progresso após ${maxAttempts} tentativas\n`);
  }

  // 5. Obter mensagens atualizadas
  console.log('📨 Obtendo mensagens da thread...');
  const messages = await stackspot.beta.threads.messages.list(thread.id, {
    order: 'asc',
  });

  console.log(`\n📋 Histórico da conversa (${messages.data.length} mensagens):\n`);
  messages.data.forEach((msg) => {
    const role = msg.role === 'user' ? '👤 Usuário' : '🤖 Assistente';
    const content = msg.content[0].text.value;
    console.log(`${role}: ${content}\n`);
  });

  // 6. Continuar a conversa
  console.log('💬 Adicionando nova mensagem...');
  await stackspot.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Obrigado pela resposta!',
  });

  // Criar novo run
  console.log('🚀 Criando novo run...');
  const run2 = await stackspot.beta.threads.runs.create(thread.id, {
    assistant_id: agentId,
  });

  // Aguardar conclusão
  let currentRun2 = run2;
  attempts = 0;
  while (
    (currentRun2.status === 'queued' || currentRun2.status === 'in_progress') &&
    attempts < maxAttempts
  ) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    currentRun2 = await stackspot.beta.threads.runs.retrieve(thread.id, run2.id);
    attempts++;
  }

  if (currentRun2.status === 'completed') {
    const updatedMessages = await stackspot.beta.threads.messages.list(thread.id, {
      order: 'asc',
    });
    const lastMessage = updatedMessages.data[updatedMessages.data.length - 1];
    console.log(`\n🤖 Resposta final: ${lastMessage.content[0].text.value}\n`);
  }
}

// Executa o exemplo
exemploBasico().catch((error) => {
  console.error('❌ Erro:', error);
  process.exit(1);
});
