import DesignSystem
import SwiftUI

internal struct TypePickerDraftView: View {
    @Bindable var session: TypePickerSession
    let approach: TypePickerTreeMode
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
            }
            if session.typeID == nil {
                TypePickerAssistSection(session: session, browse: { picking = true })
            }
            Section {
                TextField("Name", text: $session.name)
                TextField("Location", text: $session.location)
            } footer: {
                Text("Only a name is required. Each item gets its own photos.")
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
        .toolbar {
            ToolbarItemGroup(placement: .confirmationAction) {
                Button {
                    if session.save() { finish() }
                } label: {
                    Image(systemName: "checkmark")
                }
                .accessibilityLabel("Create")
                .disabled(session.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .playgroundProminentGlassButton()
                Button {
                    _ = session.save(keepingType: true)
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Create another")
                .disabled(session.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
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
                session: session, mode: approach,
                initialQuery: opening == .noMatch ? "ceramic unicorn" : "",
                expanded: opening == .expanded
            ) { id in
                session.typeID = id
                picking = false
            }
        }
        .task(id: session.photoRequestID) {
            guard let requestID = session.photoRequestID else { return }
            guard !Task.isCancelled else { return }
            session.completePhotoSuggestion(
                requestID: requestID, available: opening != .noSuggestion)
        }
        .onAppear {
            if [.tree, .expanded, .selected, .noMatch].contains(opening) && !openedPicker {
                openedPicker = true
                picking = true
            }
        }
    }
}
