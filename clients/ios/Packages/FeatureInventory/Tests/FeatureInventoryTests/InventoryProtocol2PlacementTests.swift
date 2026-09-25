import AppCore
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Protocol 2 items keep the core placement and quantity flows")
internal struct InventoryProtocol2PlacementTests {
    private static let field = InventoryCatalogueField(
        id: "colour", typeId: "gadget", key: "colour", label: "Colour", sortOrder: 0,
        kind: .shortText, cardinality: .one, required: false, storage: .stored)
    private static let type = InventoryCatalogueType(
        id: "gadget", key: "gadget", label: "Gadget", sortOrder: 0, fields: [field])
    private static let catalogue = InventoryCatalogueSnapshot(
        revision: InventoryCatalogueRevision(revision: 4, minimumProtocol: 2), types: [type])

    @Test("a new item opened from a place is created there, with its quantity")
    func createCarriesPlacement() async throws {
        let store = RecordingFormStore(FormFixtureSource(protocol2Catalogue: Self.catalogue))
        let form = InventoryItemFormModel(
            request: .create(placement: .location("garage")), store: store,
            suggester: .unbound, mintId: { "new-gadget" })
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.name = "Gadget"
        form.draft.quantity = 3

        #expect(await form.submit())
        guard case .createProtocol2Item(let item)? = store.performed.first else {
            Issue.record("expected a protocol-2 create, got \(store.performed)")
            return
        }
        #expect(item.placement == .location("garage"))
        #expect(item.quantity == 3)
    }

    @Test("moving a protocol-2 item in Edit item queues the move beside the value edit")
    func editMovesItem() async throws {
        let item = InventoryItem(
            id: "gadget-1", revision: 2, seq: 2, catalogueRevision: 4, name: "Gadget",
            typeId: Self.type.id, typeKey: "gadget", fieldValues: [],
            placement: .hand, createdAt: FormFixture.epoch, updatedAt: FormFixture.epoch)
        let store = RecordingFormStore(
            FormFixtureSource(items: [item], protocol2Catalogue: Self.catalogue))
        let form = InventoryItemFormModel(
            request: .edit(item.id), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        let entry = try #require(form.protocol2Draft?.draftEntries(for: Self.field).first)
        form.protocol2Draft?.setText("Blue", entryId: entry.id, for: Self.field)
        form.draft.placement = .container("box-9")

        #expect(await form.submit())
        #expect(
            store.performed.contains { command in
                guard case .editProtocol2Item(let id, _, _) = command else { return false }
                return id == "gadget-1"
            })
        #expect(
            store.performed.contains(
                .moveItem(id: "gadget-1", to: .container("box-9"), verb: .move)))
    }

    @Test("an unmoved protocol-2 item queues no move")
    func unmovedItemQueuesNoMove() async throws {
        let item = InventoryItem(
            id: "gadget-2", revision: 2, seq: 2, catalogueRevision: 4, name: "Gadget",
            typeId: Self.type.id, typeKey: "gadget", fieldValues: [],
            placement: .location("garage"), createdAt: FormFixture.epoch,
            updatedAt: FormFixture.epoch)
        let store = RecordingFormStore(
            FormFixtureSource(items: [item], protocol2Catalogue: Self.catalogue))
        let form = InventoryItemFormModel(
            request: .edit(item.id), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.name = "Renamed gadget"

        #expect(await form.submit())
        #expect(
            !store.performed.contains { command in
                if case .moveItem = command { return true }
                return false
            })
    }
}
