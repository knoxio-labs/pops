import AppCore
import SwiftUI

internal struct MoreFeaturesView: View {
    internal let features: [MobileFeature]
    @Binding internal var selectedFeature: MobileFeature?

    internal init(
        features: [MobileFeature], selectedFeature: Binding<MobileFeature?>
    ) {
        self.features = features
        self._selectedFeature = selectedFeature
    }

    internal var body: some View {
        NavigationStack {
            List(features, id: \.self) { feature in
                Button {
                    selectedFeature = feature
                } label: {
                    Label(RootCopy.name(of: feature), systemImage: RootCopy.symbol(for: feature))
                }
            }
            .navigationTitle(RootCopy.more)
        }
        .onChange(of: features) {
            if let selectedFeature, !features.contains(selectedFeature) {
                self.selectedFeature = nil
            }
        }
    }
}
