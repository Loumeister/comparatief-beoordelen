import { Text, Judgement } from './db';

/**
 * Check of de vergelijkingsgrafiek verbonden is
 * (alle teksten zijn bereikbaar via judgements)
 * 
 * Gebruikt DFS om te testen of alle nodes in één component zitten.
 */
export function isConnected(texts: Text[], judgements: Judgement[]): boolean {
  if (texts.length === 0) return true;
  if (texts.length === 1) return true;
  if (judgements.length === 0) return false;
  
  const adj = new Map<number, number[]>();
  texts.forEach(t => adj.set(t.id!, []));
  
  judgements.forEach(j => {
    adj.get(j.textAId)?.push(j.textBId);
    adj.get(j.textBId)?.push(j.textAId);
  });

  const visited = new Set<number>();
  const stack = [texts[0].id!];
  
  while (stack.length) {
    const node = stack.pop()!;
    if (!visited.has(node)) {
      visited.add(node);
      (adj.get(node) || []).forEach(n => {
        if (!visited.has(n)) stack.push(n);
      });
    }
  }
  
  return visited.size === texts.length;
}
