import DesignSystem
import SwiftUI

/// A catalogue repair's commits, as the owner approved them (POPS-4494): Let
/// go always; Edit item leading while something still stops the change;
/// Retry only once the fields changed since the repair opened, leading when
/// nothing stops it any more.
internal struct InventoryCatalogueRepairCommits: View {
    internal let detail: InventoryCatalogueRepairDetail
    internal let letGo: () -> Void
    internal let retry: () -> Void
    internal let editItem: () -> Void

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            Button(action: letGo) { title("Let go") }
                .buttonStyle(.bordered)
            if detail.offersRetry, detail.leadingAction == .editItem {
                Button(action: retry) { title("Retry") }
                    .buttonStyle(.bordered)
            }
            switch detail.leadingAction {
            case .editItem:
                Button(action: editItem) { title("Edit item") }
                    .popsProminentGlassButton()
            case .retry:
                Button(action: retry) { title("Retry") }
                    .popsProminentGlassButton()
            }
        }
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.bottom, PopsSpacing.sm)
        .tint(.popsInventory)
        .background(.bar)
    }

    private func title(_ text: String) -> some View {
        Text(text)
            .font(.popsHeadline)
            .lineLimit(1)
            .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
    }
}
