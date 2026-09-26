import AppCore
import Testing

@testable import FeatureInventory

@Suite("Inventory ISBN identifiers")
internal struct InventoryISBNTests {
    @Test("an ISBN-10 becomes a canonical ISBN-13")
    func normalisesISBN10() {
        #expect(InventoryISBN.normalised("857542161-1") == "9788575421611")
        #expect(InventoryISBN.normalised("080442957X") == "9780804429573")
    }

    @Test("a formatted ISBN-13 is stripped and retained")
    func normalisesISBN13() {
        #expect(InventoryISBN.normalised("978-0-330-42330-4") == "9780330423304")
        #expect(InventoryISBN.normalised("978 0 330 42330 4") == "9780330423304")
    }

    @Test(
        "an ISBN with invalid structure, prefix, or check digit is rejected",
        arguments: [
            "857542161-2", "978-0-330-42330-5", "9770330423304", "978033042330A", "978033042330",
        ])
    func rejectsInvalidISBN(raw: String) {
        #expect(InventoryISBN.normalised(raw) == nil)
    }

    @Test("identifier labels special-case ISBN and preserve unknown kinds")
    func labelsIdentifierKinds() {
        #expect(InventoryIdentifierDraft.Kind.isbn.label == "ISBN")
        #expect(InventoryIdentifierDraft.Kind.serial.label == "Serial")
        #expect(InventoryIdentifierKindLabel.label(for: "isbn") == "ISBN")
        #expect(InventoryIdentifierKindLabel.label(for: "serial") == "Serial")
        #expect(InventoryIdentifierKindLabel.label(for: "unknown") == "unknown")

        let draft = InventoryIdentifierDraft(kind: .isbn, value: "9780330423304")
        #expect(draft.label == InventoryIdentifierKindLabel.label(for: draft.kind))
    }

    @Test("ISBN storage normalises valid values and drops invalid values")
    func storesCanonicalISBN() {
        let valid = InventoryIdentifierDraft(kind: .isbn, value: "978-0-330-42330-4")
        let invalid = InventoryIdentifierDraft(kind: .isbn, value: "978-0-330-42330-5")
        let serial = InventoryIdentifierDraft(kind: .serial, value: " S-1 ")

        #expect(
            valid.stored == InventoryExternalIdentifier(kind: "isbn", value: "9780330423304"))
        #expect(invalid.stored == nil)
        #expect(serial.stored == InventoryExternalIdentifier(kind: "serial", value: "S-1"))
    }
}

@MainActor
@Suite("Inventory ISBN form submission")
internal struct InventoryISBNFormTests {
    @Test("an invalid ISBN reports a blocking issue with the ISBN label")
    func invalidISBNIsAnIssue() {
        var draft = InventoryItemDraft(id: "new-1")
        draft.name = "Book"
        draft.identifiers = [InventoryIdentifierDraft(kind: .isbn, value: "9780330423305")]

        let issues = InventoryItemFormSubmission.issues(
            for: draft, catalogue: FormFixture.catalogue)
        #expect(issues == [.identifierInvalid(label: "ISBN")])
        #expect(issues.first?.message == "ISBN is not valid")
    }

    @Test("an invalid ISBN blocks submit and a valid ISBN is canonical in the command")
    func submitsOnlyCanonicalISBN() async {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound,
            mintId: { "new-1" })
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.name = "Book"
        form.draft.identifiers = [InventoryIdentifierDraft(kind: .isbn, value: "9780330423305")]

        #expect(await form.submit() == false)
        #expect(store.performed.isEmpty)

        form.draft.identifiers = [
            InventoryIdentifierDraft(kind: .isbn, value: "978-0-330-42330-4")
        ]
        #expect(await form.submit())
        guard case .createItem(let item) = store.performed.first else {
            Issue.record("expected a create command, got \(store.performed)")
            return
        }
        #expect(
            item.externalIds == [
                InventoryExternalIdentifier(kind: "isbn", value: "9780330423304")
            ])
    }
}
