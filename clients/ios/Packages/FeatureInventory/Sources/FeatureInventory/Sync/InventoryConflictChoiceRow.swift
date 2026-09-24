import AppCore
import DesignSystem
import SwiftUI

/// One side of a conflict as a row to pick: its value over where it came
/// from and when, with the selection mark trailing.
internal struct InventoryConflictChoiceRow: View {
    internal let option: InventoryRepairOption
    internal let isChosen: Bool
    internal let isLocked: Bool
    internal let onChoose: () -> Void

    internal var body: some View {
        Button(action: onChoose) {
            HStack(spacing: PopsSpacing.md) {
                Image(systemName: sourceSymbol)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(option.value)
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("\(sourceTitle) · \(InventoryRelativeTime.text(option.at))")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                Spacer(minLength: PopsSpacing.sm)
                Image(systemName: isChosen ? "checkmark.circle.fill" : "circle")
                    .font(.popsTitle)
                    .foregroundStyle(isChosen ? Color.popsInventory : Color.popsMutedForeground)
                    .contentTransition(.symbolEffect(.replace))
                    .opacity(isLocked && !isChosen ? 0 : 1)
            }
            .padding(.vertical, PopsSpacing.xs)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(isLocked)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isChosen ? .isSelected : [])
    }

    private var sourceTitle: String {
        switch option.source {
        case .thisDevice: "This phone"
        case .otherDevice(let label): label
        case .web: "Web"
        case .service(let account): account
        case .unrecognised(_, let label): label
        }
    }

    private var sourceSymbol: String {
        switch option.source {
        case .thisDevice: "iphone"
        case .otherDevice: "ipad"
        case .web, .service: "server.rack"
        case .unrecognised: "questionmark.circle"
        }
    }
}
