import DesignSystem
import SwiftUI

internal struct InventoryPhotoPlaceholder: View {
    internal let symbol: String

    internal var body: some View {
        Color.popsSurface
            .overlay {
                Image(systemName: symbol)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            .popsShimmer()
            .accessibilityHidden(true)
    }
}
