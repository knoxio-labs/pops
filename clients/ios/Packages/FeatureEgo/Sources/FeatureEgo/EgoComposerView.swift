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

    private var actionState: EgoComposerActionState {
        EgoComposerActionState(
            isStreaming: isStreaming,
            isSendAvailable: isSendAvailable,
            draft: model.draft)
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: PopsSpacing.sm) {
            TextField("Ask Ego anything…", text: $model.draft, axis: .vertical)
                .font(.popsBody)
                .foregroundStyle(Color.popsForeground)
                .tint(Color.popsAccent)
                .lineLimit(1...5)
                .padding(.vertical, PopsSpacing.sm)
                .padding(.leading, PopsSpacing.md)
                .accessibilityLabel("Message Ego")
                .accessibilityIdentifier(EgoComposerAccessibility.input)

            Button(action: submit) {
                Image(systemName: actionState.action == .stop ? "stop.fill" : "arrow.up")
                    .font(.popsSubheadline.weight(.semibold))
                    .foregroundStyle(
                        actionState.action == .stop
                            ? Color.popsDestructive
                            : Color.popsBackground
                    )
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                    .background(
                        actionState.action == .stop ? Color.popsSurface : Color.popsAccent,
                        in: Circle()
                    )
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .disabled(actionState.isDisabled)
            .accessibilityLabel(actionState.action == .stop ? "Stop response" : "Send message")
            .accessibilityIdentifier(EgoComposerAccessibility.action)
        }
        .padding(.trailing, PopsSpacing.xs)
        .padding(.vertical, PopsSpacing.xs)
        .background(Color.popsSurface, in: Capsule())
        .overlay {
            Capsule().stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
        }
        .popsGlass(in: Capsule())
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.vertical, PopsSpacing.md)
        .background(Color.popsBackground)
    }

    private func submit() {
        switch actionState.action {
        case .stop:
            model.cancel()
        case .send:
            model.send()
        }
    }
}

internal struct EgoComposerActionState: Equatable {
    internal enum Action: Equatable {
        case send
        case stop
    }

    internal let action: Action
    internal let isDisabled: Bool

    internal init(isStreaming: Bool, isSendAvailable: Bool, draft: String) {
        action = isStreaming ? .stop : .send
        isDisabled =
            !isStreaming
            && (!isSendAvailable || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }
}

private enum EgoComposerAccessibility {
    static let input = "ego-composer-input"
    static let action = "ego-composer-action"
}
