import DesignSystem
import SwiftUI

/// The four moments after an update ships a type.
internal enum InventoryArrivalStep: String, CaseIterable, Identifiable {
    case arrived
    case batch
    case applied
    case changed

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .arrived: "A type arrived"
        case .batch: "Reviewing the matches"
        case .applied: "After the review"
        case .changed: "A type that changed"
        }
    }
}

internal struct InventoryTypeArrivalView: View {
    internal let step: InventoryArrivalStep

    @ViewBuilder internal var body: some View {
        switch step {
        case .arrived: InventoryArrivalNoticeView()
        case .batch: InventoryArrivalBatchView()
        case .applied: InventoryArrivalAppliedView()
        case .changed: InventoryTypeChangedView()
        }
    }
}

/// What the phone does the first time it opens after a type shipped.
///
/// The three answers differ in who acts, and the difference is not cosmetic: a
/// silent match types eleven things nobody looked at, and a batch review makes
/// the update the person's work. The notice is the same length in all three so
/// the comparison is about the claim rather than about the prose.
internal struct InventoryArrivalNoticeView: View {
    @Environment(\.inventoryUntypedStyle) private var style
    private let type = InventoryUntypedFixtures.bagType

    private var covered: [InventoryUntypedItem] {
        InventoryTypeArrival.covered(by: type, in: InventoryUntypedFixtures.all)
    }

    internal var body: some View {
        List {
            Section {
                PopsStatusHeader(
                    tone: style.arrival == .silent ? .success : .information,
                    title: "\(type.name) arrived in \(type.arrivedIn)",
                    message: message,
                    caption: InventoryTypeArrival.summary(
                        covered: covered.count,
                        waiting: InventoryWaitingQueue.waiting(in: InventoryUntypedFixtures.all)
                            .count))
            }
            Section {
                ForEach(covered) { InventoryUntypedRow(entry: $0, showsNote: true) }
            } header: {
                Text(listHeader)
            } footer: {
                Text("The camera tripod matched on its note, not its name.")
            }
            Section { action }
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
    }

    private var message: String {
        switch style.arrival {
        case .silent:
            "They are on the Bag type now, with its four fields empty. Nothing was asked and each "
                + "one can be changed."
        case .prompt:
            "Nothing has changed yet. Reviewing them is three taps; ignoring this leaves them "
                + "waiting."
        case .batchReview:
            "They are waiting on this screen until you go through them. Nothing else is chasing "
                + "them."
        }
    }

    private var listHeader: String {
        style.arrival == .silent ? "Typed by the update" : "What it would cover"
    }

    @ViewBuilder private var action: some View {
        switch style.arrival {
        case .silent:
            InventoryUntypedChoiceRow(
                title: "Put them back", detail: "Returns all three to waiting.", symbol: .restore,
                isPreferred: false)
        case .prompt:
            InventoryUntypedChoiceRow(
                title: "Review the three", detail: "One screen, accept or skip each.",
                symbol: .update, isPreferred: true)
            InventoryUntypedChoiceRow(
                title: "Not now", detail: "They stay waiting and this is not asked again.",
                symbol: .waiting, isPreferred: false)
        case .batchReview:
            InventoryUntypedChoiceRow(
                title: "Start", detail: "Accept or skip each of the three.", symbol: .update,
                isPreferred: true)
        }
    }
}
