import SwiftUI

#if canImport(UIKit)
    import UIKit
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
            simultaneousGesture(
                TapGesture().onEnded {
                    UIApplication.shared.sendAction(
                        #selector(UIResponder.resignFirstResponder),
                        to: nil,
                        from: nil,
                        for: nil)
                })
        #else
            self
        #endif
    }
}
