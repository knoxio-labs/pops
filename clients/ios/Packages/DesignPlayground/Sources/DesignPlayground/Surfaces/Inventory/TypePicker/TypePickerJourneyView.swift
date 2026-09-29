import DesignSystem
import SwiftUI

internal struct TypePickerJourneyView: View {
    let approach: TypePickerApproach
    let opening: TypePickerOpening
    @State private var session = TypePickerSession()
    @State private var editing = false
    @State private var prepared = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        session.resetDraft()
                        editing = true
                    } label: {
                        Label("New item", systemImage: "plus")
                            .frame(minHeight: PopsSize.touchTarget)
                    }
                } footer: {
                    Text("Try a cushion cover, then its cushion. Photos and saves are simulated.")
                }
                if approach == .context, let last = session.saved.last {
                    Section("After \(last.name)") {
                        ForEach(TypePickerTaxonomy.suggested(after: last.typeID)) { node in
                            Button("Add \(node.name.lowercased())") {
                                session.startRelated(node.id)
                                editing = true
                            }
                            .frame(minHeight: PopsSize.touchTarget)
                        }
                    }
                }
                Section("Added this session · \(session.saved.count)") {
                    if session.saved.isEmpty {
                        Text("Your two items will appear here.")
                            .foregroundStyle(Color.popsMutedForeground)
                    }
                    ForEach(session.saved) { item in
                        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                            Text(item.name).font(.popsHeadline)
                            Text(
                                item.typeID.flatMap(TypePickerTaxonomy.node)?.name ?? "No type yet")
                            Text("\(item.photoCount) sample photos · \(item.location)")
                                .font(.popsCaption)
                                .foregroundStyle(Color.popsMutedForeground)
                        }
                    }
                }
            }
            .playgroundInsetGroupedList()
            .navigationTitle("Inventory")
            .navigationDestination(isPresented: $editing) {
                TypePickerDraftView(
                    session: session, approach: approach, opening: opening,
                    finish: { editing = false })
            }
        }
        .tint(.popsInventory)
        .onAppear(perform: prepare)
    }

    private func prepare() {
        guard !prepared else { return }
        prepared = true
        switch opening {
        case .start: break
        case .cover, .noMatch, .noSuggestion:
            session.name = "Linen cushion cover"
            session.capturePhoto()
            editing = true
        case .next:
            session.name = "Linen cushion cover"
            session.typeID = "cushion-cover"
            session.capturePhoto()
            _ = session.save()
            editing = true
        }
    }
}
