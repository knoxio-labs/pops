import SwiftUI

extension View {
    /// The form's inset-grouped list, which is iOS-only; the host's default
    /// list stands in for `swift test`.
    @ViewBuilder
    internal func inventoryInsetGroupedList() -> some View {
        #if os(iOS)
            listStyle(.insetGrouped)
        #else
            self
        #endif
    }

    /// The one call to action in a navigation bar, as iOS 26's prominent
    /// glass button.
    @ViewBuilder
    internal func inventoryProminentGlassButton() -> some View {
        #if os(iOS)
            buttonStyle(.glassProminent)
        #else
            buttonStyle(.borderedProminent)
        #endif
    }

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
}
