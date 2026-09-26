import DesignSystem
import SwiftUI

internal struct InventoryCodeSuggestionToast: View {
    internal let failure: InventoryCodeSuggestionFailure
    internal let retry: () -> Void
    internal let dismiss: () -> Void

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text("Couldn’t suggest a code")
                .font(.popsSubheadline.weight(.semibold))
            Text(failure.message)
                .font(.popsSubheadline)
            Text(failure.rawValue)
                .font(.popsCaption)
                .textSelection(.enabled)
            HStack {
                Button("Retry", action: retry)
                    .frame(minHeight: PopsSize.touchTarget)
                ShareLink("Share error", item: failure.report)
                    .frame(minHeight: PopsSize.touchTarget)
                Spacer()
                Button("Dismiss", action: dismiss)
                    .frame(minHeight: PopsSize.touchTarget)
            }
            .font(.popsSubheadline.weight(.semibold))
            .buttonStyle(.borderless)
            .frame(minHeight: PopsSize.touchTarget)
        }
        .foregroundStyle(Color.popsForeground)
        .padding(PopsSpacing.lg)
        .popsGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.bottom, PopsSpacing.sm)
    }
}
