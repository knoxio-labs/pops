import { inventoryCatalogueTypes } from '@/fixtures/inventory-type-catalogue';
import { CatalogueList } from '@/kit/inventory/type-editor/catalogue-list';

import { EditorPanel } from './type-tree-editor-panels';
import { TypeTreeShell } from './type-tree-editor-parts';
import { RulesEditor } from './type-tree-editor-rules';

/** Finished type-editor states required by the inventory type-tree design. */
export type TypeTreeEditorState =
  | 'type-list-tree'
  | 'type-list-search-child'
  | 'create-subtype'
  | 'parent-choices'
  | 'inherited-fields'
  | 'leaf-no-children'
  | 'parent-no-children'
  | 'depth-cap'
  | 'key-shadowed'
  | 'archive-with-children'
  | 'parent-field-added'
  | 'parent-change-refused'
  | 'parent-migration-refused';

type SimpleState =
  | 'create-subtype'
  | 'parent-choices'
  | 'inherited-fields'
  | 'leaf-no-children'
  | 'parent-no-children';

type RuleState =
  | 'depth-cap'
  | 'key-shadowed'
  | 'archive-with-children'
  | 'parent-field-added'
  | 'parent-change-refused'
  | 'parent-migration-refused';

function selectedId(state: RuleState): string {
  if (state === 'archive-with-children') return 'type-pillows';
  if (state === 'parent-field-added' || state === 'parent-migration-refused') return 'type-bedding';
  return 'type-sheet';
}

function SimpleEditor({ state }: { state: SimpleState }) {
  const selected = state === 'inherited-fields' ? 'type-pillowcase' : 'type-pillows';
  const selectedId = state === 'leaf-no-children' ? 'type-mattress-protector' : selected;
  const parentState = state === 'parent-no-children' ? 'type-blanket' : selectedId;
  return (
    <TypeTreeShell selectedId={parentState}>
      <EditorPanel state={state} />
    </TypeTreeShell>
  );
}

function RuleEditor({ state }: { state: RuleState }) {
  return (
    <TypeTreeShell selectedId={selectedId(state)}>
      <RulesEditor state={state} />
    </TypeTreeShell>
  );
}

function EditorState({ state }: { state: TypeTreeEditorState }) {
  if (state === 'type-list-tree' || state === 'type-list-search-child') {
    return (
      <CatalogueList
        types={inventoryCatalogueTypes}
        selectedId="type-bedding"
        searchQuery={state === 'type-list-search-child' ? 'sheet' : ''}
        showArchived
      />
    );
  }
  if (
    state === 'create-subtype' ||
    state === 'parent-choices' ||
    state === 'inherited-fields' ||
    state === 'leaf-no-children' ||
    state === 'parent-no-children'
  ) {
    return <SimpleEditor state={state} />;
  }
  return <RuleEditor state={state} />;
}

/** Renders one finished inventory type-tree editor state. */
export function TypeTreeEditor({ state }: { state: TypeTreeEditorState }) {
  return <EditorState state={state} />;
}
