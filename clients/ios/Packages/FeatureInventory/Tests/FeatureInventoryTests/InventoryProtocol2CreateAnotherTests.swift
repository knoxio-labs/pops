import AppCore
import Foundation
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Protocol 2 item form: create another")
internal struct InventoryProtocol2CreateAnotherTests {
    private struct Fixture {
        let field: InventoryCatalogueField
        let type: InventoryCatalogueType
        let alternateType: InventoryCatalogueType
        let store: RecordingFormStore
    }

    private func makeFixture() -> Fixture {
        let field = InventoryCatalogueField(
            id: "field-id", typeId: "type-id", key: "connector", label: "Connector",
            sortOrder: 0, kind: .shortText, cardinality: .one, required: false, storage: .stored)
        let type = InventoryCatalogueType(
            id: "type-id", key: "cable", label: "Cable", sortOrder: 0, fields: [field])
        let alternateType = InventoryCatalogueType(
            id: "alternate-type", key: "cushion", label: "Cushion", sortOrder: 1)
        let catalogue = InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: 9, minimumProtocol: 2),
            types: [type, alternateType])
        let store = RecordingFormStore(
            FormFixtureSource(
                protocol2Catalogue: catalogue, status: .offline(lastRefreshAt: nil)))
        return Fixture(field: field, type: type, alternateType: alternateType, store: store)
    }

    @Test("create another keeps a protocol-2 type and placement but clears its fields")
    func offlineCreateAnother() async throws {
        let setup = makeFixture()
        var nextID = 0
        let form = InventoryItemFormModel(
            request: .create(placement: .location("garage")), store: setup.store,
            suggester: .unbound,
            mintId: {
                nextID += 1
                return "new-\(nextID)"
            })
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.name = "Cable"
        form.selectProtocol2Type(setup.type.id)
        let entry = try #require(form.protocol2Draft?.draftEntries(for: setup.field).first)
        form.protocol2Draft?.setText("USB-C", entryId: entry.id, for: setup.field)
        let firstID = form.draft.id

        #expect(await form.submitAndPrepareForAnother())

        #expect(form.draft.id != firstID)
        #expect(form.draft.name.isEmpty)
        #expect(form.draft.placement == .location("garage"))
        #expect(form.protocol2Draft?.typeId == setup.type.id)
        #expect(form.protocol2Draft?.values(for: setup.field).isEmpty == true)
        #expect(form.protocol2Draft?.typeSelectionChanged == true)

        form.draft.name = "Second cable"
        #expect(await form.submit())
        guard case .createProtocol2Item(let second)? = setup.store.performed.last else {
            Issue.record("expected the second protocol-2 create")
            return
        }
        #expect(second.id != firstID)
        #expect(second.typeId == setup.type.id)
        #expect(second.placement == .location("garage"))
        #expect(second.values.isEmpty)
    }

    @Test("the cushion-cover to cushion flow keeps photos attached to each created item")
    func cushionCoverThenCushionKeepsPhotos() async throws {
        let setup = makeFixture()
        InventoryTypeRecents.removeAll()
        defer { InventoryTypeRecents.removeAll() }
        let form = InventoryItemFormModel(
            request: .create(placement: .location("garage")), store: setup.store,
            suggester: .unbound, mintId: { UUID().uuidString })
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        form.draft.name = "Cushion cover"
        form.selectProtocol2Type(setup.type.id)
        let coverPhoto = Data("cover photo".utf8)
        await form.photoCaptured(coverPhoto)
        let coverHash = InventoryPhotoHashing.sha256(of: coverPhoto)

        #expect(await form.submitAndPrepareForAnother())
        #expect(form.draft.photos.isEmpty)
        #expect(form.protocol2Draft?.typeId == setup.type.id)

        form.selectProtocol2Type(setup.alternateType.id)
        #expect(form.protocol2Draft?.typeId == setup.alternateType.id)
        form.draft.name = "Cushion"
        let cushionPhoto = Data("cushion photo".utf8)
        await form.photoCaptured(cushionPhoto)
        let cushionHash = InventoryPhotoHashing.sha256(of: cushionPhoto)

        #expect(await form.submit())
        let createdTypes = setup.store.performed.compactMap { command -> String? in
            guard case .createProtocol2Item(let item) = command else { return nil }
            return item.typeId
        }
        let attachedHashes = setup.store.performed.compactMap { command -> String? in
            guard case .attachPhoto(_, let hash, _) = command else { return nil }
            return hash
        }
        #expect(createdTypes == [setup.type.id, setup.alternateType.id])
        #expect(attachedHashes == [coverHash, cushionHash])
    }
}
