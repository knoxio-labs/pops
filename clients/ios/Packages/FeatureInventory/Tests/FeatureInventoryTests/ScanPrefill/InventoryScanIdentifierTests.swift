import AppCore
import Testing

@testable import FeatureInventory

internal struct ScannedIdentifierCase: Sendable, CustomTestStringConvertible {
    let payload: String
    let kind: String

    var testDescription: String { payload }
}

@MainActor
@Suite("Inventory scan identifiers and product facts")
internal struct InventoryScanIdentifierTests {
    @Test(
        "only checksum-valid book codes become ISBN identifiers",
        arguments: [
            ScannedIdentifierCase(payload: "9780330423304", kind: "isbn"),
            ScannedIdentifierCase(payload: "9791234567896", kind: "isbn"),
            ScannedIdentifierCase(payload: "9780330423305", kind: "barcode"),
            ScannedIdentifierCase(payload: "978-0-330-42330-4", kind: "barcode"),
            ScannedIdentifierCase(payload: "080442957X", kind: "barcode"),
            ScannedIdentifierCase(payload: "5012345678900", kind: "barcode"),
            ScannedIdentifierCase(payload: "12345670", kind: "barcode"),
        ])
    func identifierClassification(input: ScannedIdentifierCase) async throws {
        let opened = await ScanPrefillFixture.open()
        defer { opened.loading.cancel() }

        #expect(await opened.form.handleScannedBarcode(input.payload) == .found)
        await opened.form.fillTask?.value

        let identifier = try #require(opened.form.draft.identifiers.first)
        #expect(identifier.kind == input.kind)
        #expect(identifier.value == input.payload)
    }

    @Test("scanning the same identifier twice keeps one draft entry")
    func duplicateIsStoredOnce() async {
        let opened = await ScanPrefillFixture.open()
        defer { opened.loading.cancel() }

        _ = await opened.form.handleScannedBarcode("5012345678900")
        _ = await opened.form.handleScannedBarcode("5012345678900")
        await opened.form.fillTask?.value

        #expect(opened.form.draft.identifiers.count == 1)
        #expect(opened.form.draft.identifiers.first?.kind == "barcode")
    }

    @Test("equal values with different identifier kinds remain distinct")
    func differentKindsRemainDistinct() async {
        let opened = await ScanPrefillFixture.open()
        defer { opened.loading.cancel() }
        opened.form.draft.identifiers = [.init(kind: .barcode, value: "9780330423304")]

        _ = await opened.form.handleScannedBarcode("9780330423304")
        _ = await opened.form.handleScannedBarcode("9780330423304")
        await opened.form.fillTask?.value

        #expect(opened.form.draft.identifiers.map(\.kind) == ["barcode", "isbn"])
    }

    @Test("empty product properties do not become facts")
    func emptyFacts() {
        let product = InventoryBarcodeProduct(
            title: " \n ", subtitle: "", contributors: [.init(name: " ", role: "Author")],
            subjects: [""], attributes: ["Empty": " ", " ": "Ignored"])
        #expect(InventoryBarcodeFacts.facts(product).isEmpty)
        #expect(
            InventoryBarcodeFacts.facts(
                InventoryBarcodeProduct(title: "", contributors: [.init(name: "Name", role: " ")]))
                == [InventoryPrefillFact(label: "Contributors", value: "Name")])
    }

    @Test("product facts are trimmed, complete, and deterministically ordered")
    func productFacts() {
        #expect(
            InventoryBarcodeFacts.facts(ScanPrefillFixture.product) == [
                InventoryPrefillFact(
                    label: "Title", value: "The Hitchhiker's Guide to the Galaxy"),
                InventoryPrefillFact(label: "Subtitle", value: "A Trilogy in Five Parts"),
                InventoryPrefillFact(
                    label: "Contributors", value: "Douglas Adams (Author)"),
                InventoryPrefillFact(label: "Publisher", value: "Pan Books"),
                InventoryPrefillFact(label: "Published", value: "1979"),
                InventoryPrefillFact(label: "Pages", value: "224"),
                InventoryPrefillFact(label: "Language", value: "en"),
                InventoryPrefillFact(label: "Description", value: "Space comedy"),
                InventoryPrefillFact(label: "Subjects", value: "Fiction, Comedy"),
                InventoryPrefillFact(label: "Format", value: "Paperback"),
            ])
    }

    @Test("the generator receives product facts without the scanned identifier")
    func generatedFactsExcludeIdentifier() async throws {
        let generator = ScanPrefillGenerator()
        let opened = await ScanPrefillFixture.open(generator: generator)
        defer { opened.loading.cancel() }

        _ = await opened.form.handleScannedBarcode("9780330423304")
        await opened.form.fillTask?.value

        let request = try #require(await generator.requests.first)
        #expect(request.source == .product(InventoryBarcodeFacts.facts(ScanPrefillFixture.product)))
        #expect(!request.source.renderedFacts.contains("9780330423304"))
    }
}
