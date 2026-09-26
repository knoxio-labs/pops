import AppCore
import Testing

@testable import FeatureInventory

@Suite("Inventory prefill field planning")
internal struct InventoryPrefillFieldPlanTests {
    @Test("untouched defaults and the required false flag are empty")
    func untouchedFieldsAreEmpty() throws {
        let defaultField = InventoryPrefillTestSupport.field(
            id: "default", defaultValues: [.string("catalogue")])
        let flag = InventoryPrefillTestSupport.field(
            id: "flag", kind: .boolean, required: true)
        let type = InventoryPrefillTestSupport.type(fields: [defaultField, flag])
        var draft = InventoryProtocol2Draft(type: type, catalogueRevision: 1)
        draft.prefillDefaults(for: type)

        #expect(draft.values(for: defaultField) == [.string("catalogue")])
        #expect(draft.values(for: flag) == [.boolean(false)])
        #expect(draft.isEmpty(defaultField))
        #expect(draft.isEmpty(flag))
    }

    @Test("typed, half-typed, and cleared fields are not empty")
    func touchedFieldsAreNotEmpty() throws {
        let typed = InventoryPrefillTestSupport.field(id: "typed")
        let halfTyped = InventoryPrefillTestSupport.field(id: "half", kind: .integer)
        let type = InventoryPrefillTestSupport.type(fields: [typed, halfTyped])
        var draft = InventoryProtocol2Draft(type: type, catalogueRevision: 1)
        let typedEntry = try #require(draft.draftEntries(for: typed).first)
        let halfTypedEntry = try #require(draft.draftEntries(for: halfTyped).first)

        draft.setText("typed", entryId: typedEntry.id, for: typed)
        draft.setText("not a number", entryId: halfTypedEntry.id, for: halfTyped)
        #expect(!draft.isEmpty(typed))
        #expect(!draft.isEmpty(halfTyped))

        draft.setText("", entryId: halfTypedEntry.id, for: halfTyped)
        #expect(!draft.isEmpty(halfTyped))
    }

    @Test("only live stored untouched fields with usable schemas are fillable")
    func fillableFields() throws {
        let computed = InventoryPrefillTestSupport.field(
            id: "computed", storage: .computed)
        let reference = InventoryPrefillTestSupport.field(
            id: "reference", kind: .reference)
        let archived = InventoryPrefillTestSupport.field(
            id: "archived", archivedAt: "2026-09-01")
        let touched = InventoryPrefillTestSupport.field(id: "touched")
        let emptyEnum = InventoryPrefillTestSupport.field(id: "empty-enum", kind: .enumeration)
        let emptyMeasurement = InventoryPrefillTestSupport.field(
            id: "empty-measurement", kind: .measurement)
        let valid = InventoryPrefillTestSupport.field(id: "valid", sortOrder: 10)
        let fields = [computed, reference, archived, touched, emptyEnum, emptyMeasurement, valid]
        let type = InventoryPrefillTestSupport.type(fields: fields)
        var draft = InventoryProtocol2Draft(type: type, catalogueRevision: 1)
        let entry = try #require(draft.draftEntries(for: touched).first)
        draft.setText("already entered", entryId: entry.id, for: touched)

        #expect(
            InventoryPrefillFieldPlan.fillable(fields: fields, draft: draft).map(\.id)
                == ["valid"])
    }

    @Test("forty fields are chunked in sort order under the available budget")
    func chunksManyFields() async {
        let fields = (0..<40).map { index in
            InventoryPrefillTestSupport.field(
                id: "field-\(index)", label: "field-\(index)", sortOrder: index)
        }
        let draft = InventoryPrefillTestSupport.draft(fields: fields)

        let chunks = await InventoryPrefillFieldPlan.make(
            fields: fields, draft: draft, budget: 14, factsCost: 2
        ) { _ in 3 }

        #expect(chunks.count == 10)
        #expect(chunks.allSatisfy { $0.count == 4 })
        #expect(chunks.flatMap { $0 }.map { $0.id } == fields.map { $0.id })
    }

    @Test("a field too large to fit alone is skipped")
    func skipsOversizedFields() async {
        let oversized = InventoryPrefillTestSupport.field(id: "oversized", sortOrder: 0)
        let fitting = InventoryPrefillTestSupport.field(id: "fitting", sortOrder: 1)
        let fields = [oversized, fitting]
        let draft = InventoryPrefillTestSupport.draft(fields: fields)

        let chunks = await InventoryPrefillFieldPlan.make(
            fields: fields, draft: draft, budget: 5, factsCost: 0
        ) { field in
            field.id == "oversized" ? 6 : 3
        }

        #expect(chunks.map { $0.map(\.id) } == [["fitting"]])
    }

    @Test("no fillable fields produce no chunks")
    func noFillableFieldsProduceNoChunks() async {
        let field = InventoryPrefillTestSupport.field(
            id: "computed", storage: .computed)
        let draft = InventoryPrefillTestSupport.draft(fields: [field])

        let chunks = await InventoryPrefillFieldPlan.make(
            fields: [field], draft: draft, budget: 10, factsCost: 0
        ) { _ in 1 }

        #expect(chunks.isEmpty)
    }
}
