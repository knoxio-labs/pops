import AppCore
import Observation

internal enum PurchaseCaptureSheet: String, Identifiable {
    case batch
    case handEntry

    internal var id: String { rawValue }
}

internal enum PurchaseCaptureRoute: Hashable {
    case reading
    case review
}

@MainActor
@Observable
internal final class PurchaseCaptureFlow {
    internal var sheet: PurchaseCaptureSheet?
    internal var path: [PurchaseCaptureRoute] = []
    internal var picker: PurchaseCapturePicker?
    internal var replacing: String?
    internal var cameraRefusal: CameraRefusal?
    internal var staging: PurchaseStagingModel?
    internal private(set) var reading: PurchaseReadingViewModel?
    internal private(set) var review: PurchaseReviewViewModel?
    internal var handEntry: PurchaseHandEntryViewModel?

    internal let dependencies: AppDependencies
    internal let camera: any CameraAuthorizing
    private let onSaved: ([Purchase.ID]) -> Void
    internal let reportInvalidTransition: (String) -> Void

    internal convenience init(
        dependencies: AppDependencies,
        camera: any CameraAuthorizing = SystemCameraAuthorization(),
        onSaved: @escaping ([Purchase.ID]) -> Void
    ) {
        self.init(
            dependencies: dependencies,
            camera: camera,
            onSaved: onSaved,
            reportInvalidTransition: { assertionFailure($0) })
    }

    internal init(
        dependencies: AppDependencies,
        camera: any CameraAuthorizing = SystemCameraAuthorization(),
        onSaved: @escaping ([Purchase.ID]) -> Void,
        reportInvalidTransition: @escaping (String) -> Void
    ) {
        self.dependencies = dependencies
        self.camera = camera
        self.onSaved = onSaved
        self.reportInvalidTransition = reportInvalidTransition
    }

    internal func read() {
        guard sheet == .batch, path.isEmpty, let staging else {
            invalid("Reading can start only from staging")
            return
        }
        let input = staging.readingInput
        guard !input.isEmpty else {
            invalid("Reading requires at least one staged receipt")
            return
        }
        reading = PurchaseReadingViewModel(
            receipts: input,
            repository: dependencies.receiptCapture)
        path.append(.reading)
    }

    internal func review(rows: [PurchaseReadingRow]) {
        guard sheet == .batch, path.last == .reading, let reading, reading.isFinished else {
            invalid("Review can start only after reading finishes")
            return
        }
        review = PurchaseReviewViewModel(
            entries: ReviewEntry.batch(from: rows),
            dependencies: dependencies)
        path.append(.review)
    }

    internal func finish(savedIDs: [Purchase.ID]) {
        guard review != nil || handEntry != nil else {
            invalid("Finishing requires review or hand entry")
            return
        }
        complete(savedIDs)
    }

    internal func cancel() {
        guard sheet != nil else {
            invalid("Cancelling requires an active capture flow")
            return
        }
        let savedIDs = review?.savedPurchaseIDs ?? handEntry?.savedPurchaseIDs ?? []
        complete(savedIDs)
    }

    private func complete(_ savedIDs: [Purchase.ID]) {
        reset()
        if !savedIDs.isEmpty { onSaved(savedIDs) }
    }

    internal func reset() {
        sheet = nil
        path = []
        picker = nil
        replacing = nil
        cameraRefusal = nil
        staging = nil
        reading = nil
        review = nil
        handEntry = nil
    }

    internal func invalid(_ message: String) {
        reportInvalidTransition(message)
    }
}
