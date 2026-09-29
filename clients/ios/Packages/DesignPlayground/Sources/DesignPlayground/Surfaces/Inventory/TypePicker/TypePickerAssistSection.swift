import DesignSystem
import SwiftUI

internal struct TypePickerAssistSection: View {
    let session: TypePickerSession
    let browse: () -> Void

    var body: some View {
        let related = TypePickerTaxonomy.suggested(after: session.saved.last?.typeID)
        if !related.isEmpty {
            Section("Related to your last item") {
                ForEach(related) { node in
                    Button(node.name) { session.typeID = node.id }
                        .frame(minHeight: PopsSize.touchTarget)
                }
            }
        }
        photoSuggestion
    }

    @ViewBuilder private var photoSuggestion: some View {
        switch session.photoSuggestion {
        case .idle, .dismissed:
            EmptyView()
        case .analysing:
            Section {
                ProgressView("Finding a type…")
            }
        case .unavailable:
            Section {
                Button("Choose a type", action: browse)
                    .frame(minHeight: PopsSize.touchTarget)
            } footer: {
                Text("No suggestion available. You can still choose any type.")
            }
        case .suggested:
            Section {
                let candidates = ["cushion-cover", "cushion"]
                ForEach(candidates.compactMap(TypePickerTaxonomy.node)) { node in
                    Button(node.name) { session.typeID = node.id }
                        .frame(minHeight: PopsSize.touchTarget)
                }
                Button("Dismiss suggestion", action: session.dismissPhotoSuggestion)
                    .frame(minHeight: PopsSize.touchTarget)
            } header: {
                Text("Suggested from photo · demo")
            } footer: {
                Text(
                    "Cover or filled cushion? Confirm the type; nothing is selected automatically.")
            }
        }
    }
}
