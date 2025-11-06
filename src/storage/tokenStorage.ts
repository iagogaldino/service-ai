/**
 * Storage para tokens
 */

import fs from 'fs';
import path from 'path';
import { TokenUsage, TokenCost, TokenHistoryEntry, TokensJsonFile, LLMProvider } from '../types';
import { calculateTokenCost } from '../utils/tokenCalculator';
import { loadConfigFromJson } from '../config/env';

/**
 * Obtém o LLM provider atual do config.json
 */
function getCurrentLLMProvider(): LLMProvider {
  try {
    const config = loadConfigFromJson();
    return config?.llmProvider || 'openai';
  } catch (error) {
    console.warn('⚠️ Erro ao obter LLM provider, usando padrão (openai):', error);
    return 'openai';
  }
}

/**
 * Salva informações de tokens em um arquivo JSON
 */
export function saveTokens(
  threadId: string,
  agentName: string,
  message: string,
  tokenUsage: TokenUsage,
  accumulatedTokenUsage: TokenUsage,
  model: string = 'gpt-4-turbo-preview',
  llmProvider?: LLMProvider
): void {
  try {
    const tokensFilePath = path.join(process.cwd(), 'tokens.json');
    
    const cost = calculateTokenCost(tokenUsage, model);
    const accumulatedCost = calculateTokenCost(accumulatedTokenUsage, model);
    
    let tokensData: TokensJsonFile;
    if (fs.existsSync(tokensFilePath)) {
      const fileContent = fs.readFileSync(tokensFilePath, 'utf-8');
      const parsed = JSON.parse(fileContent);
      if (!parsed.totalCost) {
        parsed.totalCost = { promptCost: 0, completionCost: 0, totalCost: 0 };
      }
      tokensData = parsed;
    } else {
      tokensData = createEmptyTokensData();
    }

    const newEntry: TokenHistoryEntry = {
      threadId,
      timestamp: new Date().toISOString(),
      agentName,
      message,
      tokenUsage,
      accumulatedTokenUsage,
      cost,
      accumulatedCost,
      model,
      llmProvider: llmProvider || getCurrentLLMProvider()
    };
    
    tokensData.entries.push(newEntry);
    tokensData.totalTokens.promptTokens += tokenUsage.promptTokens;
    tokensData.totalTokens.completionTokens += tokenUsage.completionTokens;
    tokensData.totalTokens.totalTokens += tokenUsage.totalTokens;
    tokensData.totalCost.promptCost += cost.promptCost;
    tokensData.totalCost.completionCost += cost.completionCost;
    tokensData.totalCost.totalCost += cost.totalCost;
    
    tokensData.totalCost.promptCost = Math.round(tokensData.totalCost.promptCost * 10000) / 10000;
    tokensData.totalCost.completionCost = Math.round(tokensData.totalCost.completionCost * 10000) / 10000;
    tokensData.totalCost.totalCost = Math.round(tokensData.totalCost.totalCost * 10000) / 10000;
    tokensData.lastUpdated = new Date().toISOString();

    fs.writeFileSync(tokensFilePath, JSON.stringify(tokensData, null, 2), 'utf-8');
    console.log(`💾 Tokens salvos em tokens.json (Total: ${tokensData.totalTokens.totalTokens} tokens, Custo: $${tokensData.totalCost.totalCost.toFixed(4)})`);
  } catch (error) {
    console.error('❌ Erro ao salvar tokens no JSON:', error);
  }
}

/**
 * Carrega tokens do arquivo JSON
 */
export function loadTokens(llmProvider?: LLMProvider): TokensJsonFile {
  try {
    const tokensFilePath = path.join(process.cwd(), 'tokens.json');
    
    if (!fs.existsSync(tokensFilePath)) {
      return createEmptyTokensData();
    }

    const fileContent = fs.readFileSync(tokensFilePath, 'utf-8');
    const tokensData: TokensJsonFile = JSON.parse(fileContent);
    
    // Filtra por provider se especificado
    if (llmProvider) {
      const filteredEntries = tokensData.entries.filter(
        entry => entry.llmProvider === llmProvider
      );
      
      // Recalcula totais baseado nos tokens filtrados
      const totalTokens: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      const totalCost: TokenCost = { promptCost: 0, completionCost: 0, totalCost: 0 };
      
      filteredEntries.forEach(entry => {
        totalTokens.promptTokens += entry.tokenUsage.promptTokens;
        totalTokens.completionTokens += entry.tokenUsage.completionTokens;
        totalTokens.totalTokens += entry.tokenUsage.totalTokens;
        if (entry.cost) {
          totalCost.promptCost += entry.cost.promptCost;
          totalCost.completionCost += entry.cost.completionCost;
          totalCost.totalCost += entry.cost.totalCost;
        }
      });
      
      totalCost.promptCost = Math.round(totalCost.promptCost * 10000) / 10000;
      totalCost.completionCost = Math.round(totalCost.completionCost * 10000) / 10000;
      totalCost.totalCost = Math.round(totalCost.totalCost * 10000) / 10000;
      
      return {
        totalTokens,
        totalCost,
        entries: filteredEntries,
        lastUpdated: tokensData.lastUpdated
      };
    }
    
    return tokensData;
  } catch (error) {
    console.error('❌ Erro ao carregar tokens:', error);
    return createEmptyTokensData();
  }
}

/**
 * Cria estrutura vazia de tokens
 */
function createEmptyTokensData(): TokensJsonFile {
  return {
    totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    totalCost: { promptCost: 0, completionCost: 0, totalCost: 0 },
    entries: [],
    lastUpdated: new Date().toISOString()
  };
}

