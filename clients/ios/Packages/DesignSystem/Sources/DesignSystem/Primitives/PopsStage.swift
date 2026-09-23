import SwiftUI

extension View {
    /// Presents an identifiable full-screen stage on iOS and a sheet on host platforms.
    @ViewBuilder
    public func popsStage<Item: Identifiable, Content: View>(
        item: Binding<Item?>,
        @ViewBuilder content: @escaping (Item) -> Content
    ) -> some View {
        #if os(iOS)
            fullScreenCover(item: item, content: content)
        #else
            sheet(item: item, content: content)
        #endif
    }
}
