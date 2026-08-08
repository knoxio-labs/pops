import AppCore
import Auth
import BFMClient
import DesignSystem
import FeatureTransactions
import SwiftUI

/// The app target is the only place that imports every module, and this view is
/// the only thing asserting they all link. The real session-routing root
/// replaces it (POPS-1391).
struct PlaceholderView: View {
    private let linkedModules = [
        Auth.moduleName,
        BFMClient.moduleName,
        DesignSystem.moduleName,
        FeatureTransactions.moduleName,
    ]

    var body: some View {
        List {
            Section("AppCore") {
                Text(String(describing: SessionState.unpaired))
                    .font(.body.monospaced())
                Text(String(describing: FeatureTransactions.entryRoute))
                    .font(.body.monospaced())
            }
            Section("Modules") {
                ForEach(linkedModules, id: \.self) { module in
                    Text(module)
                        .font(.body.monospaced())
                }
            }
        }
    }
}

#Preview {
    PlaceholderView()
}
