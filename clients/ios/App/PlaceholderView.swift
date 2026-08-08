import AppCore
import Auth
import BFMClient
import DesignSystem
import FeatureTransactions
import SwiftUI

/// The app target is the only place that imports every module, and this view is
/// the only thing asserting they all link. The real session-routing root
/// replaces it.
struct PlaceholderView: View {
    private let linkedModules = [
        AppCore.moduleName,
        Auth.moduleName,
        BFMClient.moduleName,
        DesignSystem.moduleName,
        FeatureTransactions.moduleName,
    ]

    var body: some View {
        List(linkedModules, id: \.self) { module in
            Text(module)
                .font(.body.monospaced())
        }
    }
}

#Preview {
    PlaceholderView()
}
