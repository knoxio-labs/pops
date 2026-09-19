import AppCore
import Foundation
import InventoryReplica
import Synchronization

/// An `InventorySyncTransport` a test scripts call by call: each endpoint
/// answers through a handler the test sets, and every request is recorded.
/// Anything a test did not script fails loudly as a contract mismatch.
internal final class FakeSyncTransport: InventorySyncTransport {
    typealias SnapshotHandler = @Sendable (String?) async throws -> InventorySnapshotPage
    typealias ChangesHandler = @Sendable (Int, String) async throws -> InventoryChangesPage
    typealias SubmitHandler =
        @Sendable ([InventoryOutboundMutation]) async throws -> InventoryMutationBatchResult

    typealias UploadHandler =
        @Sendable (String, Data, InventoryMediaContentType) async throws ->
        InventoryMediaUploadResult
    typealias FetchHandler = @Sendable (String, InventoryPhotoVariant) async throws -> Data

    struct Script {
        var snapshot: SnapshotHandler = { _ in throw RepositoryError.contractMismatch }
        var changes: ChangesHandler = { _, _ in throw RepositoryError.contractMismatch }
        var submit: SubmitHandler = { _ in throw RepositoryError.contractMismatch }
        var catalogue: InventoryCatalogue?
        var upload: UploadHandler = { sha256, _, _ in
            InventoryMediaUploadResult(sha256: sha256, alreadyStored: false)
        }
        var fetch: FetchHandler = { _, _ in throw RepositoryError.contractMismatch }
    }

    struct Calls {
        var snapshotCursors: [String?] = []
        var changesSince: [Int] = []
        var submitted: [InventoryOutboundMutation] = []
        var catalogueRequests: [String?] = []
        var uploaded: [String] = []
        var fetched: [String] = []
    }

    private let script: Mutex<Script>
    private let recorded = Mutex(Calls())

    init(_ script: Script = Script()) {
        self.script = Mutex(script)
    }

    var calls: Calls { recorded.withLock { $0 } }

    func update(_ change: (inout Script) -> Void) {
        script.withLock { change(&$0) }
    }

    func fetchCatalogue(knownVersion: String?) async throws -> InventoryCatalogue? {
        recorded.withLock { $0.catalogueRequests.append(knownVersion) }
        return script.withLock { $0.catalogue }
    }

    func fetchSnapshot(cursor: String?, limit: Int) async throws -> InventorySnapshotPage {
        recorded.withLock { $0.snapshotCursors.append(cursor) }
        return try await script.withLock { $0.snapshot }(cursor)
    }

    func fetchChanges(since: Int, epoch: String, limit: Int) async throws
        -> InventoryChangesPage
    {
        recorded.withLock { $0.changesSince.append(since) }
        return try await script.withLock { $0.changes }(since, epoch)
    }

    func fetchItemEvents(itemId: String, cursor: String?, limit: Int) async throws
        -> InventoryEventPage
    {
        throw RepositoryError.contractMismatch
    }

    func submit(_ mutations: [InventoryOutboundMutation]) async throws
        -> InventoryMutationBatchResult
    {
        recorded.withLock { $0.submitted.append(contentsOf: mutations) }
        return try await script.withLock { $0.submit }(mutations)
    }

    func uploadMedia(sha256: String, data: Data, contentType: InventoryMediaContentType)
        async throws -> InventoryMediaUploadResult
    {
        recorded.withLock { $0.uploaded.append(sha256) }
        return try await script.withLock { $0.upload }(sha256, data, contentType)
    }

    func fetchMedia(sha256: String, variant: InventoryPhotoVariant) async throws -> Data {
        recorded.withLock { $0.fetched.append(sha256) }
        return try await script.withLock { $0.fetch }(sha256, variant)
    }

    func suggestCodes(name: String, typeKey: String?, stem: String?) async throws -> [String] {
        throw RepositoryError.contractMismatch
    }
}

/// Holds a scripted call until the test lets it go, so a test can look at
/// the replica while a request is in flight without polling for it.
internal final class Gate: Sendable {
    private let arrivals: AsyncStream<Void>
    private let arrived: AsyncStream<Void>.Continuation
    private let releases: AsyncStream<Void>
    private let released: AsyncStream<Void>.Continuation

    init() {
        (arrivals, arrived) = AsyncStream.makeStream()
        (releases, released) = AsyncStream.makeStream()
    }

    /// Called by the scripted handler: announces the call, then waits.
    func pass() async {
        arrived.yield()
        for await _ in releases { return }
    }

    /// Returns once a call has reached `pass()`.
    func waitForArrival() async {
        for await _ in arrivals { return }
    }

    func open() {
        released.yield()
    }
}

internal enum SyncFixture {
    static func applied(
        _ mutations: [InventoryOutboundMutation], revision: Int, seq: Int
    ) -> InventoryMutationBatchResult {
        InventoryMutationBatchResult(
            outcomes: Dictionary(
                uniqueKeysWithValues: mutations.map {
                    ($0.mutationId, .applied(revision: revision, seq: seq, converged: false))
                }),
            highWaterSeq: seq)
    }

    static func answering(
        _ outcome: InventoryMutationOutcome
    ) -> FakeSyncTransport.SubmitHandler {
        { mutations in
            InventoryMutationBatchResult(
                outcomes: Dictionary(
                    uniqueKeysWithValues: mutations.map { ($0.mutationId, outcome) }),
                highWaterSeq: 30)
        }
    }

    static func mutationIds() -> @Sendable () -> String {
        let next = Mutex(0)
        return {
            next.withLock {
                $0 += 1
                return "mutation-\($0)"
            }
        }
    }
}

/// A store under test, the transport it talks to and the replica it fills.
internal struct OnlineHarness {
    let store: OnlineInventoryStore
    let transport: FakeSyncTransport
    let replica: InventoryReplica
}
