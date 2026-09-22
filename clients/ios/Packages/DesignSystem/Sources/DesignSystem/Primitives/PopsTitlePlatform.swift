import SwiftUI

extension View {
    /// Sets the navigation title's display mode, which is an iOS-only
    /// modifier.
    @ViewBuilder
    public func popsTitleDisplay(large: Bool) -> some View {
        #if os(iOS)
            navigationBarTitleDisplayMode(large ? .large : .inline)
        #else
            self
        #endif
    }
}
