const conversations = new Map();

export function getHistory(userId) {
  return conversations.get(userId) || [];
}

export function addMessage(userId, role, text) {
  const h = getHistory(userId);
  h.push({ role, text, at: Date.now() });
  conversations.set(userId, h.slice(-50));
}

export function context(userId, max) {
  return getHistory(userId).slice(-max)
    .map(x => `${x.role}: ${x.text}`).join("\n");
}
