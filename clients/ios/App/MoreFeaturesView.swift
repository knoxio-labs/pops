import AppCore
import SwiftUI

internal struct MoreFeaturesView<Destination: View>: View {
    internal let features: [MobileFeature]
    @ViewBuilder internal let destination: (MobileFeature) -> Destination
    @State private var selected: MobileFeature?

    internal var body: some View {
        NavigationStack {
            List(features, id: \.self) { feature in
                Button {
                    selected = feature
                } label: {
                    Label(RootCopy.name(of: feature), systemImage: RootCopy.symbol(for: feature))
                }
            }
            .navigationTitle(RootCopy.more)
        }
        .sheet(
            isPresented: Binding(
                get: { selected != nil },
                set: { if !$0 { selected = nil } }
            )
        ) {
            if let selected, features.contains(selected) {
                destination(selected)
                    .safeAreaInset(edge: .top, alignment: .trailing) {
                        Button(RootCopy.done) { self.selected = nil }
                            .buttonStyle(.bordered)
                            .padding()
                    }
            }
        }
        .onChange(of: features) {
            if let selected, !features.contains(selected) { self.selected = nil }
        }
    }
}
