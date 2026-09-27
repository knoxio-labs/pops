import AppCore
import HTTPTypes
import Testing

@testable import BFMClient

@Suite("BFMInventoryTransport barcode optional fields")
internal struct InventoryBarcodeOptionalFieldsTests {
    @Test("a production required-only found response decodes")
    func requiredOnlyFoundProductDecodes() async throws {
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport(
                status: .ok,
                json: """
                    {
                      "outcome":"found",
                      "product":{
                        "attributes":{},
                        "code":"9780140328721",
                        "contributors":[{"name":"Roald Dahl"}],
                        "fetchedAt":"2026-09-27T00:00:00.000Z",
                        "imageUrls":[],
                        "kind":"book",
                        "source":"open_library",
                        "subjects":[],
                        "title":"Matilda"
                      }
                    }
                    """))

        #expect(
            try await transport.lookUp(code: "9780140328721")
                == .found(
                    InventoryBarcodeProduct(
                        title: "Matilda",
                        contributors: [InventoryBarcodeContributor(name: "Roald Dahl")])))
    }

    @Test("a found product accepts omitted optional fields and a null contributor role")
    func foundProductAcceptsOmittedOptionalFieldsAndNullRole() async throws {
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport(
                status: .ok,
                json: """
                    {
                      "outcome":"found",
                      "product":{
                        "attributes":{},
                        "code":"9780140328721",
                        "contributors":[{"name":"Roald Dahl","role":null}],
                        "fetchedAt":"2026-09-27T00:00:00.000Z",
                        "imageUrls":[],
                        "kind":"book",
                        "source":"open_library",
                        "subjects":[],
                        "title":"Matilda"
                      }
                    }
                    """))

        #expect(
            try await transport.lookUp(code: "9780140328721")
                == .found(
                    InventoryBarcodeProduct(
                        title: "Matilda",
                        contributors: [InventoryBarcodeContributor(name: "Roald Dahl")])))
    }
}
