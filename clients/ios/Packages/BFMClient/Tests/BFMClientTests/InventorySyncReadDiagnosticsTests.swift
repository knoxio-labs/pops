import AppCore
import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

@Suite("BFM inventory sync read diagnostics")
internal struct InventorySyncReadDiagnosticsTests {
    @Test("a failed authenticated changes read records its server diagnostic once")
    func recordsServerDiagnosticOnce() async throws {
        let diagnostics = SyncReadDiagnostics()
        let requestIDHeader = try #require(HTTPField.Name("X-Request-Id"))
        let transport = try BFMInventoryTransport(
            client: BFMHTTPClient(
                baseURL: #require(URL(string: "https://bfm.example")),
                transport: StubTransport { _, _ in
                    (
                        HTTPResponse(
                            status: .serviceUnavailable,
                            headerFields: [
                                .contentType: "application/json",
                                requestIDHeader: "sync-request-42",
                            ]
                        ),
                        HTTPBody(
                            #"{"code":"upstream_unavailable","message":"Unavailable","#
                                + #""requestId":"sync-request-42","retryable":true}"#
                        )
                    )
                }
            ),
            syncReadFailureObserver: { error, operation in
                await diagnostics.record(error, operation: operation)
            }
        )

        await #expect(throws: RepositoryError.unavailable) {
            _ = try await transport.fetchChanges(since: 40, epoch: "epoch-1", limit: 250)
        }

        let recorded = await diagnostics.entries
        #expect(recorded.count == 1)
        #expect(recorded.first?.error.code == "upstream_unavailable")
        #expect(recorded.first?.error.requestID == "sync-request-42")
        #expect(recorded.first?.error.kind == .server)
        #expect(recorded.first?.operation == "mobileInventory.changes")
    }

    @Test("a decoded-success mismatch is recorded before snapshot becomes too old")
    func recordsDecodeFailure() async throws {
        let diagnostics = SyncReadDiagnostics()
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport(status: .ok, json: "{}"),
            syncReadFailureObserver: { error, operation in
                await diagnostics.record(error, operation: operation)
            }
        )

        await #expect(throws: InventorySyncTransportError.clientTooOld) {
            _ = try await transport.fetchSnapshot(cursor: nil, limit: 250)
        }

        let recorded = try #require(await diagnostics.entries.first)
        #expect(recorded.error.code == "ios.decode.failed")
        #expect(recorded.error.kind == .client)
        #expect(recorded.operation == "mobileInventory.snapshot")
    }

    @Test("timeout and offline reads retain their distinct classifications")
    func recordsNetworkFailures() async throws {
        let diagnostics = SyncReadDiagnostics()
        let timedOut = try BFMInventoryTransport.stubbed(
            StubTransport { _, _ in throw URLError(.timedOut) },
            syncReadFailureObserver: { error, operation in
                await diagnostics.record(error, operation: operation)
            }
        )
        let offline = try BFMInventoryTransport.stubbed(
            StubTransport { _, _ in throw URLError(.notConnectedToInternet) },
            syncReadFailureObserver: { error, operation in
                await diagnostics.record(error, operation: operation)
            }
        )

        await #expect(throws: RepositoryError.self) {
            _ = try await timedOut.fetchChanges(since: 40, epoch: "epoch-1", limit: 250)
        }
        await #expect(throws: RepositoryError.self) {
            _ = try await offline.fetchCatalogue(knownVersion: nil)
        }

        let recorded = await diagnostics.entries
        #expect(recorded.map(\.error.code) == ["ios.net.timeout", "ios.net.offline"])
        #expect(
            recorded.map(\.operation)
                == ["mobileInventory.changes", "mobileInventory.catalogue"]
        )
    }

    @Test("an authenticated catalogue revision refusal retains its request id")
    func recordsAuthenticationFailure() async throws {
        let diagnostics = SyncReadDiagnostics()
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport(
                status: .unauthorized,
                json: #"{"code":"invalid_token","message":"Denied","#
                    + #""requestId":"auth-request-42","retryable":false}"#
            ),
            syncReadFailureObserver: { error, operation in
                await diagnostics.record(error, operation: operation)
            }
        )

        await #expect(throws: RepositoryError.unauthorized) {
            _ = try await transport.fetchCatalogue(revision: 12)
        }

        let recorded = try #require(await diagnostics.entries.first)
        #expect(recorded.error.code == "invalid_token")
        #expect(recorded.error.requestID == "auth-request-42")
        #expect(recorded.error.kind == .client)
        #expect(recorded.operation == "mobileInventory.catalogueRevision")
    }

    @Test("a cancelled sync read does not record a diagnostic")
    func cancellationIsSilent() async throws {
        let diagnostics = SyncReadDiagnostics()
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport { _, _ in throw CancellationError() },
            syncReadFailureObserver: { error, operation in
                await diagnostics.record(error, operation: operation)
            }
        )

        await #expect(throws: RepositoryError.self) {
            _ = try await transport.fetchSnapshot(cursor: nil, limit: 250)
        }

        #expect((await diagnostics.entries).isEmpty)
    }

    @Test("a cancelled URL request does not record a diagnostic")
    func URLCancellationIsSilent() async throws {
        let diagnostics = SyncReadDiagnostics()
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport { _, _ in throw URLError(.cancelled) },
            syncReadFailureObserver: { error, operation in
                await diagnostics.record(error, operation: operation)
            }
        )

        await #expect(throws: RepositoryError.self) {
            _ = try await transport.fetchChanges(since: 40, epoch: "epoch-1", limit: 250)
        }

        #expect((await diagnostics.entries).isEmpty)
    }

    @Test("resync control flow does not record a diagnostic")
    func resyncControlFlowIsSilent() async throws {
        let diagnostics = SyncReadDiagnostics()
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport(status: .ok, json: "{}"),
            syncReadFailureObserver: { error, operation in
                await diagnostics.record(error, operation: operation)
            }
        )
        let clientError = ClientError(
            operationID: "mobileInventory.changes",
            operationInput: (),
            response: HTTPResponse(status: .conflict),
            causeDescription: "Unexpected response status",
            underlyingError: BFMRuntimePopsError(
                PopsError(
                    code: "resync_required", message: "Resync required", retryable: true,
                    kind: .client),
                statusCode: 409
            )
        )

        await #expect(throws: InventorySyncTransportError.resyncRequired) {
            _ = try await transport.observedSyncRead(
                operation: "mobileInventory.changes",
                mapClientError: {
                    BFMInventoryTransport.syncReadFailure($0, operation: "mobileInventory.changes")
                },
                read: { throw clientError }
            )
        }
        await #expect(throws: InventorySyncTransportError.resyncRequired) {
            _ = try await transport.observedSyncRead(
                operation: "mobileInventory.changes",
                mapClientError: {
                    BFMInventoryTransport.syncReadFailure($0, operation: "mobileInventory.changes")
                },
                read: { throw InventorySyncTransportError.resyncRequired }
            )
        }

        #expect((await diagnostics.entries).isEmpty)
    }
}

private actor SyncReadDiagnostics {
    private(set) var entries: [(error: PopsError, operation: String)] = []

    func record(_ error: PopsError, operation: String) {
        entries.append((error, operation))
    }
}
