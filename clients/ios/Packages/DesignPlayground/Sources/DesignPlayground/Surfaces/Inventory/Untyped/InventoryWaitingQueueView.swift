import DesignSystem
import SwiftUI

/// The things waiting for a type: whether that is a place, a filter, or
/// nothing at all.
internal enum InventoryWaitingState: String, CaseIterable, Identifiable {
    case full
    case empty
    case kept

    internal var id: String { rawValue }
}

internal struct InventoryWaitingQueueView: View {
    internal let state: InventoryWaitingState
    @Environment(\.inventoryUntypedStyle) private var style

    private var entries: [InventoryUntypedItem] {
        state == .full ? InventoryUntypedFixtures.all : [InventoryUntypedFixtures.sextant]
    }

    internal var body: some View {
        List {
            switch state {
            case .full: fullSections
            case .empty: emptySection
            case .kept: keptOnlySection
            }
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
    }

    @ViewBuilder private var fullSections: some View {
        if style.queue == .filterOnly { filterChips }
        Section {
            ForEach(listed) { entry in
                InventoryUntypedRow(entry: entry, showsNote: true)
            }
        } header: {
            Text(header)
        } footer: {
            InventoryTypeSourceNote(footer)
        }
        if style.queue == .counted { keptSection }
    }

    /// Under the third answer the screen exists only when an update has
    /// covered something, so it lists what the update covered rather than
    /// everything waiting.
    private var listed: [InventoryUntypedItem] {
        style.queue == .onArrival
            ? InventoryTypeArrival.covered(by: InventoryUntypedFixtures.bagType, in: entries)
            : InventoryWaitingQueue.waiting(in: entries)
    }

    /// Browse's own filters, with the one that finds untyped items selected.
    /// Under this answer there is no queue to head, so the count lives on the
    /// chip and nowhere else.
    private var filterChips: some View {
        Section {
            InventoryChipFlow(spacing: PopsSpacing.xs) {
                InventoryPropertyChip("No type · 11", tone: .popsInventory)
                InventoryPropertyChip("In a container")
                InventoryPropertyChip("In hand")
                InventoryPropertyChip("Discarded")
            }
        } header: {
            Text("Browse")
        }
    }

    @ViewBuilder private var keptSection: some View {
        let kept = InventoryWaitingQueue.kept(in: entries)
        if !kept.isEmpty {
            Section {
                ForEach(kept) { InventoryUntypedRow(entry: $0, showsNote: true) }
            } header: {
                Text("Kept untyped · \(kept.count)")
            } footer: {
                Text("Answered rather than waiting. A type arriving does not ask about these.")
            }
        }
    }

    private var emptySection: some View {
        Section {
            EmptyStateView(
                message:
                    "Nothing is waiting for a type. Anything filed without one appears here until "
                    + "an update covers it.")
        }
    }

    private var keptOnlySection: some View {
        Group {
            Section {
                EmptyStateView(message: "Nothing is waiting for a type.")
            }
            keptSection
        }
    }

    private var header: String {
        switch style.queue {
        case .counted: InventoryWaitingQueue.summary(for: entries)
        case .filterOnly: "11 items"
        case .onArrival: "Covered by the 2.4 update · \(listed.count)"
        }
    }

    private var footer: String {
        switch style.queue {
        case .counted:
            "Reachable from the Inventory tab, with its count. Clearing it is an app update, not "
                + "something to do here."
        case .filterOnly:
            "No queue and no count anywhere else. These are found by filtering Browse."
        case .onArrival:
            "Nothing is listed until an update adds a type that covers something. This is that "
                + "moment, not the ordinary state."
        }
    }
}
