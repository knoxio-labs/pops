import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchase reading model")
@MainActor
internal struct PurchaseReadingViewModelTests {
    @Test("rows open queued in staged order")
    func initialRows() {
        let model = PurchaseReadingViewModel(receipts: inputs(3), repository: ReadingGate())

        #expect(model.rows.map(\.id) == ["receipt-1", "receipt-2", "receipt-3"])
        #expect(model.rows.allSatisfy { $0.outcome == .queued })
        #expect(model.done == 0)
        #expect(!model.isFinished)
    }

    @Test("five receipts never exceed two concurrent reads")
    func boundedConcurrency() async {
        let repository = ReadingGate()
        let model = PurchaseReadingViewModel(receipts: inputs(5), repository: repository)

        let task = Task { await model.start() }
        await repository.waitForCallCount(2)
        let initialPeak = await repository.peakConcurrency()
        #expect(initialPeak == 2)

        await finish(keys: 1...5, repository: repository, task: task)

        let peak = await repository.peakConcurrency()
        #expect(peak <= 2)
        #expect(model.rows.allSatisfy { $0.outcome.isSettled })
    }

    @Test("drafts, unreadable results and failures settle independently")
    func outcomeMapping() async {
        let repository = ReadingGate(answers: [
            2: .unreadable("The print is blurred."),
            3: .failure(.unavailable),
        ])
        let model = PurchaseReadingViewModel(receipts: inputs(3), repository: repository)

        let task = Task { await model.start() }
        await finish(keys: 1...3, repository: repository, task: task)

        #expect(model.rows[0].outcome == .read(Self.reading))
        #expect(model.rows[1].outcome == .unreadable(reason: "The print is blurred."))
        #expect(
            model.rows[2].outcome
                == .unreadable(reason: ReceiptResultCopy.message(for: .unavailable)))
        #expect(model.done == 3)
    }

    @Test("cancellation leaves unstarted rows queued and starts no later calls")
    func cancellation() async {
        let repository = ReadingGate()
        let model = PurchaseReadingViewModel(receipts: inputs(5), repository: repository)

        let task = Task { await model.start() }
        await repository.waitForCallCount(2)
        task.cancel()
        await repository.release(1)
        await repository.release(2)
        await task.value

        let calls = await repository.calledKeys()
        #expect(calls == [1, 2])
        #expect(model.rows.dropFirst(2).allSatisfy { $0.outcome == .queued })
        #expect(!model.isFinished)
    }

    @Test("start is one-shot while active and after completion")
    func oneShotStart() async {
        let repository = ReadingGate()
        let model = PurchaseReadingViewModel(receipts: inputs(3), repository: repository)

        let task = Task { await model.start() }
        await repository.waitForCallCount(2)
        await model.start()
        let activeCalls = await repository.calledKeys()
        #expect(activeCalls == [1, 2])

        await finish(keys: 1...3, repository: repository, task: task)
        await model.start()

        let finalCalls = await repository.calledKeys()
        #expect(finalCalls == [1, 2, 3])
    }

    @Test("finished changes only after every row settles")
    func finishedTransition() async {
        let repository = ReadingGate()
        let model = PurchaseReadingViewModel(receipts: inputs(2), repository: repository)

        let task = Task { await model.start() }
        await repository.waitForCallCount(2)
        #expect(!model.isFinished)

        await repository.release(1)
        await repository.release(2)
        await task.value

        #expect(model.done == 2)
        #expect(model.isFinished)
    }

    nonisolated fileprivate static let reading = ReceiptDraftReading(
        receiptUris: [],
        reconciled: true,
        failures: [],
        extracted: .fake(),
        capture: nil)

    private func inputs(_ count: Int) -> [StagedReceiptForReading] {
        (1...count).map { value in
            StagedReceiptForReading(
                id: "receipt-\(value)",
                parts: [ReceiptPart(mediaType: .jpeg, data: Data([UInt8(value)]))])
        }
    }

    private func finish(
        keys: ClosedRange<UInt8>,
        repository: ReadingGate,
        task: Task<Void, Never>
    ) async {
        for key in keys {
            await repository.waitForCallCount(Int(key))
            await repository.release(key)
        }
        await task.value
    }
}

private actor ReadingGate: ReceiptCaptureRepository {
    internal enum Answer: Sendable {
        case draft
        case unreadable(String)
        case failure(RepositoryError)
    }

    private let answers: [UInt8: Answer]
    private var calls: [UInt8] = []
    private var active = 0
    private var peak = 0
    private var gates: [UInt8: CheckedContinuation<Void, Never>] = [:]
    private var callWaiters: [(Int, CheckedContinuation<Void, Never>)] = []

    internal init(answers: [UInt8: Answer] = [:]) {
        self.answers = answers
    }

    internal func extract(_ parts: [ReceiptPart]) async throws -> ReceiptExtraction {
        let key = parts.first?.data.first ?? 0
        calls.append(key)
        active += 1
        peak = max(peak, active)
        resumeCallWaiters()

        await withCheckedContinuation { continuation in
            gates[key] = continuation
        }
        active -= 1

        switch answers[key] ?? .draft {
        case .draft:
            return .draft(PurchaseReadingViewModelTests.reading)
        case .unreadable(let reason):
            return .unreadable(receiptCount: 1, reason: reason)
        case .failure(let error):
            throw error
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

    internal func release(_ key: UInt8) {
        gates.removeValue(forKey: key)?.resume()
    }

    internal func peakConcurrency() -> Int { peak }
    internal func calledKeys() -> [UInt8] { calls }

    private func resumeCallWaiters() {
        let ready = callWaiters.filter { calls.count >= $0.0 }
        callWaiters.removeAll { calls.count >= $0.0 }
        for waiter in ready { waiter.1.resume() }
    }
}
