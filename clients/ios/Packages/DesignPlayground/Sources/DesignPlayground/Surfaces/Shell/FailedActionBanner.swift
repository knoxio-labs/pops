import DesignSystem
import SwiftUI

internal struct FailedActionBanner: View {
    internal let error: PresentedError
    internal let openDetails: () -> Void
    @State private var isVisible = true

    internal var body: some View {
        if isVisible {
            HStack(alignment: .top, spacing: PopsSpacing.md) {
                Button(action: openDetails) {
                    HStack(alignment: .top, spacing: PopsSpacing.md) {
                        Image(systemName: "xmark.octagon.fill")
                            .font(.popsHeadline)
                            .foregroundStyle(Color.popsDestructive)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                            Text(error.message)
                                .font(.popsBody)
                                .foregroundStyle(Color.popsForeground)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(error.code)
                                .font(.popsMonospacedCaption)
                                .foregroundStyle(Color.popsMutedForeground)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                        Spacer(minLength: PopsSpacing.xs)
                        Image(systemName: "chevron.right")
                            .font(.popsCaption.weight(.semibold))
                            .foregroundStyle(Color.popsMutedForeground)
                            .accessibilityHidden(true)
                    }
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityHint("Shows error details")

                if error.bannerLifetime == .untilDismissed {
                    Button {
                        isVisible = false
                    } label: {
                        Image(systemName: "xmark")
                            .font(.popsBody)
                            .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                            .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Color.popsMutedForeground)
                    .accessibilityLabel("Dismiss error")
                }
            }
            .padding(PopsSpacing.md)
            .playgroundGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.top, PopsSpacing.sm)
        }
    }
}

internal struct FailedActionStage: View {
    internal let error: PresentedError
    @State private var detail: PresentedError?

    internal var body: some View {
        ShellContentView(degradation: .none)
            .overlay(alignment: .top) {
                FailedActionBanner(error: error) {
                    detail = error
                }
            }
            .sheet(item: $detail) { error in
                NavigationStack {
                    ErrorDetailSheet(error: error)
                }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
    }
}
