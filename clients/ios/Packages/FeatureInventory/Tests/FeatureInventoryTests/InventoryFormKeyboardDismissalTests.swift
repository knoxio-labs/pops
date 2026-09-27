import Foundation
import Testing

@testable import FeatureInventory

@Suite("Inventory form keyboard dismissal")
internal struct InventoryFormKeyboardDismissalTests {
    private static let formSource: String = {
        let url = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/FeatureInventory/Form/InventoryItemFormView.swift")
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }()

    private static let platformSource: String = {
        let url = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/FeatureInventory/Form/InventoryFormPlatform.swift")
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }()

    @Test("the item form dismisses the keyboard on a tap")
    func formInstallsTapDismissal() {
        #expect(Self.formSource.contains(".inventoryDismissesKeyboardOnTap()"))
    }

    @Test("the iOS tap handler resigns the first responder")
    func tapDismissalResignsFirstResponder() {
        #expect(Self.platformSource.contains("simultaneousGesture"))
        #expect(Self.platformSource.contains("resignFirstResponder"))
    }
}
