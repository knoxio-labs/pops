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

    @Test("legacy unavailable success remains a reportable service failure")
    func unavailableSuccessIsReportable() async throws {
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport(status: .ok, json: #"{"outcome":"unavailable"}"#))

        await #expect(throws: PopsError.self) {
            try await transport.lookUp(code: "9780140328721")
        }
    }

    @Test("provider diagnostics preserve their request ID and code")
    func providerFailurePreservesDiagnostics() async throws {
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport(
                status: .ok,
                json:
                    #"""
                    {"outcome":"unavailable","error":{
                      "code":"barcode.lookup.provider_unavailable",
                      "message":"The book provider is unavailable.","requestId":"lookup-42","retryable":true}}
                    """#
            ))
        do {
            _ = try await transport.lookUp(code: "9780140328721")
            Issue.record("Expected a provider failure")
        } catch let error as PopsError {
            #expect(error.code == "barcode.lookup.provider_unavailable")
            #expect(error.requestID == "lookup-42")
            #expect(error.retryable)
            #expect(error.kind == .server)
        }
    }

    @Test("unsupported products remain distinct from unknown books")
    func unsupportedProduct() async throws {
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport(
                status: .ok, json: #"{"outcome":"not_found","reason":"unsupported"}"#))
        #expect(try await transport.lookUp(code: "5012345678900") == .unsupported)
    }

    @Test("HTTP refusals preserve codes and distinguish recovery actions")
    func documentedRefusalsPreserveFailures() async throws {
        let responses: [(HTTPResponse.Status, String)] = [
            (.badRequest, "isn't valid"),
            (.unauthorized, "session needs attention"),
            (.forbidden, "doesn't have permission"),
            (.tooManyRequests, "Too many barcode lookups"),
        ]

        for (status, expectedMessage) in responses {
            let code = "bfm.test.status_\(status.code)"
            let body =
                status == .forbidden
                ? #"""
                {"code":"capability_not_granted","message":"Request refused",
                 "capability":"inventory.barcode.lookup"}
                """#
                : """
                {"code":"\(code)","message":"Request refused","requestId":"refusal-42",
                 "retryable":\(status == .tooManyRequests)}
                """
            let transport = try BFMInventoryTransport.stubbed(
                StubTransport(status: status, json: body))
            do {
                _ = try await transport.lookUp(code: "9780140328721")
                Issue.record("Expected HTTP refusal")
            } catch let error as PopsError {
                #expect(
                    error.code
                        == (status == .forbidden ? "ios.auth.capability_not_granted" : code))
                #expect(error.requestID == (status == .forbidden ? nil : "refusal-42"))
                #expect(error.message.contains(expectedMessage))
                #expect(error.retryable == (status == .tooManyRequests))
            }
        }
    }

    @Test("an undocumented server error identifies the service failure")
    func serverErrorIdentifiesServiceFailure() async throws {
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport(status: .internalServerError, json: #"{"message":"failed"}"#))

        do {
            _ = try await transport.lookUp(code: "9780140328721")
            Issue.record("Expected a server failure")
        } catch let error as PopsError {
            #expect(error.code == "ios.http.500")
            #expect(error.kind == .server)
            #expect(error.retryable)
            #expect(error.message.contains("service is having trouble"))
        }
    }

    @Test("a thrown transport error becomes a safe failure")
    func transportErrorBecomesSafeFailure() async throws {
        let stub = StubTransport { _, _ in throw BarcodeTransportFailure() }
        let transport = try BFMInventoryTransport.stubbed(stub)

        await #expect(throws: PopsError.self) {
            try await transport.lookUp(code: "9780140328721")
        }
    }

    @Test(
        "offline and timeout retain distinct failure codes",
        arguments: [URLError.notConnectedToInternet, .timedOut])
    func networkFailure(code: URLError.Code) async throws {
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport { _, _ in
                throw URLError(code)
            })
        do {
            _ = try await transport.lookUp(code: "9780140328721")
            Issue.record("Expected a network failure")
        } catch let error as PopsError {
            #expect(error.code == (code == .timedOut ? "ios.net.timeout" : "ios.net.offline"))
            #expect(error.kind == (code == .timedOut ? .timeout : .offline))
        }
    }

    @Test("a malformed success retains the server request ID")
    func malformedSuccessPreservesRequestID() async throws {
        let requestHeader = try #require(HTTPField.Name("X-Request-Id"))
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport { _, _ in
                (
                    HTTPResponse(
                        status: .ok,
                        headerFields: [
                            .contentType: "application/json", requestHeader: "barcode-request-42",
                        ]), HTTPBody(#"{"outcome":"found","product":{}}"#)
                )
            })
        do {
            _ = try await transport.lookUp(code: "9780140328721")
            Issue.record("Expected a decode failure")
        } catch let error as PopsError {
            #expect(error.requestID == "barcode-request-42")
            #expect(error.message.contains("couldn't be read"))
            #expect(!error.retryable)
        }
    }

    @Test("the request uses the barcode operation and scanned code")
    func requestCarriesCode() async throws {
        let stub = StubTransport(status: .ok, json: #"{"outcome":"not_found"}"#)
        let transport = try BFMInventoryTransport.stubbed(stub)

        _ = try await transport.lookUp(code: "978 0140328721")

        let sent = try #require(await stub.recorded.all.first)
        #expect(sent.operationID == "mobileBarcode.lookup")
        #expect(sent.request.path == "/mobile/barcode/lookup/978%200140328721")
        let diagnosticHeader = try #require(HTTPField.Name("x-pops-barcode-diagnostics"))
        #expect(sent.request.headerFields[diagnosticHeader] == "1")
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
