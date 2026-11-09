import AppCore
import DesignSystem
import SwiftUI

internal struct TripsDocumentsView: View {
    internal let snapshot: TripSnapshot
    private let repository: any DocumentsReading
    @State private var catalog: TripDocumentCatalogModel

    internal init(snapshot: TripSnapshot, repository: any DocumentsReading) {
        self.snapshot = snapshot
        self.repository = repository
        _catalog = State(initialValue: TripDocumentCatalogModel(repository: repository))
    }

    internal var body: some View {
        List {
            let groups = tripDocumentGroups(snapshot)
            ForEach(groups) { group in
                Section(group.name) {
                    ForEach(group.documentIDs, id: \.self) { id in
                        NavigationLink {
                            TripDocumentDetailView(
                                id: id, snapshot: snapshot, repository: repository)
                        } label: {
                            row(id)
                        }
                    }
                }
            }
            if groups.isEmpty { Text("No Recorded Documents") }
        }
        .task(id: snapshot) {
            await catalog.load(snapshot.documentAssociations.map(\.documentId))
        }
    }

    private func row(_ id: Int) -> some View {
        HStack(alignment: .top, spacing: PopsSpacing.md) {
            Image(systemName: "doc.text.fill").foregroundStyle(Color.popsAccent)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                switch catalog.states[id] {
                case .available(let document):
                    Text(tripDocumentTitle(document)).font(.popsHeadline)
                    if document.originalFileName != tripDocumentTitle(document) {
                        Text(document.originalFileName).font(.popsCaption)
                            .foregroundStyle(Color.popsMutedForeground)
                    }
                    if duplicateIdentity(document) { Text("Document \(id)").font(.popsCaption) }
                case .missing:
                    Text("Document \(id) unavailable").font(.popsHeadline)
                case .failed:
                    Text("Document \(id)").font(.popsHeadline)
                    Text("Metadata could not be loaded").font(.popsCaption).foregroundStyle(
                        Color.popsWarning)
                default:
                    Text("Document \(id)").font(.popsHeadline)
                    ProgressView()
                }
            }
        }
        .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private func duplicateIdentity(_ document: DocumentOriginal) -> Bool {
        catalog.states.contains { id, state in
            guard id != document.id, case .available(let other) = state else { return false }
            return other.title == document.title
                && other.originalFileName == document.originalFileName
        }
    }
}
