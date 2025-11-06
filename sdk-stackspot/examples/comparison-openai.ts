/**
 * Exemplo comparativo: OpenAI vs StackSpot SDK
 * 
 * Demonstra como o StackSpot SDK mantém a mesma interface do OpenAI SDK
 */

// Exemplo com OpenAI (comentado - apenas para referência)
/*
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: 'sk-...',
});

// Criar thread
const thread = await openai.beta.threads.create();

// Adicionar mensagem
await openai.beta.threads.messages.create(thread.id, {
  role: 'user',
  content: 'Hello!',
});

// Criar run
const run = await openai.beta.threads.runs.create(thread.id, {
  assistant_id: 'asst_...',
});
*/

// Exemplo com StackSpot (mesma interface!)
import StackSpot from '../src/index';

const stackspot = new StackSpot({
  clientId: 'seu-client-id',
  clientSecret: 'seu-client-secret',
});

// Criar thread (mesma interface!)
const thread = await stackspot.beta.threads.create();

// Adicionar mensagem (mesma interface!)
await stackspot.beta.threads.messages.create(thread.id, {
  role: 'user',
  content: 'Hello!',
});

// Criar run (mesma interface!)
const run = await stackspot.beta.threads.runs.create(thread.id, {
  assistant_id: '01K9CFTZRCA6CPPXSFZKNCA0KW', // ID do agente do StackSpot
});

console.log('✅ Interface idêntica ao OpenAI SDK!');
