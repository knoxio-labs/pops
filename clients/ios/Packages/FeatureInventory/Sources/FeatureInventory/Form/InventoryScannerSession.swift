import Observation

@MainActor @Observable
internal final class InventoryScannerSession {
    internal private(set) var showsTextPrompt = false
    internal private(set) var recognizedText: [InventoryRecognizedText] = []
    internal private(set) var processing: Task<Void, Never>?
    private let model: InventoryItemFormModel
    private var acceptedBarcode = false
    private var lastPayload: String?
    private var stopped = false

    internal init(model: InventoryItemFormModel) {
        self.model = model
    }

    internal func updateRecognizedText(_ items: [InventoryRecognizedText]) {
        guard !stopped else { return }
        recognizedText = items
    }

    internal func recognizeBarcodes(
        _ payloads: [String], onFound: @escaping @MainActor () -> Void
    ) {
        guard !stopped, !acceptedBarcode, let payload = payloads.first else { return }
        acceptedBarcode = true
        lastPayload = payload
        processing = Task {
            guard !Task.isCancelled else { return }
            let outcome = await model.handleScannedBarcode(payload)
            guard !Task.isCancelled else { return }
            switch outcome {
            case .found: onFound()
            case .miss: showsTextPrompt = true
            }
        }
    }

    internal var canRetryLookup: Bool {
        guard !stopped, showsTextPrompt,
            case .lookupFailed(let failure) = model.prefillStatus
        else { return false }
        return failure.retryable
    }

    internal func retryLookup(onFound: @escaping @MainActor () -> Void) {
        guard canRetryLookup, let lastPayload else { return }
        acceptedBarcode = false
        showsTextPrompt = false
        recognizeBarcodes([lastPayload], onFound: onFound)
    }

    internal func stop() {
        stopped = true
        processing?.cancel()
        processing = nil
    }
}
