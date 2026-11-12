import { describe, expect, it } from 'vitest';

const { allTools } = await import('./index.js');

const byName = new Map(allTools.map((tool) => [tool.name, tool]));

const expectedWrites = [
  'bfm.devicePairing.issueCode',
  'inventory.catalogue.createDraft',
  'inventory.catalogue.patchDraft',
  'inventory.catalogue.publishDraft',
  'inventory.catalogue.abandonDraft',
  'inventory.connections.connect',
  'inventory.connections.disconnect',
  'inventory.fixtures.create',
  'inventory.fixtures.update',
  'inventory.fixtures.delete',
  'inventory.fixtures.connect',
  'inventory.fixtures.disconnect',
  'inventory.items.create',
  'inventory.items.update',
  'inventory.items.changeType',
  'inventory.items.setOverride',
  'inventory.items.clearOverride',
  'inventory.items.setQuantity',
  'inventory.items.delete',
  'inventory.items.move',
  'inventory.items.store',
  'inventory.items.pickUp',
  'inventory.items.open',
  'inventory.items.close',
  'inventory.items.setFull',
  'inventory.items.discard',
  'inventory.items.restore',
  'inventory.items.attachPhoto',
  'inventory.items.removePhoto',
  'inventory.photos.createUpload',
  'inventory.locations.create',
  'inventory.locations.update',
  'inventory.locations.delete',
  'inventory.parts.add',
  'inventory.parts.remove',
  'inventory.documents.createUpload',
  'inventory.documents.link',
  'inventory.documents.update',
  'inventory.documents.unlink',
  'inventory.documents.dismissFailed',
  'documents.delete',
  'documents.createUpload',
  'media.watchlist.add',
  'purchases.inventoryProposals.accept',
  'tags.assignments.attach',
  'tags.assignments.detach',
  'tags.tags.create',
  'tags.tags.update',
  'tags.tags.archive',
  'tags.tags.merge',
  'trips.captures.attach',
  'trips.captures.create',
  'trips.captures.organise',
  'trips.captures.remove',
  'trips.captures.removeAssociation',
  'trips.captures.undo',
  'trips.captures.update',
  'trips.decisionOptions.create',
  'trips.decisionOptions.delete',
  'trips.decisionOptions.restore',
  'trips.decisionOptions.update',
  'trips.decisions.create',
  'trips.decisions.delete',
  'trips.decisions.select',
  'trips.decisions.update',
  'trips.documentAssociations.create',
  'trips.documentAssociations.delete',
  'trips.events.create',
  'trips.events.delete',
  'trips.events.update',
  'trips.explore.add',
  'trips.explore.remove',
  'trips.explore.undo',
  'trips.ideas.create',
  'trips.ideas.remove',
  'trips.ideas.undo',
  'trips.ideas.update',
  'trips.journeyGroups.addBlank',
  'trips.journeyGroups.create',
  'trips.journeyGroups.delete',
  'trips.journeyGroups.select',
  'trips.journeyLegs.create',
  'trips.journeyLegs.delete',
  'trips.journeyLegs.remove',
  'trips.journeyLegs.reorder',
  'trips.journeyLegs.restore',
  'trips.journeyLegs.update',
  'trips.journeys.create',
  'trips.journeys.delete',
  'trips.journeys.update',
  'trips.meetingPlans.operate',
  'trips.places.create',
  'trips.places.update',
  'trips.rentals.create',
  'trips.rentals.delete',
  'trips.rentals.update',
  'trips.responsibilities.replace',
  'trips.route.operate',
  'trips.stays.create',
  'trips.stays.delete',
  'trips.stays.update',
  'trips.trips.create',
  'trips.trips.createOperation',
  'trips.trips.update',
  'trips.visits.create',
  'trips.visits.reorder',
  'trips.visits.update',
];

describe('ToolDef.readOnly', () => {
  it('is set explicitly on every tool', () => {
    const unset = allTools
      .filter((tool) => typeof tool.readOnly !== 'boolean')
      .map((tool) => tool.name);
    expect(unset).toEqual([]);
  });

  it('flags exactly the declared writes as not read-only', () => {
    const writes = allTools
      .filter((tool) => tool.readOnly === false)
      .map((tool) => tool.name)
      .toSorted();
    expect(writes).toEqual(expectedWrites.toSorted());
  });

  it('marks the pairing-code tool as a write', () => {
    expect(byName.get('bfm.devicePairing.issueCode')?.readOnly).toBe(false);
  });

  it('marks media.watchlist.add as a write', () => {
    expect(byName.get('media.watchlist.add')?.readOnly).toBe(false);
  });

  it.each([
    'finance.transactions.list',
    'finance.accounts.get',
    'media.library.list',
    'cerebrum.search',
    'purchases.search',
    'purchases.inventoryProposals.list',
    'tags.tags.list',
    'tags.tags.get',
    'tags.things.list',
  ])('marks %s as read-only', (name) => {
    expect(byName.get(name)?.readOnly).toBe(true);
  });
});
