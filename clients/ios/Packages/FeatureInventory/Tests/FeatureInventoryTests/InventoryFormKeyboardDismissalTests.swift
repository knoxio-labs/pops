import Foundation
import Testing

@testable import FeatureInventory

#if os(iOS)
    import UIKit
#endif

#if os(iOS)
    private enum InventoryKeyboardDismissalViewInspector {
        @MainActor
        static func dismissalRecognizer(in view: UIView) -> UITapGestureRecognizer? {
            view.gestureRecognizers?
                .compactMap { $0 as? UITapGestureRecognizer }
                .first { $0.delegate is InventoryKeyboardDismissalCoordinator }
        }
    }
#endif

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

    @Test("the item form dismisses the keyboard on a tap")
    func formInstallsTapDismissal() {
        #expect(Self.formSource.contains(".inventoryDismissesKeyboardOnTap()"))
    }

    #if os(iOS)
        @MainActor
        @Test("the iOS tap handler leaves text inputs focused and shares control gestures")
        func tapDismissalRespectsInputBoundaries() {
            let coordinator = InventoryKeyboardDismissalCoordinator()
            let hostView = UIView()
            let container = UIView()
            let field = UITextField()
            container.addSubview(field)
            let fieldContent = UIView()
            field.addSubview(fieldContent)
            let control = UIButton()
            let tap = UITapGestureRecognizer()
            let controlGesture = UITapGestureRecognizer()

            coordinator.setHostView(hostView)
            #expect(
                InventoryKeyboardDismissalViewInspector.dismissalRecognizer(in: hostView) != nil)
            #expect(!coordinator.shouldDismiss(for: field))
            #expect(!coordinator.shouldDismiss(for: fieldContent))
            #expect(coordinator.shouldDismiss(for: control))
            #expect(
                coordinator.gestureRecognizer(
                    tap, shouldRecognizeSimultaneouslyWith: controlGesture))
            coordinator.setHostView(nil)
            #expect(
                InventoryKeyboardDismissalViewInspector.dismissalRecognizer(in: hostView) == nil)
        }
    #endif
}
