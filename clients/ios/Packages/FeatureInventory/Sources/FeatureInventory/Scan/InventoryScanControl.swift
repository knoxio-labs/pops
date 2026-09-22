import DesignSystem
import SwiftUI

/// One round glass control over the camera.
internal struct InventoryScanControl: View {
    let symbol: String
    let label: String
    var isOn = false
    let action: () -> Void
    @ScaledMetric(relativeTo: .body) private var size = PopsSize.touchTarget

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.popsBody.weight(.semibold))
                .foregroundStyle(isOn ? Color.popsBackground : Color.popsInventory)
                .contentTransition(.symbolEffect(.replace))
                .frame(width: size, height: size)
                .background {
                    if isOn { Circle().fill(Color.popsInventory) }
                }
                .popsGlass(in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}
