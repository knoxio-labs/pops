import AppCore
import Testing

@testable import FeatureInventory

@Suite("Inventory prefill draft application")
internal struct InventoryPrefillDraftTests {
    @Test("fills an untouched placeholder")
    func fillsUntouchedPlaceholder() throws {
        let field = InventoryPrefillTestSupport.field(id: "title")
        let type = InventoryPrefillTestSupport.type(fields: [field])
        var draft = InventoryProtocol2Draft(type: type, catalogueRevision: 1)

        draft.fillIfEmpty([.string("Desk lamp")], for: field)

        let entry = try #require(draft.draftEntries(for: field).first)
        #expect(entry.id == "title:prefill:0")
        #expect(entry.input == "Desk lamp")
        #expect(draft.values(for: field) == [.string("Desk lamp")])
        #expect(draft.touched == [field.id])
    }

    @Test("replaces an untouched catalogue default")
    func replacesUntouchedCatalogueDefault() {
        let field = InventoryPrefillTestSupport.field(
            id: "finish", defaultValues: [.string("Catalogue")])
        let type = InventoryPrefillTestSupport.type(fields: [field])
        var draft = InventoryProtocol2Draft(type: type, catalogueRevision: 1)
        draft.prefillDefaults(for: type)

        draft.fillIfEmpty([.string("Black")], for: field)

        #expect(draft.values(for: field) == [.string("Black")])
        #expect(draft.draftEntries(for: field).map(\.id) == ["finish:prefill:0"])
    }

    @Test("does not replace an existing stored value in an edit draft")
    func protectsExistingStoredValue() {
        let field = InventoryPrefillTestSupport.field(id: "title")
        let type = InventoryPrefillTestSupport.type(fields: [field])
        let item = InventoryItem(
            id: "item", revision: 1, seq: 1, catalogueRevision: 1, name: "Desk",
            typeId: type.id, typeKey: type.key,
            fieldValues: [
                InventoryItemFieldEntry(
                    fieldId: field.id, state: .value([.string("Saved")]), source: .stored,
                    catalogueRevision: 1)
            ], placement: .hand, createdAt: FormFixture.epoch, updatedAt: FormFixture.epoch)
        var draft = InventoryProtocol2Draft(type: type, catalogueRevision: 1, item: item)

        draft.fillIfEmpty([.string("Suggested")], for: field)

        #expect(draft.values(for: field) == [.string("Saved")])
        #expect(draft.draftEntries(for: field).map(\.id) == ["title:0"])
        #expect(draft.touched.isEmpty)
    }

    @Test("fills an untouched required false flag")
    func fillsUntouchedRequiredFalseFlag() {
        let field = InventoryPrefillTestSupport.field(
            id: "active", kind: .boolean, required: true)
        let type = InventoryPrefillTestSupport.type(fields: [field])
        var draft = InventoryProtocol2Draft(type: type, catalogueRevision: 1)

        #expect(draft.values(for: field) == [.boolean(false)])
        draft.fillIfEmpty([.boolean(true)], for: field)

        #expect(draft.values(for: field) == [.boolean(true)])
        #expect(draft.touched == [field.id])
    }

    @Test("does not replace typed, invalid, or cleared fields")
    func protectsTouchedFields() throws {
        let typed = InventoryPrefillTestSupport.field(id: "typed")
        let invalid = InventoryPrefillTestSupport.field(id: "invalid", kind: .integer)
        let cleared = InventoryPrefillTestSupport.field(id: "cleared")
        let type = InventoryPrefillTestSupport.type(fields: [typed, invalid, cleared])
        var draft = InventoryProtocol2Draft(type: type, catalogueRevision: 1)
        let typedEntry = try #require(draft.draftEntries(for: typed).first)
        let invalidEntry = try #require(draft.draftEntries(for: invalid).first)
        let clearedEntry = try #require(draft.draftEntries(for: cleared).first)

        draft.setText("typed", entryId: typedEntry.id, for: typed)
        draft.setText("not a number", entryId: invalidEntry.id, for: invalid)
        draft.setText("then clear", entryId: clearedEntry.id, for: cleared)
        draft.setText("", entryId: clearedEntry.id, for: cleared)

        draft.fillIfEmpty([.string("replacement")], for: typed)
        draft.fillIfEmpty([.integer(try InventoryInteger(42))], for: invalid)
        draft.fillIfEmpty([.string("replacement")], for: cleared)

        #expect(draft.values(for: typed) == [.string("typed")])
        #expect(draft.values(for: invalid).isEmpty)
        #expect(draft.values(for: cleared).isEmpty)
        #expect(draft.draftEntries(for: typed).first?.id == typedEntry.id)
        #expect(draft.draftEntries(for: invalid).first?.id == invalidEntry.id)
        #expect(draft.draftEntries(for: cleared).first?.id == clearedEntry.id)
    }

    @Test("skips computed, archived, and empty suggestions")
    func skipsIneligibleFields() {
        let computed = InventoryPrefillTestSupport.field(id: "computed", storage: .computed)
        let archived = InventoryPrefillTestSupport.field(
            id: "archived", archivedAt: "2026-09-01")
        let live = InventoryPrefillTestSupport.field(id: "live")
        let type = InventoryPrefillTestSupport.type(fields: [computed, archived, live])
        var draft = InventoryProtocol2Draft(type: type, catalogueRevision: 1)

        draft.fillIfEmpty([], for: live)
        draft.fillIfEmpty([.string("ignored")], for: computed)
        draft.fillIfEmpty([.string("ignored")], for: archived)

        #expect(draft.values(for: computed).isEmpty)
        #expect(draft.values(for: archived).isEmpty)
        #expect(draft.values(for: live).isEmpty)
        #expect(draft.touched.isEmpty)
    }

    @Test("filling an untouched field is staged work")
    func fillingStagesWork() {
        let field = InventoryPrefillTestSupport.field(id: "field")
        let type = InventoryPrefillTestSupport.type(fields: [field])
        var draft = InventoryProtocol2Draft(type: type, catalogueRevision: 1)

        #expect(!draft.typeSelectionChanged)
        #expect(!draft.hasStagedWork)
        draft.fillIfEmpty([.string("value")], for: field)

        #expect(!draft.typeSelectionChanged)
        #expect(draft.hasStagedWork)
    }
}
