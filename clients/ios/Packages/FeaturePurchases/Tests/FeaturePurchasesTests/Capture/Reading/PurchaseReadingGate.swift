import AppCore

internal actor ReadingGate: ReceiptCaptureRepository {
    internal enum Answer: Sendable {
        case draft
        case unreadable(String)
        case failure(RepositoryError)
        case cancelled
    }

    private let answers: [UInt8: Answer]
    private var heldRegistrations: Set<UInt8>
    private var registrationWaiters: [UInt8: [CheckedContinuation<Void, Never>]] = [:]
    private var calls: [UInt8] = []
    private var active = 0
    private var peak = 0
    private var gates: [UInt8: CheckedContinuation<Void, Never>] = [:]
    private var gateWaiters: [UInt8: [CheckedContinuation<Void, Never>]] = [:]
    private var callWaiters: [(Int, CheckedContinuation<Void, Never>)] = []
    private var finishDecisions: [UInt8: FinishDecision] = [:]
    private var finishDecisionWaiters: [UInt8: [CheckedContinuation<FinishDecision, Never>]] = [:]

    internal init(
        answers: [UInt8: Answer] = [:],
        heldRegistrations: Set<UInt8> = []
    ) {
        self.answers = answers
        self.heldRegistrations = heldRegistrations
    }

    internal func extract(_ parts: [ReceiptPart]) async throws -> ReceiptExtraction {
        let key = parts.first?.data.first ?? 0
        if heldRegistrations.contains(key) {
            await withCheckedContinuation { continuation in
                registrationWaiters[key, default: []].append(continuation)
            }
        }
        calls.append(key)
        active += 1
        peak = max(peak, active)

        await withCheckedContinuation { continuation in
            gates[key] = continuation
            resumeGateWaiters(for: key)
            resumeCallWaiters()
        }
        active -= 1

        switch answers[key] ?? .draft {
        case .draft:
            return .draft(PurchaseReadingViewModelTests.reading)
        case .unreadable(let reason):
            return .unreadable(receiptCount: 1, reason: reason)
        case .failure(let error):
            throw error
        case .cancelled:
            throw CancellationError()
        }
    }

    internal func saveDraft(_ payload: ReceiptDraftSavePayload) async throws -> ReceiptPurchase {
        throw RepositoryError.dependencyNotBound
    }

    internal func createManualPurchase(_ payload: ReceiptManualPurchasePayload) async throws
        -> ReceiptPurchase
    {
        throw RepositoryError.dependencyNotBound
    }

    internal func waitForCallCount(_ count: Int) async {
        guard calls.count < count else { return }
        await withCheckedContinuation { continuation in
            callWaiters.append((count, continuation))
        }
    }

    internal func waitForGate(_ key: UInt8) async {
        guard gates[key] == nil else { return }
        recordFinishDecision(.exactGateWait, for: key)
        await withCheckedContinuation { continuation in
            gateWaiters[key, default: []].append(continuation)
        }
    }

    internal func release(_ key: UInt8) {
        let gate = gates.removeValue(forKey: key)
        if gate == nil { recordFinishDecision(.missedRelease, for: key) }
        gate?.resume()
    }

    internal func allowRegistration(_ key: UInt8) {
        heldRegistrations.remove(key)
        for waiter in registrationWaiters.removeValue(forKey: key) ?? [] {
            waiter.resume()
        }
    }

    internal func waitForFinishDecision(_ key: UInt8) async -> FinishDecision {
        if let decision = finishDecisions[key] { return decision }
        return await withCheckedContinuation { continuation in
            finishDecisionWaiters[key, default: []].append(continuation)
        }
    }

    internal func peakConcurrency() -> Int { peak }
    /// Called keys in ascending order: concurrent reads reach the repository in no fixed order.
    internal func calledKeys() -> [UInt8] { calls.sorted() }

    private func resumeCallWaiters() {
        let ready = callWaiters.filter { calls.count >= $0.0 }
        callWaiters.removeAll { calls.count >= $0.0 }
        for waiter in ready { waiter.1.resume() }
    }

    private func resumeGateWaiters(for key: UInt8) {
        for waiter in gateWaiters.removeValue(forKey: key) ?? [] { waiter.resume() }
    }

    private func recordFinishDecision(_ decision: FinishDecision, for key: UInt8) {
        guard finishDecisions[key] == nil else { return }
        finishDecisions[key] = decision
        for waiter in finishDecisionWaiters.removeValue(forKey: key) ?? [] {
            waiter.resume(returning: decision)
        }
    }
}

internal enum FinishDecision: Sendable {
    case exactGateWait
    case missedRelease
}
