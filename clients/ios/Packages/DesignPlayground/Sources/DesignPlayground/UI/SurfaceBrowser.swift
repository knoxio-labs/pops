import SwiftUI

/// The screens tab: every surface, grouped by area.
///
/// Each area folds away from its header, and a folded area stays folded across
/// launches, so a reviewer working on one pillar is not scrolling past the
/// others every time the app opens.
internal struct SurfaceBrowser: View {
    @State private var staged: DesignSurface?
    @AppStorage("playground.collapsedAreas") private var collapsedStore = ""

    var body: some View {
        NavigationStack {
            List {
                ForEach(Catalog.areas, id: \.self) { area in
                    Section {
                        if !collapsed.contains(area) {
                            ForEach(Catalog.surfaces(in: area)) { surface in
                                Button {
                                    staged = surface
                                } label: {
                                    SurfaceRow(surface: surface)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    } header: {
                        header(for: area)
                    }
                }
            }
            .navigationTitle("Screens")
            .playgroundTitleDisplay(large: true)
        }
        .playgroundStage(item: $staged) { surface in
            StageView(surface: surface)
        }
    }

    private var collapsed: Set<String> {
        Set(collapsedStore.split(separator: ",").map(String.init))
    }

    private func header(for area: String) -> some View {
        let isCollapsed = collapsed.contains(area)
        return Button {
            toggle(area)
        } label: {
            HStack {
                Text(area.capitalized)
                Spacer()
                Text("\(Catalog.surfaces(in: area).count)")
                    .monospacedDigit()
                Image(systemName: "chevron.down")
                    .rotationEffect(.degrees(isCollapsed ? -90 : 0))
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(area.capitalized)
        .accessibilityValue(isCollapsed ? "Collapsed" : "Expanded")
    }

    private func toggle(_ area: String) {
        var next = collapsed
        if next.contains(area) {
            next.remove(area)
        } else {
            next.insert(area)
        }
        withAnimation(.snappy) {
            collapsedStore = next.sorted().joined(separator: ",")
        }
    }
}
