import DesignSystem
import SwiftUI

/// A catalogue repair's commits (owner decision 2026-09-24): Let go always;
/// Edit item leading while something still stops the change; Retry only once
/// the fields changed since the repair opened, leading when nothing stops it
/// any more.
internal struct InventoryCatalogueCommits: View {
    internal let change: InventoryCatalogueChange
    internal let letGo: String
    /// Commits the repair: true keeps this phone's change (Retry).
    internal let commit: (Bool) -> Void
    internal let editItem: () -> Void

    internal var body: some View {
        PlaygroundGlassGroup(spacing: PopsSpacing.md) {
            HStack(spacing: PopsSpacing.md) {
                Button {
                    commit(false)
                } label: {
                    title(letGo)
                }
                .playgroundGlassButton()
                if change.offersRetry, change.leadingAction == .editItem {
                    Button {
                        commit(true)
                    } label: {
                        title("Retry")
                    }
                    .playgroundGlassButton()
                }
                switch change.leadingAction {
                case .editItem:
                    Button(action: editItem) { title("Edit item") }
                        .playgroundProminentGlassButton()
                case .retry:
                    Button {
                        commit(true)
                    } label: {
                        title("Retry")
                    }
                    .playgroundProminentGlassButton()
                }
            }
        }
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.bottom, PopsSpacing.sm)
        .tint(.popsInventory)
    }

    private func title(_ text: String) -> some View {
        Text(text)
            .font(.popsHeadline)
            .lineLimit(1)
            .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
    }
}
