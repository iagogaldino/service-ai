const fs = require('fs');
const path = require('path');

const logsPath = path.join(__dirname, 'logs.json');

try {
  const logsData = JSON.parse(fs.readFileSync(logsPath, 'utf-8'));
  const entries = logsData.entries || [];
  
  console.log('\n📊 ANÁLISE DE TEMPOS DAS REQUISIÇÕES\n');
  console.log('='.repeat(60));
  
  // Agrupa eventos por threadId e runId
  const runs = new Map();
  
  entries.forEach(entry => {
    if (!entry.threadId || !entry.runId) return;
    
    const key = `${entry.threadId}_${entry.runId}`;
    if (!runs.has(key)) {
      runs.set(key, {
        threadId: entry.threadId,
        runId: entry.runId,
        agentName: entry.agentName,
        events: [],
        fullEntry: entry // Guarda a entrada completa para acessar tokenUsage
      });
    }
    
    runs.get(key).events.push({
      type: entry.type,
      timestamp: new Date(entry.timestamp).getTime(),
      metadata: entry.metadata || {}
    });
    
    // Se for response, guarda a entrada completa
    if (entry.type === 'response') {
      runs.get(key).responseEntry = entry;
    }
  });
  
  // Analisa cada run
  runs.forEach((run, key) => {
    const events = run.events.sort((a, b) => a.timestamp - b.timestamp);
    
    const messageSent = events.find(e => e.type === 'message_sent');
    const runStatus = events.find(e => e.type === 'run_status');
    const response = events.find(e => e.type === 'response');
    
    if (!messageSent || !response) return;
    
    console.log(`\n🤖 Agente: ${run.agentName}`);
    console.log(`   Run ID: ${run.runId.substring(0, 20)}...`);
    
    if (runStatus) {
      const timeToRun = runStatus.timestamp - messageSent.timestamp;
      console.log(`   ⏱️  Tempo até criar run: ${timeToRun}ms`);
    }
    
    const totalTime = response.timestamp - messageSent.timestamp;
    const minutes = Math.floor(totalTime / 60000);
    const seconds = ((totalTime % 60000) / 1000).toFixed(2);
    
    console.log(`   ⏱️  Tempo total (message_sent → response): ${totalTime}ms (${minutes}m ${seconds}s)`);
    
    // Token usage se disponível
    if (run.responseEntry && run.responseEntry.tokenUsage) {
      const tokens = run.responseEntry.tokenUsage;
      console.log(`   💰 Tokens: ${tokens.totalTokens} (prompt: ${tokens.promptTokens}, completion: ${tokens.completionTokens})`);
    }
    
    console.log('   ' + '-'.repeat(50));
  });
  
  // Estatísticas gerais
  console.log('\n📈 ESTATÍSTICAS GERAIS\n');
  
  const allRuns = Array.from(runs.values());
  const totalTimes = allRuns.map(run => {
    const events = run.events.sort((a, b) => a.timestamp - b.timestamp);
    const messageSent = events.find(e => e.type === 'message_sent');
    const response = events.find(e => e.type === 'response');
    if (!messageSent || !response) return null;
    return response.timestamp - messageSent.timestamp;
  }).filter(t => t !== null);
  
  if (totalTimes.length > 0) {
    const avgTime = totalTimes.reduce((a, b) => a + b, 0) / totalTimes.length;
    const minTime = Math.min(...totalTimes);
    const maxTime = Math.max(...totalTimes);
    
    console.log(`   Total de runs analisados: ${totalTimes.length}`);
    console.log(`   ⏱️  Tempo médio: ${avgTime.toFixed(2)}ms (${(avgTime / 1000).toFixed(2)}s)`);
    console.log(`   ⏱️  Tempo mínimo: ${minTime}ms (${(minTime / 1000).toFixed(2)}s)`);
    console.log(`   ⏱️  Tempo máximo: ${maxTime}ms (${(maxTime / 1000).toFixed(2)}s)`);
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
} catch (error) {
  console.error('❌ Erro ao analisar logs:', error.message);
  process.exit(1);
}

