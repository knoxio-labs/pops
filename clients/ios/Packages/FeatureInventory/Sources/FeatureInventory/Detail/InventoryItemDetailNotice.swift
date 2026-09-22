import DesignSystem
import SwiftUI

internal struct InventoryItemDetailRetryButton: View {
    internal let retry: () -> Void

    internal var body: some View {
        Button(action: retry) {
            Image(systemName: "arrow.clockwise")
                .font(.popsSubheadline.weight(.semibold))
                .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                .contentShape(.rect)
        }
        .buttonStyle(.borderless)
        .tint(.popsInventory)
        .accessibilityLabel("Retry")
    }
}

/// An inactive item's one line under the facts: the lifecycle word, when,
/// and the reason a discard gave.
internal struct InventoryItemDetailLifecycleNotice: View {
    internal let detail: InventoryItemDetail

    @ViewBuilder internal var body: some View {
        if let change = detail.lifecycleChange, detail.record.lifecycle != .active {
            PopsNotice(
                symbol: change.lifecycle.symbol.system,
                tint: change.lifecycle == .destroyed ? .popsDestructive : .popsMutedForeground,
                text: change.notice()
            )
            .padding(.horizontal, PopsSpacing.lg)
        }
    }
}
