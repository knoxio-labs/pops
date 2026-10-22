import AppCore
import HTTPTypes
import Testing

@testable import BFMClient

/// `/mobile/inventory/items/:id/parts`: every placement shape decodes into
/// the AppCore model, a refused add carries the server's own words, and the
/// statuses a screen acts on arrive as typed `InventoryPartsError`s.
@Suite("BFMInventoryTransport parts")
internal struct InventoryPartsTransportTests {
    private static let view = """
        {"canHaveParts":true,"assembly":{"itemId":"kitchen-set","name":"Kitchen set","code":null},
        "parts":[
        {"itemId":"cup","name":"Cup","code":"CUP-1","typeId":"t-cup","lifecycle":"active",
        "placement":{"kind":"container","locationId":null,"locationName":null,
        "containingItemId":"box","containingItemName":"Ninja blender"}},
        {"itemId":"base","name":"Motor base","code":null,"typeId":null,"lifecycle":"lost",
        "placement":{"kind":"location","locationId":"lounge","locationName":"Lounge",
        "containingItemId":null,"containingItemName":null}},
        {"itemId":"lid","name":"Lid","code":null,"typeId":null,"lifecycle":"retired_forever",
        "placement":{"kind":"hand","locationId":null,"locationName":null,
        "containingItemId":null,"containingItemName":null}}]}
        """

    private static func conflict(_ message: String) -> String {
        """
        {"code":"inventory.resource.conflict","message":"\(message)","requestId":"r-1",\
        "retryable":false,"details":{"upstream":{"pillar":"inventory","status":409}}}
        """
    }

    @Test("decodes the assembly and every placement shape, keeping unknown lifecycles verbatim")
    func decodesView() async throws {
        let stub = StubTransport(status: .ok, json: Self.view)
        let parts = try await BFMInventoryTransport.stubbed(stub).parts(of: "kit")

        #expect(parts.canHaveParts)
        #expect(parts.assembly == InventoryItemReference(id: "kitchen-set", name: "Kitchen set", code: nil))
        #expect(parts.parts.map(\.id) == ["cup", "base", "lid"])
        #expect(parts.parts[0].reference.code == "CUP-1")
        #expect(parts.parts[0].placement == .container(id: "box", name: "Ninja blender"))
        #expect(parts.parts[1].placement == .location(id: "lounge", name: "Lounge"))
        #expect(parts.parts[1].lifecycle == .lost)
        #expect(parts.parts[2].placement == .hand)
        #expect(parts.parts[2].lifecycle == .unrecognised("retired_forever"))
        let sent = await stub.recorded.all
        #expect(sent.map(\.operationID) == ["mobileInventory.itemParts"])
        #expect(sent[0].request.path == "/mobile/inventory/items/kit/parts")
    }

    @Test("a container placement without its container id is a contract mismatch, not a guess")
    func containerWithoutIdIsMismatch() async throws {
        let broken = Self.view.replacingOccurrences(
            of: #""containingItemId":"box""#, with: #""containingItemId":null"#)
        await #expect(throws: RepositoryError.contractMismatch) {
            _ = try await BFMInventoryTransport.stubbed(StubTransport(status: .ok, json: broken))
                .parts(of: "kit")
        }
    }

    @Test("adding posts to the assembly and answers its new view")
    func addsPart() async throws {
        let stub = StubTransport(status: .ok, json: Self.view)
        let parts = try await BFMInventoryTransport.stubbed(stub).addPart("cup", to: "kit")

        #expect(parts.parts.count == 3)
        let sent = await stub.recorded.all
        #expect(sent[0].operationID == "mobileInventory.addItemPart")
        #expect(sent[0].request.method == .post)
        #expect(sent[0].request.path == "/mobile/inventory/items/kit/parts")
    }

    @Test("a 409 on add is refused, carrying the server's message")
    func refusedAdd() async throws {
        let message = "Item 'cup' is already a part of 'other'; remove it there first"
        await #expect(throws: InventoryPartsError.refused(message)) {
            _ = try await BFMInventoryTransport.stubbed(
                StubTransport(status: .conflict, json: Self.conflict(message))
            ).addPart("cup", to: "kit")
        }
    }

    @Test("removing deletes the pair named in the path")
    func removesPart() async throws {
        let stub = StubTransport(status: .ok, json: Self.view)
        _ = try await BFMInventoryTransport.stubbed(stub).removePart("cup", from: "kit")

        let sent = await stub.recorded.all
        #expect(sent[0].operationID == "mobileInventory.removeItemPart")
        #expect(sent[0].request.method == .delete)
        #expect(sent[0].request.path == "/mobile/inventory/items/kit/parts/cup")
    }

    @Test("a 404 is notFound on every operation")
    func notFound() async throws {
        let missing = InventoryWire.failure(code: "common.notFound")
        await #expect(throws: InventoryPartsError.notFound) {
            _ = try await BFMInventoryTransport.stubbed(
                StubTransport(status: .notFound, json: missing)
            ).parts(of: "missing")
        }
        await #expect(throws: InventoryPartsError.notFound) {
            _ = try await BFMInventoryTransport.stubbed(
                StubTransport(status: .notFound, json: missing)
            ).removePart("cup", from: "kit")
        }
    }

    @Test("a 503 from the inventory pillar is unavailable")
    func unavailable() async throws {
        await #expect(throws: InventoryPartsError.unavailable) {
            _ = try await BFMInventoryTransport.stubbed(
                StubTransport(
                    status: .init(code: 503),
                    json: InventoryWire.upstreamUnavailable(pillar: "inventory"))
            ).parts(of: "kit")
        }
    }

    @Test("403 capability_not_granted is a feature-unavailable failure")
    func capabilityDenied() async throws {
        await #expect(throws: RepositoryError.featureUnavailable) {
            _ = try await BFMInventoryTransport.stubbed(
                StubTransport(
                    status: .forbidden, json: InventoryWire.forbidden(capability: "inventory.write"))
            ).addPart("cup", to: "kit")
        }
    }
}
