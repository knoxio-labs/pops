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
                if session.typeID != nil {
                    Button("No type yet") { session.typeID = nil }
                        .frame(minHeight: PopsSize.touchTarget)
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
            await Task.yield()
            guard !Task.isCancelled else { return }
            session.completePhotoSuggestion(
                requestID: requestID, available: opening != .noSuggestion)
        }
        .onAppear {
            if [.tree, .expanded, .noMatch].contains(opening) && !openedPicker {
                openedPicker = true
                picking = true
            }
        }
    }
}
