import SwiftUI

extension View {
    @ViewBuilder
    internal func purchaseReadingListStyle() -> some View {
        #if os(iOS)
            listStyle(.insetGrouped)
        #else
            self
        #endif
    }
}
