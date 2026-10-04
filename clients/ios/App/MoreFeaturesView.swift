import AppCore
import SwiftUI

internal struct MoreFeaturesView<Destination: View>: View {
    internal let features: [MobileFeature]
    internal let onSelectionChange: (MobileFeature?) -> Void
    @ViewBuilder internal let destination: (MobileFeature) -> Destination
    @State private var selected: MobileFeature?

    internal init(
        features: [MobileFeature],
        onSelectionChange: @escaping (MobileFeature?) -> Void,
        @ViewBuilder destination: @escaping (MobileFeature) -> Destination
    ) {
        self.features = features
        self.onSelectionChange = onSelectionChange
        self.destination = destination
    }

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
        .onChange(of: selected, initial: true) { _, selection in
            onSelectionChange(selection)
        }
    }
}
