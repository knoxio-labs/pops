import SwiftUI

#if canImport(UIKit)
    import UIKit
#endif

#if os(iOS)
    private final class InventoryKeyboardDismissalAnchorView: UIView {
        var onWindowChange: ((UIWindow?) -> Void)?

        override func didMoveToWindow() {
            super.didMoveToWindow()
            onWindowChange?(window)
        }
    }

    internal final class InventoryKeyboardDismissalCoordinator: NSObject,
        UIGestureRecognizerDelegate
    {
        private weak var hostView: UIView?
        private var recognizer: UITapGestureRecognizer?

        internal func setHostView(_ view: UIView?) {
            guard hostView !== view else { return }
            if let oldHostView = hostView, let recognizer {
                oldHostView.removeGestureRecognizer(recognizer)
            }
            hostView = view
            recognizer = nil
            guard let view else { return }

            let recognizer = UITapGestureRecognizer(
                target: self, action: #selector(dismissKeyboard))
            recognizer.cancelsTouchesInView = false
            recognizer.delegate = self
            view.addGestureRecognizer(recognizer)
            self.recognizer = recognizer
        }

        internal func shouldDismiss(for view: UIView?) -> Bool {
            var current = view
            while let candidate = current {
                if candidate is UITextField || candidate is UITextView { return false }
                current = candidate.superview
            }
            return true
        }

        @objc private func dismissKeyboard() {
            UIApplication.shared.sendAction(
                #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        }

        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch
        )
            -> Bool
        {
            shouldDismiss(for: touch.view)
        }

        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
        ) -> Bool {
            true
        }
    }

    private struct InventoryKeyboardDismissalRepresentable: UIViewRepresentable {
        func makeCoordinator() -> InventoryKeyboardDismissalCoordinator {
            InventoryKeyboardDismissalCoordinator()
        }

        func makeUIView(context: Context) -> InventoryKeyboardDismissalAnchorView {
            let view = InventoryKeyboardDismissalAnchorView()
            view.isUserInteractionEnabled = false
            let coordinator = context.coordinator
            view.onWindowChange = { [weak coordinator] window in coordinator?.setHostView(window) }
            return view
        }

        func updateUIView(_ uiView: InventoryKeyboardDismissalAnchorView, context: Context) {
            context.coordinator.setHostView(uiView.window)
        }

        static func dismantleUIView(
            _ uiView: InventoryKeyboardDismissalAnchorView,
            coordinator: InventoryKeyboardDismissalCoordinator
        ) {
            uiView.onWindowChange = nil
            coordinator.setHostView(nil)
        }
    }
#endif

extension View {
    /// The figures-and-a-point keyboard.
    @ViewBuilder
    internal func inventoryDecimalKeyboard() -> some View {
        #if os(iOS)
            keyboardType(.decimalPad)
        #else
            self
        #endif
    }

    /// Capitals as a code is typed, since codes are printed in capitals.
    @ViewBuilder
    internal func inventoryCodeCapitalization() -> some View {
        #if os(iOS)
            textInputAutocapitalization(.characters).autocorrectionDisabled()
        #else
            autocorrectionDisabled()
        #endif
    }

    @ViewBuilder
    internal func inventoryDismissesKeyboardOnTap() -> some View {
        #if os(iOS)
            background(InventoryKeyboardDismissalRepresentable())
        #else
            self
        #endif
    }
}
