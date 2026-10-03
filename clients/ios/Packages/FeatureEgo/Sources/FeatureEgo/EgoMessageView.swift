import AppCore
import DesignSystem
import SwiftUI

/// One transcript text message.
internal struct EgoMessageView: View {
    internal let role: EgoRole
    internal let text: String

    private var isUser: Bool { role == .user }

    var body: some View {
        HStack(alignment: .bottom, spacing: PopsSpacing.md) {
            if isUser {
                Spacer(minLength: PopsSpacing.xl)
            }

            Text(text)
                .font(.popsBody)
                .foregroundStyle(isUser ? Color.popsBackground : Color.popsForeground)
                .multilineTextAlignment(isUser ? .trailing : .leading)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, PopsSpacing.md)
                .padding(.vertical, PopsSpacing.sm)
                .background(
                    isUser ? Color.popsAccent : Color.popsSurface,
                    in: RoundedRectangle(cornerRadius: PopsRadius.card)
                )
                .overlay {
                    if !isUser {
                        RoundedRectangle(cornerRadius: PopsRadius.card)
                            .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
                    }
                }
                .layoutPriority(1)

            if !isUser {
                Spacer(minLength: PopsSpacing.xl)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
    }

    private var accessibilityLabel: String {
        let speaker = isUser ? EgoMessageCopy.userSpeaker : EgoMessageCopy.assistantSpeaker
        return "\(speaker): \(text)"
    }
}

private enum EgoMessageCopy {
    static let userSpeaker = "You"
    static let assistantSpeaker = "Ego"
}
