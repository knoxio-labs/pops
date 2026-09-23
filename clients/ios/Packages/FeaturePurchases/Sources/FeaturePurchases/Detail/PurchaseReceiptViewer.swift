import AppCore
import DesignSystem
import SwiftUI

internal struct PurchaseReceiptSelection: Identifiable, Hashable, Sendable {
    internal let index: Int
    internal var id: Int { index }
}

internal struct PurchaseReceiptViewer: View {
    internal let detail: PurchaseDetail
    internal let initialIndex: Int
    internal let model: PurchaseDetailViewModel

    @Environment(\.dismiss) private var dismiss

    internal var body: some View {
        ZStack {
            Color.popsBackground.ignoresSafeArea()
            PopsPagedPhotoViewer(
                images: model.receiptImages(for: detail),
                initialIndex: initialIndex,
                placeholderSymbol: "doc.text.viewfinder"
            ) { index in
                Task { await model.openReceipt(at: index) }
            }
        }
        .safeAreaInset(edge: .top) {
            HStack {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                        .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                }
                .popsGlass(in: Circle())
                .accessibilityLabel("Close")
                .accessibilityIdentifier(PurchaseDetailAccessibility.viewerClose)
                Spacer(minLength: PopsSpacing.zero)
            }
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.sm)
        }
    }
}
