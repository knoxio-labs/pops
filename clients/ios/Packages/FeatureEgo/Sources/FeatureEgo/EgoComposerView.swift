import DesignSystem
import SwiftUI

/// The fixed composer for an Ego conversation thread.
@MainActor
internal struct EgoComposerView: View {
    @Bindable internal var model: EgoThreadModel
    internal let isSendAvailable: Bool

    internal init(model: EgoThreadModel, isSendAvailable: Bool = true) {
        self.model = model
        self.isSendAvailable = isSendAvailable
    }

    private var isStreaming: Bool {
        guard let turn = model.turn else { return false }
        if case .streaming = turn.phase { return true }
        return false
    }

    private var isActionDisabled: Bool {
        guard !isStreaming else { return false }
        return !isSendAvailable
            || model.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: PopsSpacing.sm) {
            TextField("Message Ego", text: $model.draft, axis: .vertical)
                .font(.popsBody)
                .foregroundStyle(Color.popsForeground)
                .tint(Color.popsAccent)
                .lineLimit(1...5)
                .padding(.vertical, PopsSpacing.sm)
                .accessibilityLabel("Message Ego")
                .accessibilityIdentifier(EgoComposerAccessibility.input)

            Button(action: submit) {
                Image(systemName: isStreaming ? "stop.fill" : "arrow.up")
                    .font(.popsSubheadline.weight(.semibold))
                    .foregroundStyle(isStreaming ? Color.popsDestructive : Color.popsBackground)
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                    .background(
                        isStreaming ? Color.popsSurface : Color.popsAccent,
                        in: Circle()
                    )
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .disabled(isActionDisabled)
            .accessibilityLabel(isStreaming ? "Stop response" : "Send message")
            .accessibilityIdentifier(EgoComposerAccessibility.action)
        }
        .padding(.horizontal, PopsSpacing.md)
        .padding(.vertical, PopsSpacing.sm)
        .background(Color.popsBackground)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(Color.popsSeparator)
                .frame(height: PopsBorder.hairline)
        }
    }

    private func submit() {
        if isStreaming {
            model.cancel()
        } else {
            model.send()
        }
    }
}

private enum EgoComposerAccessibility {
    static let input = "ego-composer-input"
    static let action = "ego-composer-action"
}
