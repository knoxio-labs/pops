import AppCore

/// A ``ReceiptCaptureRepository`` backed by canned answers, so a feature's
/// tests never stub a URL protocol.
///
/// An actor rather than a locked class, matching
/// ``InMemoryTransactionsRepository`` — the call counts are what a
/// duplicate-submission bug would be caught with, and they have to still be
/// right under concurrent calls.
public actor InMemoryReceiptCaptureRepository: ReceiptCaptureRepository {
    public private(set) var extractCallCount = 0
    /// Every `extract` call's parts, in call order — a test asserting what
    /// was sent needs more than a count.
    public private(set) var extracted: [[ReceiptPart]] = []
    public private(set) var savedDrafts: [ReceiptDraftSavePayload] = []
    public private(set) var manualPurchases: [ReceiptManualPurchasePayload] = []

    private var extractionOutcomes: [Int: ReceiptExtraction]
    private var extractionFailures: [Int: RepositoryError] = [:]
    private let defaultExtraction: ReceiptExtraction

    private var saveResult: Result<ReceiptPurchase, RepositoryError>
    private var manualResult: Result<ReceiptPurchase, RepositoryError>

    /// - Parameters:
    ///   - defaultExtraction: answered when an `extract` call has no entry in
    ///     `extractionOutcomes` and was not told to fail.
    ///   - extractionOutcomes: canned answers by call number (1-based).
    ///   - saveResult: answered by every `saveDraft` call.
    ///   - manualResult: answered by every `createManualPurchase` call.
    public init(
        defaultExtraction: ReceiptExtraction = .unreadable(
            receiptCount: 1, reason: "no fixture configured"),
        extractionOutcomes: [Int: ReceiptExtraction] = [:],
        saveResult: Result<ReceiptPurchase, RepositoryError> = .failure(
            .transport("no fixture configured")),
        manualResult: Result<ReceiptPurchase, RepositoryError> = .failure(
            .transport("no fixture configured"))
    ) {
        self.defaultExtraction = defaultExtraction
        self.extractionOutcomes = extractionOutcomes
        self.saveResult = saveResult
        self.manualResult = manualResult
    }

    /// Answers the `call`-th `extract` call (1-based) with `outcome`.
    public func respond(onCall call: Int, with outcome: ReceiptExtraction) {
        extractionOutcomes[call] = outcome
    }

    /// Fails the `call`-th `extract` call (1-based) with `error`.
    public func failExtract(onCall call: Int, with error: RepositoryError) {
        extractionFailures[call] = error
    }

    /// Replaces what every subsequent `saveDraft` call answers.
    public func respondToSave(with result: Result<ReceiptPurchase, RepositoryError>) {
        saveResult = result
    }

    /// Replaces what every subsequent `createManualPurchase` call answers.
    public func respondToManualPurchase(with result: Result<ReceiptPurchase, RepositoryError>) {
        manualResult = result
    }

    public func extract(_ parts: [ReceiptPart]) async throws -> ReceiptExtraction {
        extractCallCount += 1
        extracted.append(parts)
        if let failure = extractionFailures[extractCallCount] { throw failure }
        return extractionOutcomes[extractCallCount] ?? defaultExtraction
    }

    public func saveDraft(_ payload: ReceiptDraftSavePayload) async throws -> ReceiptPurchase {
        savedDrafts.append(payload)
        return try saveResult.get()
    }

    public func createManualPurchase(_ payload: ReceiptManualPurchasePayload) async throws
        -> ReceiptPurchase
    {
        manualPurchases.append(payload)
        return try manualResult.get()
    }
}
