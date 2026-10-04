import { PERSISTED_CATALOGUE_PROTOCOL, TYPE_TREE_PROTOCOL } from '../protocol/rollout.js';

export function requiredVocabularyProtocol(code: string): number | undefined {
  switch (code) {
    case 'primitive_kind_added':
      return PERSISTED_CATALOGUE_PROTOCOL;
    case 'type_parent_set':
      return TYPE_TREE_PROTOCOL;
    default:
      return undefined;
  }
}
