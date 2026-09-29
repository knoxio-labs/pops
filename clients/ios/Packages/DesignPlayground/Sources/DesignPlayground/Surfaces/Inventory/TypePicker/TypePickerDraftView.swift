import DesignSystem
import SwiftUI

internal struct TypePickerDraftView: View {
    @Bindable var session: TypePickerSession
    let approach: TypePickerApproach
    let opening: TypePickerOpening
    let finish: () -> Void
    @State private var picking = false
    @State private var cancelling = false
    @State private var openedPicker = false

    var body: some View {
        Form {
            TypePickerCaptureSection(session: session)
            Section {
                LabeledContent("Type") {
                    Button {
                        picking = true
                    } label: {
                        Text(session.typeID.flatMap(TypePickerTaxonomy.node)?.name ?? "Choose type")
                            .multilineTextAlignment(.trailing)
                            .frame(minHeight: PopsSize.touchTarget)
                    }
                }
                if session.typeID != nil {
                    Button("No type yet") { session.typeID = nil }
                        .frame(minHeight: PopsSize.touchTarget)
                }
            }
            if session.typeID == nil {
                TypePickerSuggestedSection(
                    session: session, approach: approach,
                    unavailable: opening == .noSuggestion,
                    browse: { picking = true })
            }
            Section {
                TextField("Name", text: $session.name)
                TextField("Location", text: $session.location)
            } footer: {
                Text("Only a name is required. Each item gets its own photos.")
            }
            Section {
                Button("Create & add another") { _ = session.save() }
                    .frame(minHeight: PopsSize.touchTarget)
                    .disabled(session.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            } footer: {
                if let last = session.saved.last {
                    Label("Added: \(last.name)", systemImage: "checkmark")
                }
            }
        }
        .playgroundInsetGroupedList()
        .navigationTitle("New item")
        .playgroundTitleDisplay(large: false)
        .navigationBarBackButtonHidden()
        .playgroundLeadingBarItem {
            Button("Cancel") {
                if session.name.isEmpty && session.photoCount == 0 && session.typeID == nil {
                    finish()
                } else {
                    cancelling = true
                }
            }
        }
        .playgroundTrailingBarItem {
            Button("Create") {
                if session.save() { finish() }
            }
            .disabled(session.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .playgroundProminentGlassButton()
        }
        .confirmationDialog("Discard this item?", isPresented: $cancelling) {
            Button("Discard", role: .destructive) {
                session.resetDraft()
                finish()
            }
            Button("Keep editing", role: .cancel) {}
        }
        .navigationDestination(isPresented: $picking) {
            TypePickerChoicesView(
                recentIDs: session.recentTypeIDs, startsBrowsing: approach == .browse,
                initialQuery: opening == .noMatch ? "ceramic unicorn" : "",
                clearRecents: session.clearRecentTypes
            ) { id in
                session.typeID = id
                picking = false
            }
        }
        .onAppear {
            if opening == .noMatch && !openedPicker {
                openedPicker = true
                picking = true
            }
        }
    }
}

internal struct TypePickerSuggestedSection: View {
    let session: TypePickerSession
    let approach: TypePickerApproach
    let unavailable: Bool
    let browse: () -> Void

    var body: some View {
        let suggestions = TypePickerTaxonomy.suggested(after: session.saved.last?.typeID)
        if approach == .context && !suggestions.isEmpty {
            Section("Near your last item") {
                ForEach(suggestions) { node in
                    TypePickerOption(node: node) { session.typeID = node.id }
                }
            }
        } else if approach == .photo && session.photoCount > 0 {
            Section {
                if unavailable {
                    Text("No type suggestion for this photo.")
                    Button("Search all types", action: browse)
                        .frame(minHeight: PopsSize.touchTarget)
                } else {
                    let candidates = ["cushion-cover", "cushion"]
                    ForEach(candidates.compactMap(TypePickerTaxonomy.node)) { node in
                        TypePickerOption(node: node) { session.typeID = node.id }
                    }
                    Button("Neither · search all types", action: browse)
                        .frame(minHeight: PopsSize.touchTarget)
                }
            } header: {
                Text("What is in the photo?")
            } footer: {
                Text(
                    "Staged suggestions, not image recognition. "
                        + "Confirm the removable cover or the filled cushion.")
            }
        }
    }
}
