import AppCore
import DesignSystem
import SwiftUI

#if canImport(VisionKit) && canImport(UIKit)
    import VisionKit
#endif

internal struct InventoryItemScanButton: View {
    internal let model: InventoryItemFormModel
    @ScaledMetric(relativeTo: .body) private var side = PopsSize.countField
    @State private var isPresented = false
    @State private var authorizing = false

    internal var body: some View {
        Button {
            authorizing = true
        } label: {
            InventorySymbol.scan.image
                .font(.popsTitle)
                .frame(width: side, height: side)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.popsInventory)
        .background(Color.popsSurface, in: RoundedRectangle(cornerRadius: PopsRadius.card))
        .overlay(
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
        )
        .padding(.trailing, PopsSpacing.lg)
        .padding(.vertical, PopsSpacing.sm)
        .accessibilityLabel("Scan barcode or label")
        .accessibilityIdentifier(InventoryAccessibility.itemScan)
        .disabled(authorizing)
        .task(id: authorizing) {
            guard authorizing else { return }
            defer { authorizing = false }
            isPresented = await model.canPresentScanner(camera: SystemCameraAuthorization()) {
                #if canImport(VisionKit) && canImport(UIKit)
                    DataScannerViewController.isSupported && DataScannerViewController.isAvailable
                #else
                    false
                #endif
            }
        }
        .sheet(isPresented: $isPresented) {
            #if canImport(VisionKit) && canImport(UIKit)
                InventoryScannerSheet(model: model)
            #endif
        }
    }
}
