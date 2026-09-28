import AppCore
import Testing

@testable import BFMClient

@Suite("Protocol 2 catalogue parent mapping")
internal struct InventoryProtocol2CatalogueMappingTests {
    private static func fetch(_ catalogue: String) async throws -> InventoryCatalogueSnapshot {
        try await BFMInventoryTransport.stubbed(
            StubTransport(status: .ok, json: catalogue)
        ).fetchCatalogue(revision: 2)
    }

    private static func twoTypeCatalogue(
        firstParentTypeId: String? = nil,
        secondParentTypeId: String? = Protocol2Wire.bulbType
    ) -> String {
        Protocol2Wire.catalogueWithTypes(
            revision: 2,
            types: [
                Protocol2Wire.type(
                    id: Protocol2Wire.bulbType, key: "bulb", label: "Bulb",
                    parentTypeId: firstParentTypeId),
                Protocol2Wire.type(
                    id: Protocol2Wire.lampType, key: "lamp", label: "Lamp", sortOrder: 1,
                    parentTypeId: secondParentTypeId),
            ])
    }

    @Test("a parent maps onto the catalogue type")
    func parentMaps() async throws {
        let snapshot = try await Self.fetch(Self.twoTypeCatalogue())

        #expect(snapshot.types[1].parentTypeId == Protocol2Wire.bulbType)
    }

    @Test("an absent parent key maps to nil")
    func absentParentMapsToNil() async throws {
        let snapshot = try await Self.fetch(
            Protocol2Wire.catalogueWithTypes(
                revision: 2,
                types: [
                    Protocol2Wire.type(
                        id: Protocol2Wire.bulbType, key: "bulb", label: "Bulb"),
                    Protocol2Wire.type(
                        id: Protocol2Wire.lampType, key: "lamp", label: "Lamp", sortOrder: 1),
                ]))

        #expect(snapshot.types[0].parentTypeId == nil)
        #expect(snapshot.types[1].parentTypeId == nil)
    }

    @Test("a missing parent throws contractMismatch")
    func missingParentFails() async {
        await #expect(throws: RepositoryError.contractMismatch) {
            _ = try await Self.fetch(
                Self.twoTypeCatalogue(
                    secondParentTypeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"))
        }
    }

    @Test("a self-parent throws contractMismatch")
    func selfParentFails() async {
        await #expect(throws: RepositoryError.contractMismatch) {
            _ = try await Self.fetch(
                Self.twoTypeCatalogue(secondParentTypeId: Protocol2Wire.lampType))
        }
    }

    @Test("a parent cycle throws contractMismatch")
    func parentCycleFails() async {
        await #expect(throws: RepositoryError.contractMismatch) {
            _ = try await Self.fetch(
                Self.twoTypeCatalogue(
                    firstParentTypeId: Protocol2Wire.lampType,
                    secondParentTypeId: Protocol2Wire.bulbType))
        }
    }
}
