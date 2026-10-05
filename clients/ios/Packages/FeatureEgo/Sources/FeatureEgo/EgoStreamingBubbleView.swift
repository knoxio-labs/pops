import DesignSystem
import SwiftUI

/// The assistant bubble for text that is still arriving.
internal struct EgoStreamingBubbleView: View {
    internal let text: String

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(alignment: .center, spacing: PopsSpacing.sm) {
            if text.isEmpty {
                Image(systemName: "ellipsis")
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .symbolEffect(.pulse, isActive: !reduceMotion)
                    .accessibilityHidden(true)
            } else {
                Text(text)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: PopsSpacing.xl)
        }
        .padding(.horizontal, PopsSpacing.md)
        .padding(.vertical, PopsSpacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            Color.popsSurface,
            in: RoundedRectangle(cornerRadius: PopsRadius.card)
        )
        .overlay {
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
    }

    private var accessibilityLabel: String {
        if text.isEmpty {
            return EgoStreamingBubbleCopy.responding
        }
        return "\(EgoStreamingBubbleCopy.responsePrefix) \(text)"
    }
}

private enum EgoStreamingBubbleCopy {
    static let responding = "Ego is responding"
    static let responsePrefix = "Ego response:"
}
