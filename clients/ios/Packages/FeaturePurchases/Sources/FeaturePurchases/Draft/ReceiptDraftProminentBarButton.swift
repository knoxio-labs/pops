import SwiftUI

extension View {
    /// The commit in a sheet's bar, drawn as the platform's prominent glass so
    /// it reads as the sheet's one call to action. The glass style is
    /// iOS-only; the host toolchain that runs this package's tests stands in
    /// with the bordered prominent one.
    @ViewBuilder
    internal func receiptDraftProminentBarButton() -> some View {
        #if os(iOS)
            buttonStyle(.glassProminent)
        #else
            buttonStyle(.borderedProminent)
        #endif
    }
}
