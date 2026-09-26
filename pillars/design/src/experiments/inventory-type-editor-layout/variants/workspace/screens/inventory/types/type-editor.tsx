import { TypeEditor, createTypeEditorStates, meta } from '@/screens/inventory/types/type-editor';

export { meta };

export const states = createTypeEditorStates('workspace');

export default function WorkspaceTypeEditorVariant() {
  return <TypeEditor layout="workspace" />;
}
