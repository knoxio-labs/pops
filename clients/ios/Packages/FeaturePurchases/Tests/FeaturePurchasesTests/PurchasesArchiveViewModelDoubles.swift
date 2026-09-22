import AppCore
import Foundation

internal actor ArchiveGate {
    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    internal func wait() async {
        if isOpen { return }
        await withCheckedContinuation { waiters.append($0) }
    }

    internal func open() {
        isOpen = true
        let pending = waiters
        waiters.removeAll()
        for waiter in pending { waiter.resume() }
    }
}

internal enum ArchiveResponse: Sendable {
    case immediate(PurchasePage)
    case gated(ArchiveGate, PurchasePage)
    case failure(RepositoryError)
    case cancelled

    internal func value() async throws -> PurchasePage {
        switch self {
        case .immediate(let page): return page
        case .gated(let gate, let page):
            await gate.wait()
            return page
        case .failure(let error): throw error
        case .cancelled: throw CancellationError()
        }
    }
}

internal actor ArchiveRepository: PurchasesRepository {
    internal struct Call: Equatable, Sendable {
        internal let cursor: String?
        internal let filter: PurchaseStatusFilter
    }

    private var responses: [ArchiveResponse]
    private var recorded: [Call] = []
    private var waiters: [(Int, CheckedContinuation<Void, Never>)] = []

    internal init(_ responses: [ArchiveResponse]) {
        self.responses = responses
    }

    internal func calls() -> [Call] { recorded }

    internal func waitForCalls(_ count: Int) async {
        if recorded.count >= count { return }
        await withCheckedContinuation { waiters.append((count, $0)) }
    }

    internal func purchases(
        after cursor: String?, statusFilter: PurchaseStatusFilter
    ) async throws -> PurchasePage {
        recorded.append(Call(cursor: cursor, filter: statusFilter))
        let ready = waiters.filter { recorded.count >= $0.0 }
        waiters.removeAll { recorded.count >= $0.0 }
        for waiter in ready { waiter.1.resume() }
        guard !responses.isEmpty else { throw RepositoryError.transport("No queued page") }
        return try await responses.removeFirst().value()
    }

    internal func monthSummary(for: Date) async throws -> PurchasesMonthSummary {
        .empty
    }
}

@MainActor
internal final class PurchaseSelectionRecorder {
    internal var purchases: [Purchase] = []
}
