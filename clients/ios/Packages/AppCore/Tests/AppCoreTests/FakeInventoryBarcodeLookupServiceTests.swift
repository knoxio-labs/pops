import AppCore
import AppCoreFakes
import Testing

@Suite("Fake inventory barcode lookup")
internal struct FakeInventoryBarcodeLookupServiceTests {
    @Test("records codes and can change its scripted result")
    func recordsCodesAndChangesResult() async throws {
        let product = InventoryBarcodeProduct(title: "Matilda")
        let service = FakeInventoryBarcodeLookupService(result: .found(product))

        #expect(try await service.lookUp(code: "9780140328721") == .found(product))
        await service.setResult(.notFound)
        #expect(try await service.lookUp(code: "9780140328722") == .notFound)
        #expect(await service.codes == ["9780140328721", "9780140328722"])
    }
}
