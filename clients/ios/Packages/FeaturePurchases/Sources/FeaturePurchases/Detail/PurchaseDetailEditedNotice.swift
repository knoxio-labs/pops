import AppCore
import DesignSystem
import SwiftUI

internal struct PurchaseDetailEditedNotice: View {
    internal let edit: PurchaseEdit
    internal let showOriginal: () -> Void

    internal var body: some View {
        PopsNotice(
            symbol: "pencil",
            tint: .popsPurchases,
            text: PurchaseDetailCopy.edited(edit.editedAt)
        ) {
            if Self.showsOriginal(edit) {
                Button("Original", action: showOriginal)
                    .font(.popsSubheadline.weight(.semibold))
                    .frame(minHeight: PopsSize.touchTarget)
            }
        }
    }

    internal nonisolated static func showsOriginal(_ edit: PurchaseEdit) -> Bool {
        !edit.changes.isEmpty
    }
}
