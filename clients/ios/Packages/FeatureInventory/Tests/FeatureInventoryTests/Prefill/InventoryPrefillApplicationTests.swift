import AppCore
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Inventory prefill form application")
internal struct InventoryPrefillApplicationTests {
    private static let field = InventoryPrefillTestSupport.field(id: "title")
    private static let type = InventoryCatalogueType(
        id: "type", key: "type", label: "Type", sortOrder: 0, fields: [field])
    private static let otherType = InventoryCatalogueType(
        id: "other", key: "other", label: "Other", sortOrder: 1)
    private static let catalogue = InventoryCatalogueSnapshot(
        revision: InventoryCatalogueRevision(revision: 1, minimumProtocol: 2),
        types: [type, otherType])

    private struct Opened {
        let form: InventoryItemFormModel
        let loading: Task<Void, Never>
    }

    private static func opened() async -> Opened {
        let store = RecordingFormStore(
            FormFixtureSource(
                protocol2Catalogue: catalogue, status: .offline(lastRefreshAt: nil)))
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        form.selectProtocol2Type(type.id)
        return Opened(form: form, loading: loading)
    }

    @Test("a stale type does not apply suggestions or status")
    func staleTypeDoesNothing() async {
        let opened = await Self.opened()
        defer { opened.loading.cancel() }
        opened.form.prefillStatus = .running

        opened.form.applySuggestions([Self.field.id: [.string("ignored")]], forTypeId: "other")

        #expect(opened.form.prefillStatus == .running)
        #expect(opened.form.protocol2Draft?.values(for: Self.field).isEmpty == true)
    }

    @Test("a field touched before apply is not overwritten")
    func touchedFieldIsProtectedAtApplyTime() async throws {
        let opened = await Self.opened()
        defer { opened.loading.cancel() }
        let entry = try #require(opened.form.protocol2Draft?.draftEntries(for: Self.field).first)
        opened.form.protocol2Draft?.setText("typed", entryId: entry.id, for: Self.field)
        opened.form.prefillStatus = .running

        opened.form.applySuggestions(
            [Self.field.id: [.string("suggested")]], forTypeId: Self.type.id
        )

        #expect(opened.form.protocol2Draft?.values(for: Self.field) == [.string("typed")])
        #expect(opened.form.prefillStatus == .nothingFound)
    }

    @Test("no filled fields reports nothing found")
    func noFieldsFilled() async {
        let opened = await Self.opened()
        defer { opened.loading.cancel() }

        opened.form.applySuggestions([Self.field.id: []], forTypeId: Self.type.id)

        #expect(opened.form.prefillStatus == .nothingFound)
    }

    @Test("filled fields clear the final status")
    func filledFieldsClearStatus() async {
        let opened = await Self.opened()
        defer { opened.loading.cancel() }
        opened.form.prefillStatus = .running

        opened.form.applySuggestions(
            [Self.field.id: [.string("suggested")]], forTypeId: Self.type.id)

        #expect(opened.form.protocol2Draft?.values(for: Self.field) == [.string("suggested")])
        #expect(opened.form.prefillStatus == nil)
    }

    @Test("protocol field edits and type changes clear status, name edits do not")
    func statusOwnership() async throws {
        let opened = await Self.opened()
        defer { opened.loading.cancel() }
        let entry = try #require(opened.form.protocol2Draft?.draftEntries(for: Self.field).first)

        opened.form.prefillStatus = .nothingFound
        opened.form.draft.name = "Lamp"
        #expect(opened.form.prefillStatus == .nothingFound)

        opened.form.protocol2Draft?.setText("typed", entryId: entry.id, for: Self.field)
        #expect(opened.form.prefillStatus == nil)

        opened.form.prefillStatus = .nothingFound
        opened.form.selectProtocol2Type(Self.otherType.id)
        #expect(opened.form.prefillStatus == nil)
    }

    @Test("status messages are the scan outcome copy")
    func statusMessages() {
        #expect(InventoryPrefillStatus.running.message == "Filling fields…")
        #expect(
            InventoryPrefillStatus.nothingFound.message
                == "Nothing on it matched this type's fields")
        #expect(
            InventoryPrefillStatus.productNotFound.message == "No product found for this barcode")
        #expect(
            InventoryPrefillStatus.lookupUnavailable.message == "Couldn't look up this barcode")
        #expect(InventoryPrefillStatus.noText.message == "No text recognised")
        #expect(
            InventoryPrefillStatus.scannerUnavailable.message
                == "Scanning isn't available on this device")
        #expect(
            InventoryPrefillStatus.cameraDenied.message == "Camera access is off for Pops")
    }
}
