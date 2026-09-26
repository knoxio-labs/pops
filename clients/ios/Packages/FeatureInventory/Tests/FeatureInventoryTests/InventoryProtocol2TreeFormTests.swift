import AppCore
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Protocol 2 item form type trees")
internal struct InventoryProtocol2TreeFormTests {
    private typealias Fixture = InventoryProtocol2TreeFixture

    @Test("a new sheet form lists inherited fields with an empty Size entry")
    func newSheetUsesEffectiveFields() async throws {
        let store = RecordingFormStore(FormFixtureSource(protocol2Catalogue: Fixture.catalogue()))
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        form.selectProtocol2Type(Fixture.sheetTypeId)

        let type = try #require(form.protocol2Type)
        let size = try #require(type.fields.first { $0.id == Fixture.size.id })
        #expect(type.fields.map(\.id) == [Fixture.size.id, Fixture.fitted.id])
        #expect(form.protocol2Draft?.draftEntries(for: size).count == 1)
        #expect(form.protocol2Draft?.values(for: size).isEmpty == true)
    }

    @Test("a required inherited Size field is reported on a new sheet")
    func inheritedRequiredFieldIsValidated() async throws {
        let store = RecordingFormStore(FormFixtureSource(protocol2Catalogue: Fixture.catalogue()))
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        form.selectProtocol2Type(Fixture.sheetTypeId)

        #expect(form.protocol2Issues.map(\.fieldId) == [Fixture.size.id])
        #expect(form.protocol2Issues.first?.message == "Size is required.")
    }

    @Test("changing from sheet to quilt cover keeps Size and drops Fitted")
    func typeChangeKeepsOnlyCommonFields() async throws {
        let store = RecordingFormStore(FormFixtureSource(protocol2Catalogue: Fixture.catalogue()))
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        form.selectProtocol2Type(Fixture.sheetTypeId)
        let sizeEntry = try #require(form.protocol2Draft?.draftEntries(for: Fixture.size).first)
        let fittedEntry = try #require(form.protocol2Draft?.draftEntries(for: Fixture.fitted).first)
        form.protocol2Draft?.setText("Queen", entryId: sizeEntry.id, for: Fixture.size)
        form.protocol2Draft?.setText("Yes", entryId: fittedEntry.id, for: Fixture.fitted)

        form.selectProtocol2Type(Fixture.quiltCoverTypeId)

        #expect(form.protocol2Type?.fields.map(\.id) == [Fixture.size.id, Fixture.closure.id])
        #expect(form.protocol2Draft?.values(for: Fixture.size) == [.string("Queen")])
        #expect(form.protocol2Draft?.draftEntries(for: Fixture.fitted).isEmpty == true)
    }

    @Test("a type change command includes the retained inherited Size value")
    func typeChangeSubmitsInheritedValue() async throws {
        let item = InventoryItem(
            id: "sheet-item", revision: 1, seq: 1, catalogueRevision: 7, name: "Sheet",
            typeId: Fixture.sheetTypeId, typeKey: nil, placement: .hand,
            createdAt: FormFixture.epoch, updatedAt: FormFixture.epoch)
        let store = RecordingFormStore(
            FormFixtureSource(items: [item], protocol2Catalogue: Fixture.catalogue()))
        let form = InventoryItemFormModel(
            request: .edit(item.id), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        let sizeEntry = try #require(form.protocol2Draft?.draftEntries(for: Fixture.size).first)
        form.protocol2Draft?.setText("Queen", entryId: sizeEntry.id, for: Fixture.size)
        form.selectProtocol2Type(Fixture.quiltCoverTypeId)

        guard case .changeProtocol2ItemType(_, _, let typeId, let values)? = form.commands.first
        else {
            Issue.record("expected a protocol-2 type change")
            return
        }
        #expect(typeId == Fixture.quiltCoverTypeId)
        #expect(values.first { $0.fieldId == Fixture.size.id }?.values == [.string("Queen")])
        #expect(values.contains { $0.fieldId == Fixture.size.id })
    }
}
