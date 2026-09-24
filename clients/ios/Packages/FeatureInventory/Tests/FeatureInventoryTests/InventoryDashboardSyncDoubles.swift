import AppCore
import Foundation
import Synchronization

@testable import FeatureInventory

/// Counts `refresh()` and `download()` calls, answers `hasNeverDownloaded()`
/// from a flag a test sets, and can hold one call open until released — so a
/// test can prove two callers overlap on it before letting it finish.
internal final class CountingGatedInventoryStore: InventoryStore, @unchecked Sendable {
    private struct State {
        var refreshCount = 0
        var downloadCount = 0
        var empty = false
        var holdNext = false
        var continuation: CheckedContinuation<Void, Never>?
    }

    private let state = Mutex(State())
    let entered: AsyncStream<Void>
    private let enter: AsyncStream<Void>.Continuation

    init(empty: Bool = false) {
        state.withLock { $0.empty = empty }
        (entered, enter) = AsyncStream.makeStream()
    }

    var refreshCount: Int { state.withLock { $0.refreshCount } }
    var downloadCount: Int { state.withLock { $0.downloadCount } }

    func holdNextCall() { state.withLock { $0.holdNext = true } }

    func release() {
        let continuation = state.withLock { current -> CheckedContinuation<Void, Never>? in
            defer { current.continuation = nil }
            return current.continuation
        }
        continuation?.resume()
    }

    func hasNeverDownloaded() async -> Bool { state.withLock { $0.empty } }

    func refresh() async {
        await enterAndMaybeHold { $0.refreshCount += 1 }
    }

    func download() async throws {
        await enterAndMaybeHold {
            $0.downloadCount += 1
            $0.empty = false
        }
    }

    private func enterAndMaybeHold(_ change: (inout State) -> Void) async {
        let shouldHold = state.withLock { current -> Bool in
            change(&current)
            defer { current.holdNext = false }
            return current.holdNext
        }
        enter.yield()
        guard shouldHold else { return }
        await withCheckedContinuation { continuation in
            state.withLock { $0.continuation = continuation }
        }
    }

    func observe<Value: Sendable>(_ query: InventoryQuery<Value>) -> AsyncStream<Value> {
        AsyncStream { _ in }
    }
    func perform(_ command: InventoryCommand) async throws -> InventoryReceipt {
        throw RepositoryError.unavailable
    }
    func undo(_ receipt: InventoryReceipt) async throws {}
    func resolve(_ repairId: InventoryRepair.ID, with choice: InventoryRepairChoice) async throws {}
    func photo(_ sha256: String, variant: InventoryPhotoVariant) async throws -> Data {
        throw RepositoryError.unavailable
    }
    func uploadPhoto(
        sha256: String, data: Data, contentType: InventoryMediaContentType
    ) async throws -> InventoryMediaUploadResult {
        throw RepositoryError.unavailable
    }
    func discardPhoto(_ sha256: String) async throws {}
    func status() -> AsyncStream<InventoryReplicaStatus> { AsyncStream { _ in } }
    func settleTypeArrival(typeKey: String) async throws {}
}

/// A clock a test can move forward, for the dashboard's sync freshness
/// window.
internal final class TestClock: Sendable {
    private let date: Mutex<Date>

    init(_ date: Date) { self.date = Mutex(date) }

    var now: Date { date.withLock { $0 } }

    func advance(by seconds: TimeInterval) {
        date.withLock { $0 = $0.addingTimeInterval(seconds) }
    }
}
