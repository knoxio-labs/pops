import AppCore
import DesignSystem
import QuickLook
import SwiftUI

internal struct TripDocumentDetailView: View {
    internal let id: Int
    internal let snapshot: TripSnapshot
    @State private var catalog: TripDocumentCatalogModel
    @State private var opener: TripDocumentOpenModel

    internal init(id: Int, snapshot: TripSnapshot, repository: any DocumentsReading) {
        self.id = id
        self.snapshot = snapshot
        _catalog = State(initialValue: TripDocumentCatalogModel(repository: repository))
        _opener = State(initialValue: TripDocumentOpenModel(repository: repository))
    }

    internal var body: some View {
        List {
            switch catalog.states[id] {
            case .available(let document): file(document)
            case .missing: Label("Document unavailable", systemImage: "exclamationmark.triangle")
            case .failed(let error):
                TripDocumentFailureView(failure: error) { Task { await catalog.load([id]) } }
            default: LoadingStateView()
            }
            let associations = snapshot.documentAssociations.filter { $0.documentId == id }
            if !associations.isEmpty {
                Section("Linked To") {
                    ForEach(associations) { association in
                        if let source = tripDocumentSource(association, snapshot: snapshot) {
                            NavigationLink(tripDocumentTarget(association, snapshot: snapshot)) {
                                TripsSourceView(source: source, places: snapshot.places)
                            }
                            .frame(minHeight: PopsSize.touchTarget)
                        } else {
                            Text(tripDocumentTarget(association, snapshot: snapshot)).font(
                                .popsBody)
                        }
                    }
                }
            }
        }
        .navigationTitle(title).popsTitleDisplay(large: false)
        .task(id: id) { await catalog.load([id]) }
        .quickLookPreview($opener.preview)
        .onChange(of: opener.preview) { _, _ in opener.dismissPreview() }
        .onDisappear { if opener.preview == nil { opener.close() } }
    }

    @ViewBuilder private func file(_ document: DocumentOriginal) -> some View {
        Section("File") {
            Text(document.originalFileName).font(.popsBody).textSelection(.enabled)
            if !document.created.isEmpty {
                LabeledContent("Created", value: document.created).font(.popsCaption)
            }
            if opener.opening {
                ProgressView().frame(minHeight: PopsSize.touchTarget)
            } else {
                Button("Open File", systemImage: "doc") { Task { await opener.open(id: id) } }
                    .frame(minHeight: PopsSize.touchTarget)
            }
            if let error = opener.failure {
                TripDocumentFailureView(failure: error) { Task { await opener.open(id: id) } }
            }
        }
    }

    private var title: String {
        if case .available(let document) = catalog.states[id] { return tripDocumentTitle(document) }
        return "Document \(id)"
    }
}
