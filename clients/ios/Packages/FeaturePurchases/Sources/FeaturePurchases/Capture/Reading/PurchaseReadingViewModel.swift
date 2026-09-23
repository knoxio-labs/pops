import AppCore
import Observation

/// Reads a staged batch in order with a bounded number of repository calls in flight.
@MainActor @Observable
internal final class PurchaseReadingViewModel {
    internal private(set) var rows: [PurchaseReadingRow]

    private let repository: any ReceiptCaptureRepository
    private let maxInFlight: Int
    private var started = false

    internal init(
        receipts: [StagedReceiptForReading],
        repository: any ReceiptCaptureRepository,
        maxInFlight: Int = 2
    ) {
        rows = receipts.map {
            PurchaseReadingRow(id: $0.id, parts: $0.parts, outcome: .queued)
        }
        self.repository = repository
        self.maxInFlight = max(1, maxInFlight)
    }

    internal var done: Int { rows.count { $0.outcome.isSettled } }
    internal var isFinished: Bool { done == rows.count }

    internal func start() async {
        guard !started else { return }
        started = true
        guard !rows.isEmpty, !Task.isCancelled else { return }

        await withTaskGroup(of: ReadingCompletion.self) { group in
            var nextIndex = 0

            while nextIndex < min(maxInFlight, rows.count) {
                schedule(nextIndex, in: &group)
                nextIndex += 1
            }

            while let completion = await group.next() {
                rows[completion.index].outcome = outcome(for: completion.result)

                guard !Task.isCancelled, nextIndex < rows.count else { continue }
                schedule(nextIndex, in: &group)
                nextIndex += 1
            }
        }
    }

    private func schedule(
        _ index: Int,
        in group: inout TaskGroup<ReadingCompletion>
    ) {
        rows[index].outcome = .reading
        let parts = rows[index].parts
        let repository = repository
        group.addTask {
            let result = await Self.read(parts, from: repository)
            return ReadingCompletion(index: index, result: result)
        }
    }

    private func outcome(for result: ReadingResult) -> PurchaseReadingRow.Outcome {
        switch result {
        case .extracted(.draft(let reading)):
            return .read(reading)
        case .extracted(.unreadable(_, let reason)):
            return .unreadable(reason: reason)
        case .failed(let error):
            return .unreadable(reason: ReceiptResultCopy.message(for: error))
        case .cancelled:
            return .queued
        }
    }

    nonisolated private static func read(
        _ parts: [ReceiptPart],
        from repository: any ReceiptCaptureRepository
    ) async -> ReadingResult {
        do {
            return .extracted(try await repository.extract(parts))
        } catch {
            if error is CancellationError || Task.isCancelled { return .cancelled }
            return .failed(RepositoryError.describing(error))
        }
    }
}

private struct ReadingCompletion: Sendable {
    let index: Int
    let result: ReadingResult
}

private enum ReadingResult: Sendable {
    case extracted(ReceiptExtraction)
    case failed(RepositoryError)
    case cancelled
}
