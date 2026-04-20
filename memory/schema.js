// memory/schema.js
// Defines all memory record types and their structure

export const MEMORY_TYPES = {
  DECISION:      'decision',
  PROJECT:       'project',
  CONSTRAINT:    'constraint',
  CONTRADICTION: 'contradiction',
  PREFERENCE:    'preference',
  OUTCOME:       'outcome',
  CONTEXT:       'context',
};

/**
 * Create a new memory record
 * @param {string} type - one of MEMORY_TYPES
 * @param {string} text - short human-readable summary (1-2 sentences)
 * @param {string} agentSource - which agent created this record
 * @param {object} detail - optional structured detail object
 */
export function createRecord(type, text, agentSource = 'system', detail = {}) {
  return {
    record_id:    crypto.randomUUID(),
    timestamp:    new Date().toISOString(),
    type,
    agent_source: agentSource,
    text,
    detail,
    status:       'active',  // active | superseded | contradicted | resolved
  };
}

/**
 * Memory record validation
 */
export function validateRecord(record) {
  const required = ['record_id', 'timestamp', 'type', 'text', 'agent_source', 'status'];
  const missing = required.filter(f => !record[f]);
  if (missing.length) throw new Error(`Memory record missing fields: ${missing.join(', ')}`);
  if (!Object.values(MEMORY_TYPES).includes(record.type)) {
    throw new Error(`Invalid memory type: ${record.type}`);
  }
  return true;
}

export default { MEMORY_TYPES, createRecord, validateRecord };
