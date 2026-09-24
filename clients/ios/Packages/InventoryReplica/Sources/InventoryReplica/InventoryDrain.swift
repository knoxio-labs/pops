import AppCore
import Foundation
import Synchronization

/// How one drain pass ended, which decides what the drain does next.
internal enum InventoryDrainPass: Equatable, Sendable {
    /// Nothing left to send, or only changes held behind a conflict or a
    /// rejection, which wait for a repair rather than a retry.
    case drained
    /// The server was not reached, or deferred something: try again after
    /// the backoff.
    case retryLater
    /// `401` or `426`: nothing is sent until the next trigger.
    case blocked
    /// The network path is down: the next change to satisfied triggers a pass.
    case waitingForNetwork
}

/// Sends the mutation log to the server (ADR-002 D9, D11).
///
/// A pass sends batches of up to 50 queued or deferred mutations in stable
/// topological order, each under the id it was logged with, until nothing is
/// left to send. A change whose dependency ended conflicted or rejected is
/// held rather than sent; those rows stay in their log state for a repair to
/// settle, and an Undo of such a change is dropped without being sent. What
/// the server deferred is not offered again in the same pass.
///
/// - A batch that never arrived is returned to the queue and resent later
///   under the same mutation ids, which the server answers from its stored
///   outcomes if it had applied them after all.
/// - `409 resync_required` takes a fresh snapshot, keeping the log, and the
///   pass carries on. `401` and `426` show as the blocked interruptions and
///   stop the pass. Any other failure shows as offline where it means the
///   server was unreachable, and otherwise as a sending stall on the Sync
///   ledger, logged (`report(_:)`), until a pass gets through; either is
///   retried after the backoff: 2 seconds, doubling, at most 5 minutes.
/// - After a pass that applied anything, the change feed is read so the
///   applied changes settle.
/// - A change answered `catalogue_update_required` waits for a newer
///   catalogue: before the next batch the feed is read, which stores the
///   active revision, and the change is moved onto it and sent, or opens
///   the `catalogueChanged` repair when it no longer fits. A catalogue this
///   build is too old for blocks the pass (`appTooOld`).
/// - Before each batch, photos staged on this phone are uploaded, oldest
///   first; an attach of one waits until it is on the server. `413` and
///   `415` fail the photo, and every attach waiting on it opens the failed
///   photo repair; any other failure ends the pass like a batch that never
///   arrived. A photo the server answers `alreadyStored` for is uploaded.
///
/// Once started it runs a pass on ``request()`` (after each logged change,
/// and on foreground), when the backoff elapses, and when the network path
/// becomes satisfied, including the path it starts on. Passes never overlap.
internal final class InventoryDrain: Sendable {
    private struct Tasks: Sendable {
        var loop: Task<Void, Never>?
        var watcher: Task<Void, Never>?
        var retry: Task<Void, Never>?

        func cancelAll() {
            loop?.cancel()
            watcher?.cancel()
            retry?.cancel()
        }
    }

    let replica: InventoryReplica
    let online: OnlineInventoryStore
    private let reachability: any NetworkReachability
    private let clock: any InventoryDrainClock
    private let batchSize: Int
    let now: @Sendable () -> Date
    private let mintMutationId: @Sendable () -> String
    private let triggers: AsyncStream<Void>
    private let trigger: AsyncStream<Void>.Continuation
    private let tasks = Mutex(Tasks())
    /// Callers of ``requestAndWait()`` waiting for the next pass to finish.
    private let waiters = Mutex<[UUID: CheckedContinuation<Void, Never>]>([:])

    /// - Parameters:
    ///   - online: The store whose transport the batches go through, and
    ///     whose refresh and resync keep the replica current around them.
    ///   - batchSize: Mutations per request; the wire allows 1 to 50.
    ///   - now: The time a send attempt is recorded at.
    ///   - mintMutationId: The new id for an attach logged again after the
    ///     server answered `media_missing`.
    init(
        replica: InventoryReplica,
        online: OnlineInventoryStore,
        reachability: any NetworkReachability,
        clock: any InventoryDrainClock,
        batchSize: Int = 50,
        now: @escaping @Sendable () -> Date,
        mintMutationId: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() }
    ) {
        self.replica = replica
        self.online = online
        self.reachability = reachability
        self.clock = clock
        self.batchSize = batchSize
        self.now = now
        self.mintMutationId = mintMutationId
        (triggers, trigger) = AsyncStream.makeStream(bufferingPolicy: .bufferingNewest(1))
    }

    deinit {
        tasks.withLock { $0.cancelAll() }
        trigger.finish()
        for waiter in takeWaiters() { waiter.resume() }
    }

    /// Starts listening for triggers and path changes. The reachability
    /// reports the path it starts with, so a usable one runs a first pass.
    /// Starting again does nothing.
    func start() {
        tasks.withLock { tasks in
            guard tasks.loop == nil else { return }
            tasks.loop = Task { [weak self, triggers] in
                var failures = 0
                for await _ in triggers {
                    guard let self else { return }
                    let waiting = self.takeWaiters()
                    failures = await self.runPass(afterFailures: failures)
                    for waiter in waiting { waiter.resume() }
                }
            }
            tasks.watcher = Task { [weak self, reachability] in
                var wasSatisfied = false
                for await satisfied in reachability.updates() {
                    if satisfied, !wasSatisfied { self?.request() }
                    wasSatisfied = satisfied
                }
            }
        }
    }

    /// Asks for a pass. Requests made while one runs collapse into one more.
    func request() {
        trigger.yield()
    }

    /// Asks for a pass and returns once a pass that started after this call
    /// has ended, however it ended, or at once when the calling task is
    /// cancelled. The pass itself is not cancelled: rows it leaves in flight
    /// are requeued by the next one.
    func requestAndWait() async {
        let id = UUID()
        await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                let waiting = waiters.withLock { waiters in
                    guard !Task.isCancelled else { return false }
                    waiters[id] = continuation
                    return true
                }
                guard waiting else {
                    continuation.resume()
                    return
                }
                trigger.yield()
            }
        } onCancel: {
            waiters.withLock { $0.removeValue(forKey: id) }?.resume()
        }
    }

    private func runPass(afterFailures failures: Int) async -> Int {
        tasks.withLock { tasks in
            tasks.retry?.cancel()
            tasks.retry = nil
        }
        switch await drainNow() {
        case .drained:
            return 0
        case .blocked, .waitingForNetwork:
            return failures
        case .retryLater:
            let delay = InventoryDrainBackoff.delay(afterFailures: failures + 1)
            tasks.withLock { tasks in
                tasks.retry = Task { [clock, trigger] in
                    do {
                        try await clock.sleep(for: delay)
                    } catch {
                        return
                    }
                    trigger.yield()
                }
            }
            return failures + 1
        }
    }

    /// One pass over the log. Not reentrant: the loop runs one at a time, and
    /// tests call it directly without starting the loop.
    func drainNow() async -> InventoryDrainPass {
        guard reachability.isSatisfied else { return .waitingForNetwork }
        var deferred: Set<String> = []
        var appliedAny = false
        var resynced = false
        do {
            try replica.requeueInFlight()
            while true {
                if let stopped = try await settleChangesAwaitingCatalogue() { return stopped }
                if let stopped = try await uploadStagedPhotos() { return stopped }
                let batch = try replica.outboundMutations(limit: batchSize, excluding: deferred)
                guard !batch.isEmpty else { break }
                switch await send(batch) {
                case .settled(let outcomes):
                    deferred.formUnion(outcomes.deferred)
                    appliedAny = appliedAny || outcomes.appliedAny
                case .resyncRequired where !resynced:
                    resynced = true
                    try await online.resyncKeepingLog()
                case .resyncRequired, .failed:
                    return .retryLater
                case .blocked:
                    return .blocked
                }
            }
        } catch {
            report(error)
            return OnlineInventoryStore.blockReason(for: error) == nil ? .retryLater : .blocked
        }
        clearStall()
        if appliedAny { await online.refresh() }
        return deferred.isEmpty ? .drained : .retryLater
    }

    private enum BatchResult {
        case settled(SettledBatch)
        case resyncRequired
        case blocked
        case failed
    }

    private struct SettledBatch {
        let deferred: Set<String>
        let appliedAny: Bool
    }

    private func send(_ batch: [InventoryOutboundMutation]) async -> BatchResult {
        let ids = batch.map(\.mutationId)
        let result: InventoryMutationBatchResult
        do {
            try replica.markSending(ids, at: now())
            result = try await online.transport.submit(batch)
        } catch {
            return failed(ids, error)
        }
        online.noteReached()
        do {
            try replica.recordOutcomes(result, mintMutationId: mintMutationId)
            let unanswered = ids.filter { result.outcomes[$0] == nil }
            guard unanswered.isEmpty else {
                return failed(unanswered, RepositoryError.contractMismatch)
            }
        } catch {
            return failed(ids, error)
        }
        var deferred: Set<String> = []
        var appliedAny = false
        for (id, outcome) in result.outcomes {
            switch outcome {
            case .deferred: deferred.insert(id)
            case .applied: appliedAny = true
            default: break
            }
        }
        return .settled(SettledBatch(deferred: deferred, appliedAny: appliedAny))
    }

    /// Puts what was in flight back in the queue, so the next attempt
    /// resends it under the same ids. If even that fails, the next pass
    /// requeues it before sending anything.
    private func failed(_ ids: [String], _ error: any Error) -> BatchResult {
        do {
            try replica.returnToQueue(ids)
        } catch {
            report(error)
        }
        if OnlineInventoryStore.needsResync(error) { return .resyncRequired }
        report(error)
        return OnlineInventoryStore.blockReason(for: error) == nil ? .failed : .blocked
    }
}

extension InventoryDrain {
    fileprivate func takeWaiters() -> [CheckedContinuation<Void, Never>] {
        waiters.withLock { waiters in
            defer { waiters.removeAll() }
            return Array(waiters.values)
        }
    }
}
