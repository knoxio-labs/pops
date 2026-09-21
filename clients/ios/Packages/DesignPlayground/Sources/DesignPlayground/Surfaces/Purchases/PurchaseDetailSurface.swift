import AppCore
import DesignSystem
import SwiftUI

/// One line of a saved purchase, as the mobile detail route returns it.
internal struct PurchaseDetailLine: Identifiable, Hashable {
    internal let id: String
    internal let name: String
    internal let quantity: Int
    internal let lineTotal: MoneyAmount
}

/// A saved purchase, whole.
///
/// Shaped after `GET /mobile/purchases/:id` and not after the pillar's own
/// detail, which returns a great deal more. The mobile route answers with the
/// order, its five component figures, its source, and flat lines of name,
/// quantity and line total: no charges, no finance links, no shipments, no
/// per-line tags or units. So this screen shows what a device can actually ask
/// for, and the absences are the contract's rather than the design's.
internal struct PurchaseDetail: Identifiable, Hashable {
    internal let purchase: Purchase
    internal let subtotal: MoneyAmount
    internal let tax: MoneyAmount
    internal let shipping: MoneyAmount
    internal let discount: MoneyAmount
    internal let surcharge: MoneyAmount
    internal let source: String
    internal let lines: [PurchaseDetailLine]
    internal let pages: [StagedPage]
    /// Set once a person has changed the purchase since it was read.
    internal var edit: PurchaseEdit?

    internal var id: String { purchase.id }
}

/// That a saved purchase was changed by hand, and what it said before.
///
/// The reading is never overwritten in the pillar, so the values a person
/// replaced stay recoverable; this is the part of that record the detail
/// shows.
internal struct PurchaseEdit: Hashable {
    internal let editedOn: Date
    internal let changes: [PurchaseFieldChange]
}

/// One value a person replaced: what was read, and what it says now.
internal struct PurchaseFieldChange: Identifiable, Hashable {
    internal let id: String
    internal let field: String
    internal let original: String
    internal let current: String
}

/// Why a purchase could not be fetched. Kept apart case by case because each
/// asks something different of the reader, and a failure drawn as an empty
/// purchase is a purchase that appears to have nothing in it.
internal enum PurchaseDetailFailure: Hashable {
    /// The phone has no connection.
    case offline
    /// The phone is online and purchases did not answer.
    case unreachable
    /// The purchase no longer exists.
    case notFound
    /// This phone's key does not carry the purchases scope.
    case unauthorized
    /// The route answered in a shape this build cannot read.
    case contractMismatch
}

/// Where the fetch is.
internal enum PurchaseDetailPhase: Hashable {
    case loading
    /// The purchase, and the refresh that failed over it, if one did.
    case loaded(PurchaseDetail, refresh: PurchaseDetailFailure?)
    case failed(PurchaseDetailFailure)
}

/// What a staged detail opens with beyond its record.
internal struct PurchaseDetailStage {
    internal var edit: PurchaseEditStage?
    internal var showsOriginal = false
    /// The purchase as it reads after a successful save.
    internal var afterSave: PurchaseDetail?
    /// What a retry from a failure lands on.
    internal var afterRetry: PurchaseDetail?
}

/// A saved purchase: loading, failed, or on screen.
///
/// The archive pushes it with a detail in hand; the staged states open it in
/// every condition a fetch can leave it.
internal struct PurchaseDetailSurface: View {
    @State private var phase: PurchaseDetailPhase
    private let stage: PurchaseDetailStage
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    internal init(detail: PurchaseDetail) {
        self.init(phase: .loaded(detail, refresh: nil))
    }

    internal init(phase: PurchaseDetailPhase, stage: PurchaseDetailStage = PurchaseDetailStage()) {
        _phase = State(initialValue: phase)
        self.stage = stage
    }

    internal var body: some View {
        Group {
            switch phase {
            case .loading:
                PurchaseDetailSkeleton()
            case .loaded(let detail, let refresh):
                PurchaseDetailPage(detail: detail, refresh: refresh, stage: stage)
            case .failed(let failure):
                PurchaseDetailFailureView(failure: failure, retry: retry)
            }
        }
        .transition(.opacity)
        .animation(reduceMotion ? nil : InventoryMotion.smooth, value: phase)
        .tint(PurchaseDetailTint.color)
    }

    private func retry() {
        phase = .loading
        guard let landing = stage.afterRetry else { return }
        Task {
            try? await Task.sleep(for: PurchaseDetailTint.beat)
            phase = .loaded(landing, refresh: nil)
        }
    }
}

/// The purchases family's one tint, held in one place. `popsAccent` until the
/// family has a token of its own.
internal enum PurchaseDetailTint {
    internal static let color = Color.popsAccent
    /// How long a staged network round trip takes, so its motion is visible.
    internal static let beat = Duration.milliseconds(900)
}
