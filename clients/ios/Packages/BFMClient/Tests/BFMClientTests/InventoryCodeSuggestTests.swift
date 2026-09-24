import AppCore
import Foundation
import HTTPTypes
import Testing

@testable import BFMClient

/// `POST /mobile/inventory/codes/suggest` (POPS-4107): the suggestions decode
/// in order, the request carries what the caller asked with, and a 503 from
/// the inventory pillar behind bfm is the typed `suggestionsUnavailable`
/// rather than a `RepositoryError` a screen would show as a generic failure.
@Suite("BFMInventoryTransport code suggestions")
internal struct InventoryCodeSuggestTests {
    @Test("suggestions decode in the order the server sent them")
    func decodesSuggestions() async throws {
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport(status: .ok, json: #"{"suggestions":["B1","B2","B3"]}"#))

        let suggestions = try await transport.suggestCodes(name: "Drill", typeKey: nil, stem: nil)

        #expect(suggestions == ["B1", "B2", "B3"])
    }

    @Test("an empty answer is a suggester with nothing to offer, not an error")
    func decodesEmptySuggestions() async throws {
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport(status: .ok, json: #"{"suggestions":[]}"#))

        let suggestions = try await transport.suggestCodes(name: "Drill", typeKey: nil, stem: nil)

        #expect(suggestions.isEmpty)
    }

    @Test("the request reaches the codes/suggest operation this build asked for")
    func sendsTheRightOperation() async throws {
        let stub = StubTransport(status: .ok, json: #"{"suggestions":[]}"#)
        let transport = try BFMInventoryTransport.stubbed(stub)

        _ = try await transport.suggestCodes(name: "Drill", typeKey: "tools", stem: "B")

        let sent = await stub.recorded.all
        #expect(sent.count == 1)
        #expect(sent[0].operationID == "mobileInventory.suggestCodes")
    }

    @Test("a 503 from the inventory pillar is suggestionsUnavailable, not a RepositoryError")
    func serviceUnavailableIsSuggestionsUnavailable() async throws {
        await #expect(throws: InventorySyncTransportError.suggestionsUnavailable) {
            _ = try await BFMInventoryTransport.stubbed(
                StubTransport(
                    status: .init(code: 503),
                    json: InventoryWire.upstreamUnavailable(pillar: "inventory"))
            ).suggestCodes(name: "Drill", typeKey: nil, stem: nil)
        }
    }

    @Test("426 client_too_old surfaces as the typed too-old error, same as every sync route")
    func clientTooOld() async throws {
        await #expect(throws: InventorySyncTransportError.clientTooOld) {
            _ = try await BFMInventoryTransport.stubbed(
                StubTransport(
                    status: .init(code: 426),
                    json: InventoryWire.failure(code: "client_too_old"))
            ).suggestCodes(name: "Drill", typeKey: nil, stem: nil)
        }
    }

    @Test("403 capability_not_granted is unauthorized, same as every other /mobile/inventory route")
    func capabilityDenied() async throws {
        await #expect(throws: RepositoryError.unauthorized) {
            _ = try await BFMInventoryTransport.stubbed(
                StubTransport(
                    status: .forbidden, json: InventoryWire.forbidden(capability: "inventory.write")
                )
            ).suggestCodes(name: "Drill", typeKey: nil, stem: nil)
        }
    }
}
