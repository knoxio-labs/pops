import AppCore
import DesignSystem
import SwiftUI

/// How many the record stands for, when that is not one.
internal struct InventoryQuantityBadge: View {
    internal let quantity: InventoryQuantity

    @ViewBuilder internal var body: some View {
        if let badge = quantity.badge {
            Text(badge)
                .font(.popsSubheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(quantity.count < 1 ? Color.popsWarning : Color.popsForeground)
                .accessibilityLabel(quantity.count < 1 ? "None left" : "\(quantity.count) of these")
        }
    }
}

/// A row's sync mark. Synced and saved are silent, so the mark only appears
/// from the quiet tier up: a phone that is working normally shows none.
internal struct InventorySyncMarker: View {
    internal let sync: InventorySync

    @ViewBuilder internal var body: some View {
        if sync.prominence >= .quiet {
            symbol.image
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(tone)
                .symbolEffect(.pulse, isActive: sync == .synchronizing)
                .accessibilityLabel(sync.label)
        }
    }

    private var symbol: InventorySymbol {
        switch sync {
        case .saved, .synchronized: .synced
        case .queued, .synchronizing: .queued
        case .stale: .stale
        case .needsAttention: .attention
        }
    }

    private var tone: Color {
        switch sync.prominence {
        case .silent, .quiet: .popsMutedForeground
        case .visible: .popsWarning
        case .urgent: .popsDestructive
        }
    }
}
