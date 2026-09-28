import AppCore
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

    @Test("finishing waits for the exact gate when later calls arrive out of order")
    func outOfOrderGateRegistration() async {
        let repository = ReadingGate(heldRegistrations: [3])
        let model = PurchaseReadingViewModel(receipts: inputs(5), repository: repository)
        let task = Task { await model.start() }

        await repository.waitForCallCount(2)
        let finishing = Task { await finish(keys: 1...5, repository: repository, task: task) }
        await repository.waitForGate(4)
        let decision = await repository.waitForFinishDecision(3)

        #expect(decision == .exactGateWait)
        await repository.allowRegistration(3)

        if decision == .missedRelease {
            await repository.waitForGate(3)
            await repository.release(3)
        }

        await finishing.value
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
        #expect(model.rows.prefix(2).allSatisfy { $0.outcome == .read(Self.reading) })
        #expect(model.rows.dropFirst(2).allSatisfy { $0.outcome == .queued })
        #expect(!model.isFinished)
    }

    @Test("a read the cancellation interrupted returns to queued, never stuck reading")
    func cancelledReadRequeues() async {
        let repository = ReadingGate(answers: [1: .cancelled, 2: .cancelled])
        let model = PurchaseReadingViewModel(receipts: inputs(3), repository: repository)
        let task = Task { await model.start() }
        await repository.waitForCallCount(2)
        task.cancel()
        await repository.release(1)
        await repository.release(2)
        await task.value

        #expect(model.rows.allSatisfy { $0.outcome == .queued })
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

    nonisolated internal static let reading = ReceiptDraftReading(
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
            await repository.waitForGate(key)
            await repository.release(key)
        }
        await task.value
    }
}
