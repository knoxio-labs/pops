import DesignSystem
import SwiftUI

/// The trailing chevron on a row that opens something.
internal struct InventoryRowChevron: View {
    internal var body: some View {
        Image(systemName: "chevron.forward")
            .font(.popsCaption.weight(.semibold))
            .foregroundStyle(Color.popsMutedForeground)
            .padding(.trailing, PopsSpacing.sm)
            .accessibilityHidden(true)
    }
}
