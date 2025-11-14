/**
 * Serviço de gerenciamento de conexões
 */

import { ConnectionInfo } from '../types';

const connectionsMap = new Map<string, ConnectionInfo>();
const monitoringSockets = new Map<string, string>(); // Map: monitorSocketId -> targetSocketId

/**
 * Adiciona uma conexão
 */
export function addConnection(connectionInfo: ConnectionInfo): void {
  connectionsMap.set(connectionInfo.socketId, connectionInfo);
}

/**
 * Obtém informações de uma conexão
 */
export function getConnection(socketId: string): ConnectionInfo | undefined {
  return connectionsMap.get(socketId);
}

/**
 * Remove uma conexão
 */
export function removeConnection(socketId: string): void {
  connectionsMap.delete(socketId);
}

/**
 * Atualiza atividade de uma conexão
 */
export function updateConnectionActivity(socketId: string): void {
  const connection = connectionsMap.get(socketId);
  if (connection) {
    connection.lastActivity = new Date();
    connectionsMap.set(socketId, connection);
  }
}

/**
 * Incrementa contador de mensagens de uma conexão
 */
export function incrementMessageCount(socketId: string): void {
  const connection = connectionsMap.get(socketId);
  if (connection) {
    connection.messageCount++;
    connectionsMap.set(socketId, connection);
  }
}

/**
 * Obtém todas as conexões
 */
export function getAllConnections(): ConnectionInfo[] {
  return Array.from(connectionsMap.values());
}

/**
 * Adiciona um monitor para um socket
 */
export function addMonitor(monitorSocketId: string, targetSocketId: string): void {
  monitoringSockets.set(monitorSocketId, targetSocketId);
}

/**
 * Remove um monitor
 */
export function removeMonitor(monitorSocketId: string): void {
  monitoringSockets.delete(monitorSocketId);
}

/**
 * Obtém o socket alvo de um monitor
 */
export function getMonitorTarget(monitorSocketId: string): string | undefined {
  return monitoringSockets.get(monitorSocketId);
}

/**
 * Obtém todos os monitores de um socket alvo
 */
export function getMonitorsForTarget(targetSocketId: string): string[] {
  const monitors: string[] = [];
  monitoringSockets.forEach((target, monitor) => {
    if (target === targetSocketId) {
      monitors.push(monitor);
    }
  });
  return monitors;
}

