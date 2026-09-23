import SwiftUI

extension View {
    @ViewBuilder
    internal func popsPagedPhotoStyle() -> some View {
        #if os(iOS)
            tabViewStyle(.page)
        #else
            self
        #endif
    }
}
