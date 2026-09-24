import SwiftUI

extension View {
    /// The inset-grouped list style, which is iOS-only; on the host
    /// toolchain the platform's own default stands in.
    @ViewBuilder
    internal func purchasesInsetGroupedList() -> some View {
        #if os(iOS)
            listStyle(.insetGrouped)
        #else
            self
        #endif
    }

    /// A search field pinned to the navigation bar, which is iOS-only; on
    /// the host toolchain a plain `searchable` stands in.
    @ViewBuilder
    internal func purchasesPinnedSearchable(text: Binding<String>, prompt: String) -> some View {
        #if os(iOS)
            searchable(
                text: text, placement: .navigationBarDrawer(displayMode: .always), prompt: prompt)
        #else
            searchable(text: text, prompt: prompt)
        #endif
    }
}
