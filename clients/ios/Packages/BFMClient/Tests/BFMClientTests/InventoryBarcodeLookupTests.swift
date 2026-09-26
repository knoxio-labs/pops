import AppCore
import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

@Suite("BFMInventoryTransport barcode lookup")
internal struct InventoryBarcodeLookupTests {
    @Test("found maps every product fact and omits wire metadata")
    func foundMapsProductFacts() async throws {
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport(status: .ok, json: foundProductJSON))

        let result = try await transport.lookUp(code: "9780140328721")

        #expect(
            result
                == .found(
                    InventoryBarcodeProduct(
                        title: "Matilda",
                        subtitle: "A novel",
                        contributors: [
                            InventoryBarcodeContributor(name: "Roald Dahl", role: "author"),
                            InventoryBarcodeContributor(name: "Quentin Blake"),
                        ],
                        publisher: "Puffin",
                        publishedDate: "1988-10-01",
                        pageCount: 240,
                        language: "en",
                        description: "A story about a reader.",
                        subjects: ["Fiction", "Children"],
                        attributes: ["format": "hardcover", "edition": "first"]
                    )))
    }

    @Test("not_found maps to a definite absence")
    func notFoundMapsToAbsence() async throws {
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport(status: .ok, json: #"{"outcome":"not_found"}"#))

        #expect(try await transport.lookUp(code: "9780140328721") == .notFound)
    }

    @Test("unavailable success maps to unavailable")
    func unavailableSuccessMapsToUnavailable() async throws {
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport(status: .ok, json: #"{"outcome":"unavailable"}"#))

        #expect(try await transport.lookUp(code: "9780140328721") == .unavailable)
    }

    @Test("every documented refusal maps to unavailable")
    func documentedRefusalsMapToUnavailable() async throws {
        let responses: [(HTTPResponse.Status, String)] = [
            (.badRequest, InventoryWire.failure(code: "invalid_request")),
            (.unauthorized, InventoryWire.deviceRevoked),
            (.forbidden, InventoryWire.forbidden(capability: "barcode.lookup")),
            (.tooManyRequests, InventoryWire.rateLimited),
        ]

        for (status, body) in responses {
            let transport = try BFMInventoryTransport.stubbed(
                StubTransport(status: status, json: body))
            #expect(try await transport.lookUp(code: "9780140328721") == .unavailable)
        }
    }

    @Test("an undocumented server error maps to unavailable")
    func serverErrorMapsToUnavailable() async throws {
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport(status: .internalServerError, json: #"{"message":"failed"}"#))

        #expect(try await transport.lookUp(code: "9780140328721") == .unavailable)
    }

    @Test("a thrown transport error maps to unavailable")
    func transportErrorMapsToUnavailable() async throws {
        let stub = StubTransport { _, _ in throw BarcodeTransportFailure() }
        let transport = try BFMInventoryTransport.stubbed(stub)

        #expect(try await transport.lookUp(code: "9780140328721") == .unavailable)
    }

    @Test("the request uses the barcode operation and scanned code")
    func requestCarriesCode() async throws {
        let stub = StubTransport(status: .ok, json: #"{"outcome":"not_found"}"#)
        let transport = try BFMInventoryTransport.stubbed(stub)

        _ = try await transport.lookUp(code: "978 0140328721")

        let sent = try #require(await stub.recorded.all.first)
        #expect(sent.operationID == "mobileBarcode.lookup")
        #expect(sent.request.path == "/mobile/barcode/lookup/978%200140328721")
    }
}

private struct BarcodeTransportFailure: Error {}

private let foundProductJSON = #"""
    {
      "outcome":"found",
      "product":{
        "attributes":{"format":"hardcover","edition":"first"},
        "code":"9780140328721",
        "contributors":[
          {"name":"Roald Dahl","role":"author"},
          {"name":"Quentin Blake","role":null}
        ],
        "description":"A story about a reader.",
        "fetchedAt":"2026-09-26T00:00:00.000Z",
        "imageUrls":["https://images.example/cover.jpg"],
        "kind":"book",
        "language":"en",
        "pageCount":240,
        "publishedDate":"1988-10-01",
        "publisher":"Puffin",
        "source":"open_library",
        "subjects":["Fiction","Children"],
        "subtitle":"A novel",
        "title":"Matilda"
      }
    }
    """#
