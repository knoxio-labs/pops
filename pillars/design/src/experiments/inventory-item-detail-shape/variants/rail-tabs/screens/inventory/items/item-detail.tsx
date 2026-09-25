import {
  createItemDetailStates,
  itemDetailDefault,
  meta,
} from '@/screens/inventory/items/item-detail';

export { meta };

export const states = createItemDetailStates('rail-tabs');

const Default = itemDetailDefault('rail-tabs');

export default function RailTabsItemDetailVariant() {
  return <Default />;
}
